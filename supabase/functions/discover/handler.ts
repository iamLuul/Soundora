// Lógica da Edge Function discover, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'deck', genre? }          → cartões sugeridos para a pessoa (ou só de um gênero)
// { action: 'link', previewId, platform } → link da música na plataforma da pessoa (ou a busca)
import { readJsonLimited } from '../_shared/body.ts';
import { isTrackSourceUrl, isStreamingChoice, LastfmKeyError, platformSearchUrl } from '../_shared/links/charts.ts';
import type { Candidate, DeezerTrack, Seeds, TrackRef } from '../_shared/links/discover.ts';
import { GENRE_SLUGS, type GenreSlug } from '../_shared/links/genres.ts';
import type { Platform } from '../_shared/links/platforms.ts';

export const MAX_BODY_BYTES = 2 * 1024;
/** Cartões por pilha. */
export const DECK_SIZE = 15;
/** Sugestões pedidas ao Last.fm por pilha (algumas não estão na Deezer). */
export const CANDIDATES = 40;
/** A prévia da Deezer vence: renova depois de 6 h. */
export const AUDIO_TTL_MS = 6 * 3600_000;
export const LINKS_TTL_MS = 30 * 86_400_000;
/** Pedidos por pessoa (por minuto). */
export const RATE = { deck: 12, link: 30 } as const;

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
}

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  rateLimit(userId: string, action: keyof typeof RATE): Promise<boolean>;
  /** Gêneros, curtidas e o que a pessoa já viu (por chave e por cartão). */
  seeds(userId: string): Promise<Seeds & { seenPreviewIds: string[] }>;
  /** Sugestões do Last.fm (LastfmKeyError = chave ausente ou recusada). */
  recommend(seeds: Seeds, size: number, onlyGenre: GenreSlug | null): Promise<Candidate[]>;
  /** Buscas já feitas: chave → cartão (null = procurada e não achada). Chave ausente = nunca procurada. */
  lookup(keys: string[]): Promise<Map<string, TrackRow | null>>;
  findTrack(ref: TrackRef): Promise<DeezerTrack | null | 'quota'>;
  trackById(id: string): Promise<DeezerTrack | null>;
  /** Guarda o que a Deezer achou (ou que não achou) e devolve o cartão. */
  saveTrack(key: string, track: DeezerTrack | null, genre: GenreSlug | null): Promise<TrackRow | null>;
  /** Nova prévia da Deezer num cartão que já existia. */
  saveAudio(previewId: string, audioUrl: string | null): Promise<void>;
  getTrack(previewId: string): Promise<TrackRow | null>;
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

const isGenre = (v: unknown): v is GenreSlug => typeof v === 'string' && (GENRE_SLUGS as readonly string[]).includes(v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? (() => new Date());

  async function deck(userId: string, genre: GenreSlug | null): Promise<Response> {
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
    for (const c of candidates) {
      const row = known.get(c.key);
      if (row === undefined) pending.push(c);
      else if (row && !seenIds.has(row.id)) cards.push({ row, candidate: c });
    }

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
        if (row && !seenIds.has(row.id)) cards.push({ row, candidate: c });
      }
    }

    // Sem repetir o mesmo cartão (duas sugestões podem dar na mesma faixa da Deezer).
    const unique = cards.filter((c, i) => cards.findIndex((x) => x.row.id === c.row.id) === i).slice(0, DECK_SIZE);

    // Prévias vencidas da Deezer: busca de novo (a URL antiga para de tocar).
    await Promise.all(
      unique.map(async (c) => {
        const r = c.row;
        const stale = !r.store_checked_at || now().getTime() - new Date(r.store_checked_at).getTime() > AUDIO_TTL_MS;
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
    const body = (read.value ?? {}) as { action?: unknown; genre?: unknown; previewId?: unknown; platform?: unknown };
    if (body.action !== 'deck' && body.action !== 'link') return json({ error: 'invalid_request' }, 400);
    if (body.action === 'deck' && body.genre != null && !isGenre(body.genre)) return json({ error: 'invalid_request' }, 400);

    try {
      if (!(await deps.rateLimit(userId, body.action))) return json({ error: 'rate_limited' }, 429);
      return body.action === 'deck' ? await deck(userId, isGenre(body.genre) ? body.genre : null) : await link(body);
    } catch (err) {
      log('discover: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: err instanceof Error ? err.message : String(err) } : {}) }, 500);
    }
  };
}
