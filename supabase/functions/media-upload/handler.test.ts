// Testes da Edge Function media-upload no Deno, com o Supabase simulado.
// npm run test:functions
import { fixtures } from '../profile-image/fixtures.ts';
import { createHandler, PHOTO_LIMITS, type Deps } from './handler.ts';
import { videos } from './fixtures.ts';
import { inspectVideo, VIDEO_LIMITS } from './video.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}
function assert(cond: unknown, msg = 'falhou'): asserts cond {
  if (!cond) throw new Error(msg);
}

const ID = '11111111-1111-4111-8111-111111111111';

function deps(overrides: Partial<Deps> = {}) {
  const uploads: { target: string; path: string; type: string; size: number }[] = [];
  const removed: string[][] = [];
  const d: Deps = {
    getUserId: async (h) => (h === 'Bearer valido' ? 'user-1' : null),
    rateLimit: async () => true,
    upload: async (target, path, bytes, type) => void uploads.push({ target, path, type, size: bytes.byteLength }),
    garbage: async (target) => [`user-1/velho-${target}.jpg`],
    remove: async (_target, paths) => void removed.push(paths),
    newId: () => ID,
    log: () => {},
    ...overrides,
  };
  return { d, uploads, removed };
}

const post = (type: string, body: BodyInit | null, headers: Record<string, string> = {}, target = 'vibe') =>
  new Request(`http://x/media-upload?for=${target}&type=${type}`, { method: 'POST', body, headers: { Authorization: 'Bearer valido', ...headers } });

/** Copia um vídeo e troca a duração do mvhd (versão 0). */
function withDuration(src: Uint8Array, seconds: number): Uint8Array {
  const b = src.slice();
  const text = new TextDecoder('latin1').decode(b);
  const at = text.indexOf('mvhd');
  const view = new DataView(b.buffer);
  const timescale = view.getUint32(at + 4 + 12);
  view.setUint32(at + 4 + 16, seconds * timescale);
  return b;
}

Deno.test('vídeo: MP4 e MOV válidos, com duração e tamanho', () => {
  const mp4 = inspectVideo(videos.mp4);
  assert(mp4.ok);
  assertEquals([mp4.width, mp4.height], [64, 64]);
  assert(mp4.durationMs >= 900 && mp4.durationMs <= 1100);
  assert(inspectVideo(videos.mov).ok);
});

Deno.test('vídeo: longo demais, lixo, imagem, dados colados no fim e caixa cortada', () => {
  assertEquals(inspectVideo(withDuration(videos.mp4, 45)), { ok: false, error: 'video_too_long' });
  assertEquals(inspectVideo(new Uint8Array(100)), { ok: false, error: 'unsupported_video' });
  assertEquals(inspectVideo(fixtures.jpeg), { ok: false, error: 'unsupported_video' });
  const appended = new Uint8Array([...videos.mp4, ...new TextEncoder().encode('PK\x03\x04zip escondido')]);
  assertEquals(inspectVideo(appended), { ok: false, error: 'invalid_video' });
  assertEquals(inspectVideo(videos.mp4.subarray(0, videos.mp4.length - 10)), { ok: false, error: 'invalid_video' });
});

Deno.test('foto JPEG: grava no bucket com nome gerado e faz a faxina', async () => {
  const { d, uploads, removed } = deps();
  const res = await createHandler(d)(post('photo', fixtures.jpeg));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { path: `user-1/${ID}.jpg`, width: 64, height: 64 });
  assertEquals(uploads, [{ target: 'vibe', path: `user-1/${ID}.jpg`, type: 'image/jpeg', size: fixtures.jpeg.byteLength }]);
  assertEquals(removed, [['user-1/velho-vibe.jpg']]);
});

Deno.test('vídeo: grava como MP4 e devolve a duração', async () => {
  const { d, uploads } = deps();
  const res = await createHandler(d)(post('video', videos.mov));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.path, `user-1/${ID}.mp4`);
  assert(body.durationMs > 0);
  assertEquals(uploads[0]!.type, 'video/mp4');
});

Deno.test('recusas: sem login, tipo errado, PNG como foto, vídeo como foto, limite e tamanho', async () => {
  const { d, uploads } = deps();
  const handler = createHandler(d);
  assertEquals((await handler(new Request('http://x/media-upload?type=photo', { method: 'POST', body: fixtures.jpeg }))).status, 401);
  assertEquals((await handler(post('gif', fixtures.jpeg))).status, 400);
  assertEquals((await handler(post('photo', fixtures.jpeg, {}, 'outro'))).status, 400);
  assertEquals((await (await handler(post('photo', fixtures.png))).json()).error, 'unsupported_image');
  assertEquals((await (await handler(post('photo', videos.mp4))).json()).error, 'unsupported_image');
  assertEquals((await (await handler(post('video', fixtures.jpeg))).json()).error, 'unsupported_video');
  assertEquals((await handler(post('photo', new Uint8Array(PHOTO_LIMITS.maxBytes + 1)))).status, 413);
  assertEquals((await handler(post('video', null, { 'Content-Length': String(VIDEO_LIMITS.maxBytes + 1) }))).status, 413);
  const limited = createHandler(deps({ rateLimit: async () => false }).d);
  assertEquals((await limited(post('photo', fixtures.jpeg))).status, 429);
  assertEquals(uploads.length, 0);
});

Deno.test('faxina com erro não derruba o envio', async () => {
  const { d } = deps({ garbage: async () => { throw new Error('storage fora'); } });
  assertEquals((await createHandler(d)(post('photo', fixtures.jpeg))).status, 200);
});

Deno.test('post: grava no bucket dos posts e limpa os arquivos de post', async () => {
  const { d, uploads, removed } = deps();
  const res = await createHandler(d)(post('photo', fixtures.jpeg, {}, 'post'));
  assertEquals(res.status, 200);
  assertEquals(uploads[0]!.target, 'post');
  assertEquals(removed, [['user-1/velho-post.jpg']]);
});
