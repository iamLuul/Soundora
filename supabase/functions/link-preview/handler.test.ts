// Testes da Edge Function rodando no Deno, com Supabase e plataformas simulados.
// npm run test:functions
import type { FetchLike, LinkPreview } from '../_shared/links/preview.ts';
import { createHandler, type Deps, type PreviewRow } from './handler.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const TRACK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
// Resposta real do oEmbed do Spotify (campos relevantes)
const SPOTIFY_OEMBED = {
  html: '<iframe></iframe>',
  iframe_url: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=oembed',
  width: 456,
  height: 152,
  version: '1.0',
  provider_name: 'Spotify',
  provider_url: 'https://spotify.com',
  type: 'rich',
  title: 'Never Gonna Give You Up',
  thumbnail_url: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02255e131abc1410833be95673',
  thumbnail_width: 300,
  thumbnail_height: 300,
};

type Route = { status?: number; body?: unknown; location?: string };

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = routes[url] ?? { status: 404 };
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => (n.toLowerCase() === 'location' ? (r.location ?? null) : null) },
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
    };
  };
  return { fetch, calls };
}

function makeDeps(fetch: FetchLike, overrides: Partial<Deps> = {}) {
  const store = new Map<string, PreviewRow>();
  const deps: Deps = {
    fetch,
    debug: true,
    log: () => {},
    getUserId: async (h) => (h === 'Bearer token-valido' ? 'user-1' : null),
    findPreview: async (url) => store.get(url) ?? null,
    savePreview: async (p: LinkPreview, genres: string[] | null) => {
      const row: PreviewRow = {
        id: crypto.randomUUID(),
        url: p.url,
        platform: p.platform,
        kind: p.kind,
        provider_id: p.providerId,
        title: p.title,
        artist: p.artist,
        image_url: p.imageUrl,
        fetched_at: new Date().toISOString(),
        genres,
      };
      store.set(row.url, row);
      return row;
    },
    ...overrides,
  };
  return { deps, store };
}

function post(body: unknown, auth = 'Bearer token-valido') {
  return new Request('http://localhost/functions/v1/link-preview', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Spotify: gera o cartão a partir do link compartilhado no app', async () => {
  const { fetch } = fakeFetch({
    [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED },
    [TRACK]: { body: '<meta property="og:description" content="Listen to Never Gonna Give You Up on Spotify. Song · Rick Astley · 1987">' },
  });
  const { deps } = makeDeps(fetch);
  const res = await createHandler(deps)(post({ url: `${TRACK}?si=a1b2c3d4e5` }));
  const json = await res.json();
  assertEquals(res.status, 200, JSON.stringify(json));
  assertEquals(
    { title: json.preview.title, artist: json.preview.artist, url: json.preview.url, image: json.preview.image_url },
    { title: 'Never Gonna Give You Up', artist: 'Rick Astley', url: TRACK, image: SPOTIFY_OEMBED.thumbnail_url },
  );
});

Deno.test('Spotify: link com intl-pt e texto junto também funciona', async () => {
  const { fetch } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const { deps } = makeDeps(fetch);
  const res = await createHandler(deps)(post({ url: `ouve essa! https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC?si=x` }));
  assertEquals(res.status, 200);
});

Deno.test('segunda vez vem do cache, sem chamar o Spotify', async () => {
  const { fetch, calls } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const { deps } = makeDeps(fetch);
  const handler = createHandler(deps);
  await handler(post({ url: TRACK }));
  const before = calls.length;
  const res = await handler(post({ url: TRACK }));
  assertEquals((await res.json()).cached, true);
  assertEquals(calls.length, before);
});

Deno.test('sem login: 401', async () => {
  const { deps } = makeDeps(fakeFetch({}).fetch);
  const res = await createHandler(deps)(post({ url: TRACK }, ''));
  assertEquals(res.status, 401);
});

Deno.test('link que não é de música: 422 unsupported', async () => {
  const { deps } = makeDeps(fakeFetch({}).fetch);
  const res = await createHandler(deps)(post({ url: 'https://example.com/x' }));
  assertEquals([res.status, (await res.json()).error], [422, 'unsupported']);
});

Deno.test('falha ao salvar no banco: 500 com o motivo em modo debug', async () => {
  const { fetch } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const { deps } = makeDeps(fetch, {
    savePreview: () => Promise.reject({ code: '42501', message: 'permission denied for table link_previews' }),
  });
  const res = await createHandler(deps)(post({ url: TRACK }));
  const json = await res.json();
  assertEquals([res.status, json.error], [500, 'internal']);
  if (!String(json.detail).includes('permission denied')) throw new Error('detail ausente: ' + JSON.stringify(json));
});

Deno.test('Spotify fora do ar: 502 fetch_failed', async () => {
  const { fetch } = fakeFetch({
    [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { status: 503 },
    [TRACK]: { status: 503 },
  });
  const { deps } = makeDeps(fetch);
  const res = await createHandler(deps)(post({ url: TRACK }));
  assertEquals([res.status, (await res.json()).error], [502, 'fetch_failed']);
});

Deno.test('OPTIONS responde CORS para a Web', async () => {
  const { deps } = makeDeps(fakeFetch({}).fetch);
  const res = await createHandler(deps)(new Request('http://localhost/x', { method: 'OPTIONS' }));
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
});

Deno.test('limite de prévias por pessoa: 429 sem chamar as plataformas', async () => {
  const { fetch, calls } = fakeFetch({});
  const { deps } = makeDeps(fetch, { rateLimit: async () => false });
  const res = await createHandler(deps)(post({ url: TRACK }));
  assertEquals([res.status, await res.json()], [429, { error: 'rate_limited' }]);
  assertEquals(calls, []);
});

Deno.test('corpo grande demais: 413 sem ler tudo', async () => {
  const { fetch, calls } = fakeFetch({});
  const { deps } = makeDeps(fetch);
  const res = await createHandler(deps)(post({ url: TRACK, lixo: 'x'.repeat(20_000) }));
  assertEquals([res.status, await res.json()], [413, { error: 'payload_too_large' }]);
  assertEquals(calls, []);
});

Deno.test('gêneros: detectados e gravados com o cartão', async () => {
  const { fetch } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const asked: string[] = [];
  const { deps, store } = makeDeps(fetch, {
    detectGenres: async (title, artist) => {
      asked.push(`${artist} - ${title}`);
      return ['pop', 'dance'];
    },
  });
  const res = await createHandler(deps)(post({ url: TRACK }));
  assertEquals((await res.json()).preview.genres, ['pop', 'dance']);
  assertEquals(store.get(TRACK)?.genres, ['pop', 'dance']);
  assertEquals(asked.length, 1);
});

Deno.test('gêneros: lojas fora do ar não impedem o cartão (fica para depois)', async () => {
  const { fetch } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const { deps } = makeDeps(fetch, { detectGenres: () => Promise.reject(new Error('offline')) });
  const res = await createHandler(deps)(post({ url: TRACK }));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).preview.genres, null);
});

Deno.test('gêneros: cartão antigo do cache sem gênero é completado', async () => {
  const { fetch } = fakeFetch({ [`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`]: { body: SPOTIFY_OEMBED } });
  const saved: [string, string[]][] = [];
  const { deps, store } = makeDeps(fetch, { detectGenres: async () => ['rock'], saveGenres: async (id, g) => void saved.push([id, g]) });
  const handler = createHandler(deps);
  await handler(post({ url: TRACK }));
  store.get(TRACK)!.genres = null;
  const json = await (await handler(post({ url: TRACK }))).json();
  assertEquals([json.cached, json.preview.genres], [true, ['rock']]);
  assertEquals(saved.length, 1);
});
