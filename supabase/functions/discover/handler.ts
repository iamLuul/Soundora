// Lógica da Edge Function discover, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'deck', genre? }          → cartões sugeridos para a pessoa (ou só de um gênero)
// { action: 'link', previewId, platform } → link da música na plataforma da pessoa (ou a busca)
// { action: 'audio', previewId }          → prévia renovada, só da plataforma da pessoa (Deezer ou Apple Music)
// { action: 'albums', query }             → álbuns da Deezer pelo nome (para escolher na review)
// { action: 'album', albumId }            → guarda o álbum escolhido como cartão e devolve o cartão
// { action: 'tracks', query }             → músicas da Deezer pelo nome (favoritas do perfil)
// { action: 'track', trackId }            → guarda a música escolhida como cartão e devolve o cartão
import { readJsonLimited } from '../_shared/body.ts';
import { chartKey, isTrackSourceUrl, isStreamingChoice, LastfmKeyError, platformSearchUrl, type LastfmTrackInfo, type PlatformTracks, type StreamingChoice } from '../_shared/links/charts.ts';
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
/** Por pilha, no máximo estas buscas novas na Apple (o iTunes aceita ~20 por minuto) e no song.link. */
export const APPLE_LOOKUPS_PER_DECK = 15;
export const LINK_LOOKUPS_PER_DECK = 5;
/** Última busca no Last.fm sem resultado (ou sem capa): tenta de novo depois disso. */
export const LASTFM_RETRY_MS = 7 * 86_400_000;
/** Plataformas sem prévia: o cartão leva o link e a capa delas (vindos do song.link). */
const LINK_ONLY: StreamingChoice[] = ['spotify', 'youtube_music', 'amazon_music', 'tidal', 'soundcloud'];
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

/** O que achamos de uma música numa plataforma (public.platform_tracks). */
export interface PlatformTrack {
  /** false = procurada e não achada nessa plataforma. */
  found: boolean;
  url: string | null;
  image_url: string | null;
  audio_url: string | null;
  /** Quando foi procurada (para procurar a capa de novo, se não veio). */
  checked_at?: string | null;
}

/** Dados da música no Last.fm, guardados por cartão (public.lastfm_tracks). */
export interface LastfmMeta {
  /** false = o Last.fm não conhece a música. */
  found: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  image_url: string | null;
  checked_at?: string | null;
}

/** Música achada na Apple (iTunes Search): link, capa e prévia oficiais. */
export interface AppleTrack {
  url: string;
  imageUrl: string | null;
  previewUrl: string | null;
}

/**
 * O cartão como a pessoa vê, na plataforma dela: link, capa e prévia vêm todos da mesma
 * plataforma (os termos das APIs não permitem tocar a prévia de uma loja com o link de outra).
 */
interface CardView {
  url: string;
  platform: string;
  image_url: string | null;
  artist_image_url: string | null;
  audio_url: string | null;
  /** De qual plataforma é a prévia (o app mostra o crédito); null = sem prévia. */
  preview_platform: StreamingChoice | null;
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
  seeds(userId: string): Promise<Seeds & { seenPreviewIds: string[]; mutedGenres?: string[] }>;
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
  /** Links guardados (images = null: guardados antes de trazer as capas). */
  findLinks(sourceUrl: string): Promise<{ links: Partial<Record<Platform, string>>; images?: Partial<Record<Platform, string>> | null; checked_at: string } | null>;
  saveLinks(sourceUrl: string, links: Partial<Record<Platform, string>>, images?: Partial<Record<Platform, string>>): Promise<void>;
  /** Links e capas no song.link (null = não conhece a música; erro = esperar e tentar depois). */
  fetchLinks(sourceUrl: string): Promise<PlatformTracks | null>;
  /** Continua um trabalho depois da resposta (procurar as capas que faltaram para a próxima pilha). */
  background?(task: Promise<unknown>): void;
  /** Plataforma escolhida pela pessoa (null = ainda não escolheu). Sem isto, vale a Deezer. */
  platformOf?(userId: string): Promise<StreamingChoice | null>;
  /** O que já achamos dessas músicas numa plataforma (por id do cartão). */
  findPlatformTracks?(ids: string[], platform: StreamingChoice): Promise<Map<string, PlatformTrack>>;
  savePlatformTrack?(id: string, platform: StreamingChoice, track: PlatformTrack): Promise<void>;
  /** A mesma música na Apple ('quota' = esperar; null = não está lá). */
  appleTrack?(ref: TrackRef): Promise<AppleTrack | null | 'quota'>;
  /** Capa oficial de um link de plataforma (oEmbed/og). */
  coverOf?(url: string): Promise<string | null>;
  /** Dados do Last.fm já guardados (por id do cartão). */
  findLastfm?(ids: string[]): Promise<Map<string, LastfmMeta>>;
  saveLastfm?(id: string, meta: LastfmMeta): Promise<void>;
  /** Nome, álbum e capa no Last.fm (null = não conhece; erro = esperar e tentar depois). */
  lastfmInfo?(ref: TrackRef): Promise<LastfmTrackInfo | null>;
  /** Pausa entre os lotes de busca na Deezer (limite de 50 pedidos a cada 5 s). */
  pauseMs?: number;
  /** Quanto a resposta espera pelo Last.fm antes de sair com o que tem (o resto continua em segundo plano). */
  lastfmBudgetMs?: number;
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
/** A resposta do Descobrir não espera pelo Last.fm mais que isto. */
const LASTFM_BUDGET_MS = 1500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? (() => new Date());

  async function deck(userId: string, genre: string | null): Promise<Response> {
    const { mutedGenres = [], ...seeds } = await deps.seeds(userId);
    // Gêneros silenciados: não puxam sugestões nem aparecem no deck (a não ser que a pessoa
    // busque o gênero de propósito, no topo da tela).
    const muted = new Set(genre ? [] : mutedGenres);
    const isMuted = (row: TrackRow, c: Candidate) =>
      (c.reason.kind === 'genre' && muted.has(c.reason.genre)) || (row.genres ?? []).some((g) => muted.has(g));
    seeds.genres = seeds.genres.filter((g) => !muted.has(g));
    let candidates: Candidate[];
    try {
      candidates = (await deps.recommend(seeds, CANDIDATES, genre)).filter((c) => !(c.reason.kind === 'genre' && muted.has(c.reason.genre)));
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
      else if (row && !seenIds.has(row.id) && !isMuted(row, c)) knownCards.push({ row, candidate: c });
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
        if (row && !seenIds.has(row.id) && !isMuted(row, c) && (await genreOk(row, c, track?.albumId ?? null))) cards.push({ row, candidate: c });
      }
    }

    // Sem repetir o mesmo cartão (duas sugestões podem dar na mesma faixa da Deezer).
    const unique = cards.filter((c, i) => cards.findIndex((x) => x.row.id === c.row.id) === i).slice(0, DECK_SIZE);

    const platform = deps.platformOf ? await deps.platformOf(userId) : 'deezer';

    // Prévias vencidas da Deezer: busca de novo (a URL antiga para de tocar). Só para quem
    // ouve pela Deezer.
    if (platform === 'deezer') await Promise.all(
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

    const [{ views, later }, meta] = await Promise.all([viewsFor(platform, unique.map((c) => c.row)), lastfmMetaFor(unique)]);
    const shown = unique.flatMap((c) => {
      const view = views.get(c.row.id);
      return view ? [{ ...c, view }] : [];
    });
    // Os links que faltaram nas outras plataformas são procurados depois da resposta (para a próxima pilha).
    if (platform && later.length && deps.background) deps.background(lookupMany(platform, later.slice(0, LINK_LOOKUPS_PER_DECK)).catch(() => undefined));

    if (!shown.length) log(`discover: nenhuma sugestão (${candidates.length} candidatas, quota=${quota}, plataforma=${platform})`);
    return json({
      cards: shown.map(({ row, candidate, view }) => {
        // Nomes, álbum e capa vêm sempre do Last.fm, seja qual for a plataforma da pessoa (a
        // plataforma só decide o link e a prévia). Sem resposta do Last.fm, vale o que a Deezer
        // achou. A foto do artista vem da Deezer: o Last.fm não tem foto de artista.
        const lf = meta.get(row.id);
        return {
        link_preview_id: row.id,
        url: view.url,
        platform: view.platform,
        title: lf?.title ?? candidate.title ?? row.title,
        artist: lf?.artist ?? candidate.artist ?? row.artist,
        album: lf?.album ?? row.album,
        image_url: lf?.image_url ?? row.image_url,
        artist_image_url: row.artist_image_url,
        audio_url: view.audio_url,
        preview_platform: view.preview_platform,
        genre: candidate.reason.kind === 'genre' ? candidate.reason.genre : (row.genres?.find(isGenre) ?? null),
        reason: candidate.reason.kind,
        because: candidate.reason.kind === 'similar' ? `${candidate.reason.because.artist} – ${candidate.reason.because.title}` : null,
        };
      }),
    });
  }

  /**
   * Nome, álbum e capa de cada cartão pelo Last.fm. O que já foi achado vem do banco; o resto é
   * perguntado agora (de 5 em 5) e guardado. Se o Last.fm falhar, o cartão segue com o que tem.
   * A resposta não espera mais que `LASTFM_BUDGET_MS`: o que não deu tempo continua depois da
   * resposta e fica guardado para a próxima vez (o cartão sai com o que a Deezer achou).
   */
  async function lastfmMetaFor(items: { row: TrackRow; candidate: Candidate }[]): Promise<Map<string, LastfmMeta>> {
    const out = new Map<string, LastfmMeta>();
    if (!deps.lastfmInfo || !items.length) return out;
    const cached = (await deps.findLastfm?.(items.map((i) => i.row.id)).catch(() => undefined)) ?? new Map<string, LastfmMeta>();
    const t = now().getTime();
    const old = (m: LastfmMeta) => !m.checked_at || t - new Date(m.checked_at).getTime() > LASTFM_RETRY_MS;
    const todo: typeof items = [];
    for (const it of items) {
      const m = cached.get(it.row.id);
      if (m) out.set(it.row.id, m);
      if (!m || ((!m.found || !m.image_url) && old(m))) todo.push(it);
    }
    const fill = async () => {
      for (let i = 0; i < todo.length; i += 5) {
        if (i > 0) await wait(deps.pauseMs ?? 400);
        const batch = todo.slice(i, i + 5);
        const found = await Promise.all(
          batch.map((it) =>
            deps
              .lastfmInfo!({ artist: it.candidate.artist, title: it.candidate.title })
              .then((info) => ({ ok: true as const, info }))
              .catch((err) => {
                log('discover: Last.fm indisponível', err);
                return { ok: false as const, info: null };
              }),
          ),
        );
        for (const [j, f] of found.entries()) {
          if (!f.ok) continue;
          const meta: LastfmMeta = f.info
            ? { found: true, title: f.info.title, artist: f.info.artist, album: f.info.album, image_url: f.info.imageUrl }
            : { found: false, title: null, artist: null, album: null, image_url: null };
          // Conhece a música mas sem capa agora: não apaga a que já tínhamos.
          const prev = out.get(batch[j]!.row.id);
          const merged = { ...meta, image_url: meta.image_url ?? prev?.image_url ?? null, album: meta.album ?? prev?.album ?? null };
          out.set(batch[j]!.row.id, merged.found || !prev?.found ? merged : prev);
          await deps.saveLastfm?.(batch[j]!.row.id, merged).catch(() => undefined);
        }
      }
    };
    if (todo.length) {
      const work = fill().catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finished = await Promise.race([
        work.then(() => true),
        new Promise<boolean>((r) => {
          timer = setTimeout(() => r(false), deps.lastfmBudgetMs ?? LASTFM_BUDGET_MS);
        }),
      ]);
      clearTimeout(timer);
      // Estourou o tempo: o resto termina em segundo plano (e fica guardado para a próxima pilha).
      if (!finished && deps.background) deps.background(work);
    }
    // Uma cópia: o que chegar depois do prazo não muda a resposta que já está saindo.
    const result = new Map(out);
    for (const [id, m] of result) if (!m.found) result.delete(id);
    return result;
  }

  /**
   * O cartão na plataforma da pessoa:
   * - Deezer: o cartão é da Deezer (link, capa, prévia).
   * - Apple Music: link, capa e prévia da Apple; música que não está na Apple fica de fora.
   * - Outras (Spotify, YouTube Music...): link e capa daquela plataforma, sem prévia (elas não
   *   oferecem prévia a apps novos). Ainda não achou: busca na plataforma e cartão ilustrado.
   * - Sem plataforma escolhida: sem prévia e sem capa (o app pede para escolher).
   * Buscas novas por pilha são limitadas; o que foi achado fica guardado (platform_tracks).
   */
  async function viewsFor(platform: StreamingChoice | null, rows: TrackRow[]): Promise<{ views: Map<string, CardView | null>; later: TrackRow[] }> {
    const out = new Map<string, CardView | null>();
    if (platform === 'deezer') {
      for (const r of rows) {
        out.set(r.id, { url: r.url, platform: r.platform, image_url: r.image_url, artist_image_url: r.artist_image_url, audio_url: r.audio_url, preview_platform: r.audio_url ? 'deezer' : null });
      }
      return { views: out, later: [] };
    }
    if (!platform) {
      for (const r of rows) out.set(r.id, { url: r.url, platform: r.platform, image_url: null, artist_image_url: null, audio_url: null, preview_platform: null });
      return { views: out, later: [] };
    }
    const cached = (await deps.findPlatformTracks?.(rows.map((r) => r.id), platform)) ?? new Map<string, PlatformTrack>();
    // Nunca procurada nessa plataforma (a capa não importa: vem do Last.fm).
    const missing = rows.filter((r) => !cached.has(r.id));
    const budget = platform === 'apple_music' ? APPLE_LOOKUPS_PER_DECK : LINK_LOOKUPS_PER_DECK;
    const done = await lookupMany(platform, missing.slice(0, budget));
    for (const [id, f] of done) cached.set(id, f);
    const later = missing.slice(budget).concat(missing.slice(0, budget).filter((r) => !done.has(r.id)));
    for (const r of rows) {
      const pt = cached.get(r.id);
      // Não está na Apple: sem prévia nem capa da Apple, a música não entra na pilha.
      if (platform === 'apple_music' && pt && !pt.found) {
        out.set(r.id, null);
        continue;
      }
      const ok = !!pt?.found;
      const audio = platform === 'apple_music' && ok ? (pt?.audio_url ?? null) : null;
      out.set(r.id, {
        url: ok && pt?.url ? pt.url : platformSearchUrl(platform, r.title, r.artist ?? ''),
        platform,
        image_url: ok ? (pt?.image_url ?? null) : null,
        artist_image_url: null,
        audio_url: audio,
        preview_platform: audio ? 'apple_music' : null,
      });
    }
    return { views: out, later };
  }

  /** Procura as músicas na plataforma de 5 em 5 (em paralelo) e guarda; para se pedirem para esperar. */
  async function lookupMany(platform: StreamingChoice, rows: TrackRow[]): Promise<Map<string, PlatformTrack>> {
    const done = new Map<string, PlatformTrack>();
    for (let i = 0; i < rows.length; i += 5) {
      const batch = rows.slice(i, i + 5);
      const found = await Promise.all(batch.map((r) => findOn(platform, r)));
      let blocked = false;
      for (const [j, f] of found.entries()) {
        if (f === 'quota') blocked = true;
        else {
          done.set(batch[j]!.id, f);
          await deps.savePlatformTrack?.(batch[j]!.id, platform, f).catch(() => undefined);
        }
      }
      if (blocked) break;
    }
    return done;
  }

  /** Procura a música numa plataforma ('quota' = não deu agora; não guarda). */
  async function findOn(platform: StreamingChoice, r: TrackRow): Promise<PlatformTrack | 'quota'> {
    const none: PlatformTrack = { found: false, url: null, image_url: null, audio_url: null };
    if (platform === 'apple_music') {
      if (!deps.appleTrack || !r.artist) return none;
      const a = await deps.appleTrack({ artist: r.artist, title: r.title }).catch(() => 'quota' as const);
      if (a === 'quota') return 'quota';
      return a ? { found: true, url: a.url, image_url: a.imageUrl, audio_url: a.previewUrl } : none;
    }
    const found = await resolveLinks(r, true);
    if (found === 'failed') return 'quota';
    const url = found?.links[platform] ?? null;
    if (!found || !url) return none;
    const image = found.images?.[platform] ?? null;
    // Busca nova: já guarda o link e a capa nas outras plataformas sem prévia (outras pessoas).
    if (found.fresh) {
      for (const p of LINK_ONLY) {
        const other = found.links[p];
        const cover = found.images?.[p];
        if (p !== platform && other && cover) await deps.savePlatformTrack?.(r.id, p, { found: true, url: other, image_url: cover, audio_url: null }).catch(() => undefined);
      }
    }
    return { found: true, url, image_url: image, audio_url: null };
  }

  /**
   * Links e capas da música em todas as plataformas (song.link, guardados por 30 dias).
   * Com `withImages`, links guardados antes das capas são buscados de novo.
   * 'failed' = o song.link pediu para esperar ou falhou (não é "não achou").
   */
  async function resolveLinks(
    track: TrackRow,
    withImages = false,
  ): Promise<{ links: Partial<Record<Platform, string>>; images: Partial<Record<Platform, string>> | null; fresh: boolean } | null | 'failed'> {
    if (!isTrackSourceUrl(track.url)) return null;
    const cached = await deps.findLinks(track.url);
    const valid = cached && now().getTime() - new Date(cached.checked_at).getTime() < LINKS_TTL_MS ? cached : null;
    if (valid && (valid.images || !withImages)) return { links: valid.links, images: valid.images ?? null, fresh: false };
    try {
      const found = await deps.fetchLinks(track.url);
      if (found) await deps.saveLinks(track.url, found.links, found.images);
      return found ? { ...found, fresh: true } : null;
    } catch (err) {
      log('discover: song.link indisponível', err);
      return valid ? { links: valid.links, images: null, fresh: false } : 'failed';
    }
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
  async function audio(userId: string, body: { previewId?: unknown }): Promise<Response> {
    if (typeof body.previewId !== 'string' || !UUID_RE.test(body.previewId)) return json({ error: 'invalid_request' }, 400);
    const track = await deps.getTrack(body.previewId);
    if (!track) return json({ error: 'not_found' }, 404);
    // Só a prévia da plataforma da pessoa: Apple para quem usa Apple Music; nenhuma para as
    // plataformas sem prévia; Deezer (abaixo) para quem usa Deezer.
    const platform = deps.platformOf ? await deps.platformOf(userId) : 'deezer';
    if (platform !== 'deezer') {
      if (platform !== 'apple_music') return json({ audio_url: null });
      const view = (await viewsFor('apple_music', [track])).views.get(track.id);
      return json({ audio_url: view?.audio_url ?? null });
    }
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
    const known = (await deps.findPlatformTracks?.([track.id], platform))?.get(track.id);
    if (known?.found && known.url) return json({ url: known.url, exact: true });
    if (!isTrackSourceUrl(track.url)) return json({ url: search, exact: false });

    const found = await resolveLinks(track);
    const exact = found !== 'failed' ? found?.links[platform] : undefined;
    // Guarda o link (e a capa) dessa plataforma: o próximo Descobrir já mostra a capa dela.
    // (Apple e Deezer têm prévia: o cartão delas vem da busca própria, não daqui.)
    if (exact && !known && found && found !== 'failed' && LINK_ONLY.includes(platform)) {
      const image = found.images?.[platform] ?? (deps.coverOf ? await deps.coverOf(exact).catch(() => null) : null);
      await deps.savePlatformTrack?.(track.id, platform, { found: true, url: exact, image_url: image, audio_url: null }).catch(() => undefined);
    }
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
      return action === 'audio' ? await audio(userId, body) : await link(body);
    } catch (err) {
      log('discover: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: err instanceof Error ? err.message : String(err) } : {}) }, 500);
    }
  };
}
