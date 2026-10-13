// Lógica da Edge Function discover, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'deck', genre? }          → cartões sugeridos para a pessoa (ou só de um gênero)
// { action: 'link', previewId, platform } → link da música na plataforma da pessoa (ou a busca)
// { action: 'audio', previewId }          → prévia renovada (Deezer) ou achada na Deezer (outras plataformas)
// { action: 'albums', query }             → álbuns da Deezer pelo nome (para escolher na review)
// { action: 'album', albumId }            → guarda o álbum escolhido como cartão e devolve o cartão
// { action: 'tracks', query }             → músicas da Deezer pelo nome (favoritas do perfil)
// { action: 'track', trackId }            → guarda a música escolhida como cartão e devolve o cartão
import { readJsonLimited } from '../_shared/body.ts';
import { chartKey, isTrackSourceUrl, isStreamingChoice, LastfmKeyError, platformSearchUrl } from '../_shared/links/charts.ts';
import { checksDeezerGenre, fitsGenre, previewUsable, type Candidate, type DeezerAlbum, type DeezerTrack, type Seeds, type TrackRef } from '../_shared/links/discover.ts';
import type { Platform } from '../_shared/links/platforms.ts';

export const MAX_BODY_BYTES = 2 * 1024;
/** Cartões por pilha. */
export const DECK_SIZE = 15;
/** Sugestões pedidas ao Last.fm por pilha (algumas não estão na Deezer). */
export const CANDIDATES = 40;
/** A prévia da Deezer vence: renova depois de 6 h, ou antes se o link já vence logo (exp). */
export const AUDIO_TTL_MS = 6 * 3600_000;
/** Renova a prévia que vence em menos que isso (a pessoa ainda vai ouvir). */
export const AUDIO_MARGIN_MS = 10 * 60_000;
export const LINKS_TTL_MS = 30 * 86_400_000;
/** Pedidos por pessoa (por minuto). */
export const RATE = { deck: 12, link: 30, audio: 30, albums: 40, album: 20, tracks: 40, track: 20 } as const;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Cartão de música guardado (public.link_previews). */
export interface TrackRow {
  id: string;
  url: string;
  platform: string;
  provider_id: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  image_url: string | null;
  artist_image_url: string | null;
  audio_url: string | null;
  genres: string[] | null;
  store_checked_at: string | null;
  /** Gêneros do álbum na Deezer (null = ainda não conferido). */
  store_genre_ids?: number[] | null;
}

/** Cartão de álbum guardado (o que a review mostra). */
export interface AlbumRow {
  id: string;
  url: string;
  platform: string;
  kind: string;
  title: string;
  artist: string | null;
  image_url: string | null;
  release_year: number | null;
}

/** Cartão de música guardado (favoritas do perfil). */
export interface SongRow {
  id: string;
  url: string;
  platform: string;
  title: string;
  artist: string | null;
  image_url: string | null;
}

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  rateLimit(userId: string, action: keyof typeof RATE): Promise<boolean>;
  /** Gêneros, curtidas e o que a pessoa já viu (por chave e por cartão). */
  seeds(userId: string): Promise<Seeds & { seenPreviewIds: string[] }>;
  /** Sugestões do Last.fm (LastfmKeyError = chave ausente ou recusada). */
  recommend(seeds: Seeds, size: number, onlyGenre: string | null): Promise<Candidate[]>;
  /** Buscas já feitas: chave → cartão (null = procurada e não achada). Chave ausente = nunca procurada. */
  lookup(keys: string[]): Promise<Map<string, TrackRow | null>>;
  findTrack(ref: TrackRef): Promise<DeezerTrack | null | 'quota'>;
  trackById(id: string): Promise<DeezerTrack | null>;
  /** Guarda o que a Deezer achou (ou que não achou) e devolve o cartão. */
  saveTrack(key: string, track: DeezerTrack | null, genre: string | null): Promise<TrackRow | null>;
  /** Gêneros do álbum na Deezer (null = não deu para saber). */
  albumGenres(albumId: string): Promise<number[] | null>;
  /** Guarda os gêneros da Deezer do cartão (para não perguntar de novo). */
  saveGenreIds(previewId: string, ids: number[]): Promise<void>;
  /** Nova prévia da Deezer num cartão que já existia. */
  saveAudio(previewId: string, audioUrl: string | null): Promise<void>;
  getTrack(previewId: string): Promise<TrackRow | null>;
  /** Álbuns da Deezer pelo nome ('quota' = esperar). */
  searchAlbums(query: string): Promise<DeezerAlbum[] | 'quota'>;
  albumById(id: string): Promise<DeezerAlbum | null>;
  /** Guarda o álbum como cartão (link_previews, tipo álbum) e devolve o cartão. */
  saveAlbum(album: DeezerAlbum): Promise<AlbumRow>;
  /** Músicas da Deezer pelo nome ('quota' = esperar). */
  searchTracks(query: string): Promise<DeezerTrack[] | 'quota'>;
  /** Guarda a música como cartão (link_previews, tipo faixa) e devolve o cartão. */
  saveSong(track: DeezerTrack): Promise<SongRow>;
  findLinks(sourceUrl: string): Promise<{ links: Partial<Record<Platform, string>>; checked_at: string } | null>;
  saveLinks(sourceUrl: string, links: Partial<Record<Platform, string>>): Promise<void>;
  fetchLinks(sourceUrl: string): Promise<Partial<Record<Platform, string>> | null>;
  /** Pausa entre os lotes de busca na Deezer (limite de 50 pedidos a cada 5 s). */
  pauseMs?: number;
  now?: () => Date;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Slug de gênero do catálogo (milhares; os que não existem só não dão sugestão). */
const isGenre = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{1,80}$/.test(v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? (() => new Date());

  async function deck(userId: string, genre: string | null): Promise<Response> {
    const seeds = await deps.seeds(userId);
    let candidates: Candidate[];
    try {
      candidates = await deps.recommend(seeds, CANDIDATES, genre);
    } catch (err) {
      if (err instanceof LastfmKeyError) {
        log('discover: chave do Last.fm ausente ou recusada (LASTFM_API_KEY)');
        return json({ error: 'discover_unavailable' }, 503);
      }
      throw err;
    }

    const known = await deps.lookup(candidates.map((c) => c.key));
    const seenIds = new Set(seeds.seenPreviewIds);
    const cards: { row: TrackRow; candidate: Candidate }[] = [];
    const pending: Candidate[] = [];
    const knownCards: { row: TrackRow; candidate: Candidate }[] = [];
    for (const c of candidates) {
      const row = known.get(c.key);
      if (row === undefined) pending.push(c);
      else if (row && !seenIds.has(row.id)) knownCards.push({ row, candidate: c });
    }
    // Sugestão de gênero: confere na Deezer se a música é mesmo daquele gênero (ex.: pedir funk
    // brasileiro e vir funk americano). As já conhecidas, todas juntas.
    const knownOk = await Promise.all(knownCards.map((k) => genreOk(k.row, k.candidate)));
    knownCards.forEach((k, i) => knownOk[i] && cards.push(k));

    // Procura na Deezer o que ainda não conhece, de 5 em 5, até ter cartões suficientes.
    let quota = false;
    for (let i = 0; i < pending.length && cards.length < DECK_SIZE && !quota; i += 5) {
      if (i > 0) await wait(deps.pauseMs ?? 400);
      const batch = pending.slice(i, i + 5);
      const found = await Promise.all(batch.map((c) => deps.findTrack(c).catch(() => null)));
      for (const [j, track] of found.entries()) {
        if (track === 'quota') {
          quota = true;
          continue;
        }
        const c = batch[j]!;
        const row = await deps.saveTrack(c.key, track, c.reason.kind === 'genre' ? c.reason.genre : null);
        if (row && !seenIds.has(row.id) && (await genreOk(row, c, track?.albumId ?? null))) cards.push({ row, candidate: c });
      }
    }

    // Sem repetir o mesmo cartão (duas sugestões podem dar na mesma faixa da Deezer).
    const unique = cards.filter((c, i) => cards.findIndex((x) => x.row.id === c.row.id) === i).slice(0, DECK_SIZE);

    // Prévias vencidas da Deezer: busca de novo (a URL antiga para de tocar).
    await Promise.all(
      unique.map(async (c) => {
        const r = c.row;
        const t = now().getTime();
        const stale =
          !r.store_checked_at || t - new Date(r.store_checked_at).getTime() > AUDIO_TTL_MS || !previewUsable(r.audio_url, t, AUDIO_MARGIN_MS);
        if (r.platform !== 'deezer' || !r.provider_id || !stale) return;
        const fresh = await deps.trackById(r.provider_id).catch(() => null);
        if (!fresh) return;
        r.audio_url = fresh.previewUrl;
        await deps.saveAudio(r.id, fresh.previewUrl).catch(() => undefined);
      }),
    );

    if (!unique.length) log(`discover: nenhuma sugestão (${candidates.length} candidatas, quota=${quota})`);
    return json({
      cards: unique.map(({ row, candidate }) => ({
        link_preview_id: row.id,
        url: row.url,
        platform: row.platform,
        title: row.title,
        artist: row.artist,
        album: row.album,
        image_url: row.image_url,
        artist_image_url: row.artist_image_url,
        audio_url: row.audio_url,
        genre: candidate.reason.kind === 'genre' ? candidate.reason.genre : (row.genres?.find(isGenre) ?? null),
        reason: candidate.reason.kind,
        because: candidate.reason.kind === 'similar' ? `${candidate.reason.because.artist} – ${candidate.reason.because.title}` : null,
      })),
    });
  }

  /**
   * A música combina com o gênero da sugestão? Só pergunta à Deezer quando o gênero tem
   * conferência e o cartão ainda não foi conferido; na dúvida (Deezer fora), aceita.
   */
  async function genreOk(row: TrackRow, c: Candidate, albumId: string | null = null): Promise<boolean> {
    if (c.reason.kind !== 'genre' || !checksDeezerGenre(c.reason.genre)) return true;
    let ids = row.store_genre_ids ?? null;
    if (ids === null) {
      let album = albumId;
      if (!album && row.platform === 'deezer' && row.provider_id) album = (await deps.trackById(row.provider_id).catch(() => null))?.albumId ?? null;
      ids = album ? await deps.albumGenres(album).catch(() => null) : null;
      if (ids) {
        row.store_genre_ids = ids;
        await deps.saveGenreIds(row.id, ids).catch(() => undefined);
      }
    }
    const ok = fitsGenre(c.reason.genre, ids);
    if (!ok && deps.debug) log(`discover: "${row.artist} – ${row.title}" não é ${c.reason.genre} (Deezer: ${ids?.join(',')})`);
    return ok;
  }

  /** Prévia da Deezer de um cartão da Deezer: a guardada, ou uma nova se venceu/vai vencer. */
  async function deezerAudio(track: TrackRow): Promise<string | null> {
    const t = now().getTime();
    if (track.audio_url && previewUsable(track.audio_url, t, AUDIO_MARGIN_MS)) return track.audio_url;
    const fresh = track.provider_id ? await deps.trackById(track.provider_id).catch(() => null) : null;
    if (!fresh) return previewUsable(track.audio_url, t) ? track.audio_url : null;
    await deps.saveAudio(track.id, fresh.previewUrl).catch(() => undefined);
    return fresh.previewUrl;
  }

  /**
   * Prévia de um cartão (o app pede quando a que tem venceu, não tocou ou não existe).
   * - Deezer: renova pelo próprio link.
   * - Outras plataformas (indicações da comunidade: links de Spotify, YouTube etc., que não
   *   trazem prévia): procura a mesma música (artista + título) na Deezer, guarda a busca
   *   (track_lookups) e toca a prévia de lá.
   */
  async function audio(body: { previewId?: unknown }): Promise<Response> {
    if (typeof body.previewId !== 'string' || !UUID_RE.test(body.previewId)) return json({ error: 'invalid_request' }, 400);
    const track = await deps.getTrack(body.previewId);
    if (!track) return json({ error: 'not_found' }, 404);
    if (track.platform === 'deezer' && track.provider_id) {
      const fresh = await deps.trackById(track.provider_id).catch(() => null);
      if (!fresh) return json({ audio_url: previewUsable(track.audio_url, now().getTime()) ? track.audio_url : null });
      await deps.saveAudio(track.id, fresh.previewUrl).catch(() => undefined);
      return json({ audio_url: fresh.previewUrl });
    }
    // Prévia própria ainda válida (ex.: a oficial da Apple Music, que não vence).
    if (track.audio_url && previewUsable(track.audio_url, now().getTime(), AUDIO_MARGIN_MS)) return json({ audio_url: track.audio_url });
    if (!track.artist) return json({ audio_url: null });

    const key = chartKey(track.artist, track.title);
    const known = (await deps.lookup([key])).get(key);
    let match: TrackRow | null;
    if (known !== undefined) match = known;
    else {
      const found = await deps.findTrack({ artist: track.artist, title: track.title }).catch(() => null);
      if (found === 'quota') return json({ audio_url: null });
      match = await deps.saveTrack(key, found, null);
    }
    return json({ audio_url: match ? await deezerAudio(match) : null });
  }

  async function albums(body: { query?: unknown }): Promise<Response> {
    if (typeof body.query !== 'string') return json({ error: 'invalid_request' }, 400);
    const query = body.query.trim();
    if (query.length < 2 || query.length > 100) return json({ albums: [] });
    const found = await deps.searchAlbums(query);
    if (found === 'quota') return json({ error: 'rate_limited', retry_after: 5 }, 429);
    return json({
      albums: found.map((a) => ({ id: a.id, title: a.title, artist: a.artist, image_url: a.imageUrl, record_type: a.recordType })),
    });
  }

  async function album(body: { albumId?: unknown }): Promise<Response> {
    if (typeof body.albumId !== 'string' || !/^\d{1,15}$/.test(body.albumId)) return json({ error: 'invalid_request' }, 400);
    const found = await deps.albumById(body.albumId);
    if (!found) return json({ error: 'not_found' }, 404);
    return json({ album: await deps.saveAlbum(found) });
  }

  async function tracks(body: { query?: unknown }): Promise<Response> {
    if (typeof body.query !== 'string') return json({ error: 'invalid_request' }, 400);
    const query = body.query.trim();
    if (query.length < 2 || query.length > 100) return json({ tracks: [] });
    const found = await deps.searchTracks(query);
    if (found === 'quota') return json({ error: 'rate_limited', retry_after: 5 }, 429);
    return json({ tracks: found.map((t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, image_url: t.imageUrl })) });
  }

  async function track(body: { trackId?: unknown }): Promise<Response> {
    if (typeof body.trackId !== 'string' || !/^\d{1,15}$/.test(body.trackId)) return json({ error: 'invalid_request' }, 400);
    const found = await deps.trackById(body.trackId);
    if (!found) return json({ error: 'not_found' }, 404);
    return json({ song: await deps.saveSong(found) });
  }

  async function link(body: { previewId?: unknown; platform?: unknown }): Promise<Response> {
    if (typeof body.previewId !== 'string' || !UUID_RE.test(body.previewId) || !isStreamingChoice(body.platform)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const platform = body.platform;
    const track = await deps.getTrack(body.previewId);
    if (!track) return json({ error: 'not_found' }, 404);
    if (track.platform === platform) return json({ url: track.url, exact: true });
    const search = platformSearchUrl(platform, track.title, track.artist ?? '');
    if (!isTrackSourceUrl(track.url)) return json({ url: search, exact: false });

    const cached = await deps.findLinks(track.url);
    let links = cached && now().getTime() - new Date(cached.checked_at).getTime() < LINKS_TTL_MS ? cached.links : null;
    if (!links) {
      try {
        links = await deps.fetchLinks(track.url);
        if (links) await deps.saveLinks(track.url, links);
      } catch (err) {
        log('discover: song.link indisponível', err);
      }
    }
    const exact = links?.[platform];
    return json(exact ? { url: exact, exact: true } : { url: search, exact: false });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('discover: falha ao validar o usuário', err);
      return json({ error: 'not_authenticated' }, 401);
    }
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    const read = await readJsonLimited(req, MAX_BODY_BYTES);
    if (!read.ok) return json({ error: read.error }, read.error === 'payload_too_large' ? 413 : 400);
    const body = (read.value ?? {}) as { action?: unknown; genre?: unknown; previewId?: unknown; platform?: unknown; query?: unknown; albumId?: unknown; trackId?: unknown };
    const actions = ['deck', 'link', 'audio', 'albums', 'album', 'tracks', 'track'] as const;
    if (!actions.includes(body.action as (typeof actions)[number])) return json({ error: 'invalid_request' }, 400);
    const action = body.action as (typeof actions)[number];
    if (body.action === 'deck' && body.genre != null && !isGenre(body.genre)) return json({ error: 'invalid_request' }, 400);

    try {
      if (!(await deps.rateLimit(userId, action))) return json({ error: 'rate_limited', retry_after: 60 }, 429);
      if (action === 'deck') return await deck(userId, isGenre(body.genre) ? body.genre : null);
      if (action === 'albums') return await albums(body);
      if (action === 'album') return await album(body);
      if (action === 'tracks') return await tracks(body);
      if (action === 'track') return await track(body);
      return action === 'audio' ? await audio(body) : await link(body);
    } catch (err) {
      log('discover: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: err instanceof Error ? err.message : String(err) } : {}) }, 500);
    }
  };
}
