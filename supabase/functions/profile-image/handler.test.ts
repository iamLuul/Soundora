// Testes da Edge Function profile-image no Deno, com o Supabase simulado.
// npm run test:functions
import { fixtures } from './fixtures.ts';
import { createHandler, type Deps } from './handler.ts';
import { readLimited } from '../_shared/body.ts';
import { IMAGE_LIMITS, inspectImage } from './image.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const USER = '11111111-1111-1111-1111-111111111111';

/** PNG válido com largura e altura trocadas no cabeçalho (como uma bomba de pixels). */
function pngWithSize(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = fixtures.png.slice();
  const view = new DataView(b.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.byteLength;
  }
  return out;
}

const text = (s: string) => new TextEncoder().encode(s);

Deno.test('aceita JPEG, PNG e WebP de verdade e lê as dimensões', () => {
  for (const [name, type] of [
    ['jpeg', 'jpeg'],
    ['png', 'png'],
    ['webpLossy', 'webp'],
    ['webpLossless', 'webp'],
  ] as const) {
    assertEquals(inspectImage(fixtures[name]), { ok: true, type, width: 64, height: 64 }, name);
  }
});

Deno.test('recusa o que não é imagem permitida, mesmo com extensão ou tipo trocado', () => {
  const zip = concat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), new Uint8Array(200));
  assertEquals(inspectImage(zip), { ok: false, error: 'unsupported_image' }, 'zip');
  assertEquals(inspectImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), {
    ok: false,
    error: 'unsupported_image',
  });
  assertEquals(inspectImage(fixtures.gif), { ok: false, error: 'unsupported_image' }, 'gif');
  assertEquals(inspectImage(fixtures.webpAnimated), { ok: false, error: 'unsupported_image' }, 'webp animado');
  assertEquals(inspectImage(text('<html>oi</html>')), { ok: false, error: 'unsupported_image' });
});

Deno.test('recusa bomba de pixels e imagens minúsculas pelo cabeçalho, sem abrir a imagem', () => {
  assertEquals(inspectImage(pngWithSize(50_000, 50_000)), { ok: false, error: 'image_dimensions' });
  assertEquals(inspectImage(pngWithSize(IMAGE_LIMITS.maxSide + 1, 100)), { ok: false, error: 'image_dimensions' });
  assertEquals(inspectImage(pngWithSize(2048, 2048)).ok, true);
  assertEquals(inspectImage(fixtures.tiny), { ok: false, error: 'image_dimensions' });
});

Deno.test('recusa arquivo com dados escondidos depois da imagem (ex.: ZIP colado no JPEG)', () => {
  const zip = concat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), new Uint8Array(100));
  assertEquals(inspectImage(concat(fixtures.jpeg, zip)), { ok: false, error: 'invalid_image' }, 'jpeg');
  assertEquals(inspectImage(concat(fixtures.png, zip)), { ok: false, error: 'invalid_image' }, 'png');
  assertEquals(inspectImage(concat(fixtures.webpLossy, zip)), { ok: false, error: 'invalid_image' }, 'webp');
  assertEquals(inspectImage(fixtures.jpeg.subarray(0, 300)), { ok: false, error: 'invalid_image' }, 'jpeg cortado');
});

Deno.test('readLimited para de ler no limite, mesmo sem Content-Length', async () => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(64 * 1024));
      if (pulled > 1000) controller.close(); // 64 MB se ninguém parasse
    },
  });
  assertEquals(await readLimited(stream, 256 * 1024), 'too_large');
  if (pulled > 10) throw new Error(`leu demais: ${pulled} pedaços`);
});

function makeDeps(overrides: Partial<Deps> = {}) {
  const uploaded: { kind: string; path: string; contentType: string; size: number }[] = [];
  const removed: string[] = [];
  const images: Record<string, string | null> = { avatar: `avatars/${USER}/avatar-1000.jpg`, banner: null };
  let calls = 0;
  const deps: Deps = {
    debug: true,
    log: () => {},
    now: () => 1760000000000,
    getUserId: async (h) => (h === 'Bearer valido' ? USER : null),
    rateLimit: async () => ++calls <= 10,
    upload: async (kind, path, bytes, contentType) => {
      uploaded.push({ kind, path, contentType, size: bytes.byteLength });
    },
    setImage: async (_u, kind, path) => {
      const previous = images[kind] ?? null;
      images[kind] = path;
      return previous;
    },
    remove: async (kind, paths) => {
      removed.push(...paths.map((p) => `${kind}:${p}`));
    },
    ...overrides,
  };
  return { deps, uploaded, removed, getAvatar: () => images.avatar, getBanner: () => images.banner };
}

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request('http://localhost/profile-image', { method: 'POST', body, headers: { Authorization: 'Bearer valido', ...headers } });
}

Deno.test('sem login: recusa antes de ler o arquivo', async () => {
  let read = false;
  // highWaterMark 0: o stream só entrega dados quando alguém lê.
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read = true;
        controller.enqueue(fixtures.png);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const { deps, uploaded } = makeDeps();
  const res = await createHandler(deps)(new Request('http://localhost/profile-image', { method: 'POST', body }));
  assertEquals(res.status, 401);
  assertEquals(uploaded, []);
  if (read) throw new Error('leu o corpo sem login');
});

Deno.test('foto válida: grava com nome gerado pelo servidor, atualiza o perfil e apaga a antiga', async () => {
  const { deps, uploaded, removed, getAvatar } = makeDeps();
  // O app diz que é PNG, mas os bytes são JPEG: vale o que os bytes dizem.
  const res = await createHandler(deps)(post(fixtures.jpeg, { 'Content-Type': 'image/png' }));
  assertEquals(await res.json(), { path: `avatars/${USER}/avatar-1760000000000.jpg`, width: 64, height: 64 });
  assertEquals(uploaded, [{ kind: 'avatar', path: `${USER}/avatar-1760000000000.jpg`, contentType: 'image/jpeg', size: fixtures.jpeg.byteLength }]);
  assertEquals(getAvatar(), `avatars/${USER}/avatar-1760000000000.jpg`);
  assertEquals(removed, [`avatar:${USER}/avatar-1000.jpg`]);
});

Deno.test('arquivos ruins não chegam ao Storage', async () => {
  const { deps, uploaded } = makeDeps();
  const handler = createHandler(deps);
  assertEquals((await handler(post(text('PK\u0003\u0004 zip')))).status, 415);
  assertEquals((await handler(post(pngWithSize(40_000, 40_000)))).status, 422);
  assertEquals((await handler(post(new Uint8Array()))).status, 400);
  assertEquals((await handler(post(new Uint8Array(IMAGE_LIMITS.maxBytes + 1)))).status, 413);
  assertEquals(uploaded, []);
});

Deno.test('Content-Length grande demais é recusado na hora', async () => {
  const { deps } = makeDeps();
  const req = new Request('http://localhost/profile-image', {
    method: 'POST',
    headers: { Authorization: 'Bearer valido', 'Content-Length': String(50 * 1024 * 1024) },
    body: fixtures.png,
  });
  const res = await createHandler(deps)(req);
  assertEquals([res.status, await res.json()], [413, { error: 'payload_too_large' }]);
});

Deno.test('no máximo 10 trocas por hora', async () => {
  const { deps } = makeDeps();
  const handler = createHandler(deps);
  for (let i = 0; i < 10; i++) assertEquals((await handler(post(fixtures.png))).status, 200);
  assertEquals((await handler(post(fixtures.png))).status, 429);
});

Deno.test('DELETE remove a foto do perfil e o arquivo', async () => {
  const { deps, removed, getAvatar } = makeDeps();
  const res = await createHandler(deps)(new Request('http://localhost/profile-image', { method: 'DELETE', headers: { Authorization: 'Bearer valido' } }));
  assertEquals(await res.json(), { path: null });
  assertEquals(getAvatar(), null);
  assertEquals(removed, [`avatar:${USER}/avatar-1000.jpg`]);
});

Deno.test('banner: vai para o bucket banners, com limite próprio de dimensões', async () => {
  const { deps, uploaded, getBanner, getAvatar } = makeDeps();
  const handler = createHandler(deps);
  const banner = (body: BodyInit) =>
    new Request('http://localhost/profile-image?kind=banner', { method: 'POST', body, headers: { Authorization: 'Bearer valido' } });

  const res = await handler(banner(pngWithSize(1500, 500)));
  assertEquals(await res.json(), { path: `banners/${USER}/banner-1760000000000.png`, width: 1500, height: 500 });
  assertEquals(uploaded[0]?.kind, 'banner');
  assertEquals(getBanner(), `banners/${USER}/banner-1760000000000.png`);
  assertEquals(getAvatar(), `avatars/${USER}/avatar-1000.jpg`, 'a foto não muda');

  // 1500 px passa no banner, mas 2500 px já passaria do limite da foto; 4000 px passa do banner.
  assertEquals(inspectImage(pngWithSize(2500, 800)).ok, false);
  assertEquals((await handler(banner(pngWithSize(4000, 1000)))).status, 422);
});

Deno.test('tipo de imagem desconhecido é recusado', async () => {
  const { deps, uploaded } = makeDeps();
  const res = await createHandler(deps)(
    new Request('http://localhost/profile-image?kind=../avatars', { method: 'POST', body: fixtures.png, headers: { Authorization: 'Bearer valido' } }),
  );
  assertEquals(res.status, 400);
  assertEquals(uploaded, []);
});
