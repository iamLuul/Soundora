#!/usr/bin/env node
// Dados de teste para o Supabase LOCAL: contas, posts (com música e foto), comentários,
// respostas, curtidas, seguidores, vibes (inclusive com vários textos, fontes, cores e fundos) e
// swipes do Descobrir (com o cache de dados do Last.fm), para o app não ficar vazio nos testes.
//
//   npm run demo                 cria (ou recria) os dados de teste
//   npm run demo -- --remove     apaga só as contas de teste (e tudo delas)
//
// Precisa do `npx supabase start` rodando. Com o `npx supabase functions serve` aberto, as
// músicas ganham capa e gênero de verdade e as contas ganham foto, banner e posts com foto.
// As contas de teste usam o domínio @demo.soundora.dev; nada fora delas é apagado. As suas
// contas passam a seguir as de teste (e são seguidas por elas), para tudo aparecer no Início.
//
// Só roda contra o Supabase do seu PC: recusa qualquer endereço que não seja localhost.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const DOMAIN = 'demo.soundora.dev';
const PASSWORD = 'Soundhora2026demo';
const REMOVE = process.argv.includes('--remove');

// ---------------------------------------------------------------- conexão

function localConfig() {
  let status = {};
  const fromEnv = process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY;
  if (!fromEnv) try {
    status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    console.error('Não achei o Supabase local. Rode "npx supabase start" e tente de novo.');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL ?? status.API_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY ?? status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !publishable || !secret) {
    console.error('O "supabase status" não trouxe a URL e as chaves. Confira se o Supabase local está rodando.');
    process.exit(1);
  }
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    console.error(`Recusado: ${url} não é o Supabase local. Este script nunca roda em produção.`);
    process.exit(1);
  }
  return { url, publishable, secret };
}

const cfg = localConfig();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(cfg.url, cfg.secret, opts);

const must = (label) => ({ data, error }) => {
  if (error) throw new Error(`${label}: ${error.message ?? JSON.stringify(error)}`);
  return data;
};
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

// ---------------------------------------------------------------- imagens geradas

let Jimp = null;
try {
  Jimp = require('jimp-compact');
} catch {
  // sem gerador de imagem: as contas ficam sem foto e não há posts/vibes com foto
}

const PALETTES = [
  ['#7B61FF', '#FF6FB5'],
  ['#1FA2FF', '#12D8FA'],
  ['#F7971E', '#FFD200'],
  ['#11998E', '#38EF7D'],
  ['#FC466B', '#3F5EFB'],
  ['#8E2DE2', '#4A00E0'],
  ['#FF512F', '#DD2476'],
];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** JPEG com degradê e círculos (capa abstrata), do tamanho pedido. */
async function makeJpeg(width, height, seed) {
  if (!Jimp) return null;
  const [a, b] = PALETTES[seed % PALETTES.length].map(hex);
  const img = await new Promise((resolve, reject) => new Jimp(width, height, (err, image) => (err ? reject(err) : resolve(image))));
  const circles = Array.from({ length: 4 }, (_, i) => ({
    x: ((seed * 97 + i * 211) % 100) / 100 * width,
    y: ((seed * 53 + i * 137) % 100) / 100 * height,
    r: (0.12 + ((seed + i) % 5) * 0.06) * Math.min(width, height),
  }));
  img.scan(0, 0, width, height, function (x, y, idx) {
    const t = (x / width + y / height) / 2;
    let [r, g, bl] = [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * t);
    for (const c of circles) {
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r ** 2) [r, g, bl] = [r, g, bl].map((v) => v * 0.75 + 255 * 0.25);
    }
    this.bitmap.data[idx] = r;
    this.bitmap.data[idx + 1] = g;
    this.bitmap.data[idx + 2] = bl;
    this.bitmap.data[idx + 3] = 255;
  });
  img.quality(85);
  return new Uint8Array(await img.getBufferAsync('image/jpeg'));
}

/** Chama uma Edge Function como a pessoa (o mesmo caminho do app). */
async function callFunction(session, path, body, contentType) {
  const res = await fetch(`${cfg.url}/functions/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: cfg.publishable, 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---------------------------------------------------------------- conteúdo

const PEOPLE = [
  { username: 'marina.sons', name: 'Marina Lopes', bio: 'MPB, bossa e um café. Sempre caçando disco bom.', genres: ['mpb', 'bossa_nova', 'samba'], platform: 'spotify' },
  { username: 'caio.beats', name: 'Caio Beats', bio: 'Produtor nas horas vagas. Trap, funk e o que tiver grave.', genres: ['trap', 'funk_br', 'hip_hop'], platform: 'youtube_music' },
  { username: 'lua.indie', name: 'Luana', bio: 'indie, shoegaze e playlists pra dias nublados ☁️', genres: ['indie', 'shoegaze', 'alternative'], platform: 'apple_music' },
  { username: 'dj.tavares', name: 'DJ Tavares', bio: 'House e techno toda sexta. Set novo saindo.', genres: ['house', 'techno', 'electronic'], platform: 'deezer' },
  { username: 'bia.ramos', name: 'Bia Ramos', bio: 'pop girl assumida. Se tem refrão chiclete, eu tô ouvindo.', genres: ['pop', 'k_pop', 'r_and_b'], platform: 'spotify' },
  { username: 'theo.rock', name: 'Théo Martins', bio: 'Guitarra, vinil e show pequeno. Rock até o fim.', genres: ['rock', 'punk', 'metal'], platform: 'tidal' },
];

const SONGS = {
  aguas: { artist: 'Elis Regina', title: 'Águas de Março', genres: ['mpb', 'bossa_nova'] },
  garota: { artist: 'Tom Jobim', title: 'Garota de Ipanema', genres: ['bossa_nova'] },
  tudo: { artist: 'Marina Sena', title: 'Por Supuesto', genres: ['mpb', 'pop'] },
  sicko: { artist: 'Travis Scott', title: 'SICKO MODE', genres: ['hip_hop', 'trap'] },
  bum: { artist: 'Anitta', title: 'Envolver', genres: ['latin', 'pop'] },
  sometimes: { artist: 'My Bloody Valentine', title: 'Sometimes', genres: ['shoegaze'] },
  reptilia: { artist: 'The Strokes', title: 'Reptilia', genres: ['indie', 'rock'] },
  strobe: { artist: 'deadmau5', title: 'Strobe', genres: ['electronic', 'house'] },
  oneMore: { artist: 'Daft Punk', title: 'One More Time', genres: ['house', 'electronic'] },
  espresso: { artist: 'Sabrina Carpenter', title: 'Espresso', genres: ['pop'] },
  supernova: { artist: 'aespa', title: 'Supernova', genres: ['k_pop'] },
  everlong: { artist: 'Foo Fighters', title: 'Everlong', genres: ['rock'] },
  chop: { artist: 'System Of A Down', title: 'Chop Suey!', genres: ['metal'] },
};

const POSTS = [
  { by: 'marina.sons', song: 'aguas', body: 'domingo pede Elis. "é pau, é pedra, é o fim do caminho" 🌧️', at: 35 },
  { by: 'marina.sons', song: 'garota', body: 'clássico que nunca cansa', at: 60 * 26 },
  { by: 'marina.sons', song: 'tudo', body: 'a Marina Sena não erra uma, que disco', at: 60 * 50 },
  { by: 'caio.beats', song: 'sicko', body: 'esse beat switch ainda me arrepia', at: 80 },
  { by: 'caio.beats', photos: 2, body: 'montando o home studio novo, aceito dicas de monitor 🎧', at: 60 * 5 },
  { by: 'caio.beats', song: 'bum', body: 'impossível ficar parado', at: 60 * 30 },
  { by: 'lua.indie', song: 'sometimes', body: 'trilha sonora oficial de ficar olhando a janela', at: 20 },
  { by: 'lua.indie', song: 'reptilia', body: 'o riff de Reptilia é perfeito e eu não aceito discussão', at: 60 * 9 },
  { by: 'lua.indie', body: 'alguém indica um shoegaze brasileiro? quero descobrir banda nova', at: 60 * 20 },
  { by: 'dj.tavares', song: 'strobe', body: '10 minutos de pura construção. ouçam com fone', at: 120 },
  { by: 'dj.tavares', photos: 1, song: 'oneMore', body: 'ontem no set fechei com essa e a pista veio abaixo', at: 60 * 14 },
  { by: 'bia.ramos', song: 'espresso', body: 'that’s that me espresso ☕', at: 10 },
  { by: 'bia.ramos', song: 'supernova', body: 'aespa sempre entregando conceito', at: 60 * 40 },
  { by: 'bia.ramos', body: 'qual foi o último show que vocês foram? o meu foi incrível', at: 60 * 3 },
  { by: 'theo.rock', song: 'everlong', body: 'a melhor música de rock dos anos 90, fim', at: 45 },
  { by: 'theo.rock', photos: 3, body: 'garimpo de vinil de hoje 💿', at: 60 * 7 },
  { by: 'theo.rock', song: 'chop', body: 'pra acordar o vizinho', at: 60 * 60 },
];

const COMMENTS = [
  'que som!',
  'salvei aqui, valeu pela indicação',
  'essa é das minhas favoritas',
  'ouvindo agora 🔥',
  'não conhecia, que achado',
  'concordo demais',
  'clássico absoluto',
  'me levou de volta pra 2015 kkk',
  'o refrão não sai da minha cabeça',
];
const REPLIES = ['né?? demais', 'também acho!', 'manda mais desse estilo', 'kkkk exato'];

// ---------------------------------------------------------------- etapas

async function removeDemoUsers() {
  const ids = [];
  for (let page = 1; ; page++) {
    const { users } = must('listar usuários')(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    ids.push(...users.filter((u) => u.email?.endsWith(`@${DOMAIN}`)).map((u) => u.id));
    if (users.length < 1000) break;
  }
  for (const id of ids) must('apagar usuário')(await admin.auth.admin.deleteUser(id));
  return ids.length;
}

/** Busca a música na Deezer (link de faixa real) para o link-preview indexar. */
async function deezerTrack(song) {
  const q = encodeURIComponent(`artist:"${song.artist}" track:"${song.title}"`);
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
    const hit = (await res.json())?.data?.[0];
    return hit ? { url: `https://www.deezer.com/track/${hit.id}`, id: String(hit.id), cover: hit.album?.cover_big ?? null } : null;
  } catch {
    return null;
  }
}

/** Cartão da música: pelo link-preview (capa, gênero, prévia); sem ele, direto no banco. */
async function musicPreview(session, song, warnings) {
  const found = await deezerTrack(song);
  if (!found) {
    warnings.add('Sem internet para buscar as músicas na Deezer: os posts saíram só com texto.');
    return null;
  }
  try {
    const { preview } = await callFunction(session, 'link-preview', { url: found.url }, 'application/json');
    return preview.id;
  } catch {
    warnings.add('O link-preview não respondeu (rode "npx supabase functions serve"): as músicas entraram sem gênero e sem prévia.');
    const row = must('salvar música')(
      await admin
        .from('link_previews')
        .upsert(
          { url: found.url, platform: 'deezer', kind: 'track', provider_id: found.id, title: song.title, artist: song.artist, image_url: found.cover, genres: song.genres },
          { onConflict: 'url' },
        )
        .select('id')
        .single(),
    );
    return row.id;
  }
}

async function uploadPhoto(session, target, width, height, seed, warnings) {
  const bytes = await makeJpeg(width, height, seed);
  if (!bytes) {
    warnings.add('Sem gerador de imagens (jimp): nada de foto nas contas, posts e vibes.');
    return null;
  }
  try {
    return await callFunction(session, `media-upload?for=${target}&type=photo`, bytes, 'image/jpeg');
  } catch {
    warnings.add('O media-upload não respondeu (rode "npx supabase functions serve"): posts e vibes saíram sem foto.');
    return null;
  }
}

async function main() {
  const removed = await removeDemoUsers();
  if (REMOVE) {
    console.log(`Pronto: ${removed} conta(s) de teste apagada(s).`);
    return;
  }
  if (removed) console.log(`Contas de teste antigas apagadas (${removed}); criando de novo...`);

  const warnings = new Set();
  const realUsers = must('ler perfis')(await admin.from('profiles').select('id, username'));

  // Contas
  const people = [];
  for (const [i, p] of PEOPLE.entries()) {
    const email = `${p.username.replace('.', '_')}@${DOMAIN}`;
    const user = must(`criar ${p.username}`)(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).user;
    const client = createClient(cfg.url, cfg.publishable, opts);
    const { session } = must(`entrar como ${p.username}`)(await client.auth.signInWithPassword({ email, password: PASSWORD }));
    must(`cadastro de ${p.username}`)(
      await client.rpc('complete_onboarding', {
        p_username: p.username,
        p_display_name: p.name,
        p_birthdate: `${1990 + i}-0${(i % 9) + 1}-1${i}`,
        p_genres: p.genres,
        p_locale: 'pt-BR',
        p_streaming_platform: p.platform,
      }),
    );
    must(`bio de ${p.username}`)(await client.from('profiles').update({ bio: p.bio }).eq('id', user.id));
    for (const [kind, w, h] of [
      ['avatar', 512, 512],
      ['banner', 1500, 500],
    ]) {
      const bytes = await makeJpeg(w, h, i * 3 + (kind === 'banner' ? 1 : 0));
      if (bytes) await callFunction(session, `profile-image?kind=${kind}`, bytes, 'image/jpeg').catch(() => warnings.add('Sem o profile-image rodando: as contas ficaram sem foto e banner.'));
    }
    people.push({ ...p, id: user.id, email, client, session });
  }
  const byName = Object.fromEntries(people.map((p) => [p.username, p]));
  const ids = people.map((p) => p.id);

  // Seguidores: as de teste se seguem, e as suas contas seguem e são seguidas por elas.
  const follows = [];
  for (const a of people) for (const b of pick(people.filter((x) => x !== a), 4)) follows.push({ follower_id: a.id, followee_id: b.id });
  for (const r of realUsers) for (const p of people) follows.push({ follower_id: r.id, followee_id: p.id }, { follower_id: p.id, followee_id: r.id });
  must('seguir')(await admin.from('follows').upsert(follows, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true }));

  // Posts
  const previews = {};
  const posts = [];
  for (const [n, post] of POSTS.entries()) {
    const author = byName[post.by];
    let previewId = null;
    if (post.song) {
      previews[post.song] ??= await musicPreview(author.session, SONGS[post.song], warnings);
      previewId = previews[post.song];
    }
    const media = [];
    for (let k = 0; k < (post.photos ?? 0); k++) {
      const up = await uploadPhoto(author.session, 'post', 1080, 1080, n * 5 + k, warnings);
      if (up) media.push({ path: up.path, kind: 'photo', width: up.width, height: up.height, duration_ms: null });
    }
    if (!previewId && !media.length && !post.body) continue;
    const id = must(`post de ${post.by}`)(
      await author.client.rpc('post_create', { p_body: post.body, p_link_preview_id: previewId, p_genres: previewId ? SONGS[post.song].genres : [], p_media: media }),
    );
    must('data do post')(await admin.from('posts').update({ created_at: minutesAgo(post.at) }).eq('id', id));
    posts.push({ id, author: author.id });
  }

  // Curtidas, comentários e respostas (também nos posts das suas contas, para chegar notificação).
  const realPosts = must('ler seus posts')(await admin.from('posts').select('id, author_id').not('author_id', 'in', `(${ids.join(',')})`).order('created_at', { ascending: false }).limit(10));
  const allPosts = [...posts, ...realPosts.map((p) => ({ id: p.id, author: p.author_id }))];
  const likes = [];
  for (const post of allPosts) for (const p of pick(people.filter((x) => x.id !== post.author), 2 + Math.floor(Math.random() * 4))) likes.push({ user_id: p.id, post_id: post.id });
  must('curtir')(await admin.from('likes').upsert(likes, { onConflict: 'user_id,post_id', ignoreDuplicates: true }));

  let commentCount = 0;
  for (const post of allPosts) {
    for (const p of pick(people.filter((x) => x.id !== post.author), Math.floor(Math.random() * 3))) {
      const c = must('comentar')(
        await admin.from('comments').insert({ post_id: post.id, author_id: p.id, body: pick(COMMENTS, 1)[0] }).select('id').single(),
      );
      commentCount++;
      if (Math.random() < 0.5) {
        const other = pick(people.filter((x) => x.id !== p.id), 1)[0];
        must('responder')(await admin.from('comments').insert({ post_id: post.id, author_id: other.id, body: `@${p.username} ${pick(REPLIES, 1)[0]}`, parent_id: c.id }));
        must('curtir comentário')(await admin.from('comment_likes').insert({ user_id: other.id, comment_id: c.id }));
        commentCount++;
      }
    }
  }

  // Vibes (somem em 24 h: rode o script de novo para renovar).
  const vibe = async (p, args) => must(`vibe de ${p.username}`)(await p.client.rpc('vibe_create', { p_style: 'violet', ...args }));
  // Textos soltos na tela: { t, x, y, f: fonte, c: cor, b: fundo }, como o editor do app monta.
  const item = (t, x, y, f = 'classic', c = 'white', b = 'none') => ({ t, x, y, f, c, b });
  const TEXT_SETS = [
    [item('bom dia com música alta', 0.5, 0.4, 'strong', 'white', 'none'), item('☀️', 0.5, 0.58, 'classic', 'yellow', 'none')],
    [item('sextou 🎶', 0.5, 0.3, 'script', 'pink', 'none'), item('quem vem?', 0.35, 0.55, 'typewriter', 'black', 'solid'), item('às 22h', 0.68, 0.68, 'modern', 'white', 'soft')],
    [item('fone no máximo', 0.5, 0.45, 'serif', 'cyan', 'soft')],
    [item('qual música vocês', 0.5, 0.36, 'modern', 'white', 'none'), item('tão ouvindo hoje?', 0.5, 0.46, 'modern', 'yellow', 'none'), item('responde aqui 👇', 0.5, 0.75, 'script', 'green', 'solid')],
    [item('show sábado', 0.5, 0.35, 'strong', 'orange', 'solid'), item('quem vai?', 0.6, 0.52, 'typewriter', 'white', 'none')],
    [item('playlist nova', 0.4, 0.4, 'serif', 'violet', 'soft'), item('no forno', 0.62, 0.52, 'script', 'white', 'none'), item('🔥', 0.5, 0.7, 'classic', 'red', 'none')],
  ];
  let vibeCount = 0;
  for (const [i, p] of people.entries()) {
    const styles = ['violet', 'blue', 'pink', 'green', 'orange', 'dark'];
    // Vibe de texto com vários textos (a última pessoa usa o formato antigo, de um texto só).
    if (i < TEXT_SETS.length - 1) await vibe(p, { p_kind: 'text', p_text_items: TEXT_SETS[i], p_style: styles[i] });
    else await vibe(p, { p_kind: 'text', p_text: 'playlist nova no forno', p_style: styles[i], p_text_x: 0.5, p_text_y: 0.45 });
    vibeCount++;
    const song = Object.keys(previews).find((k) => previews[k] && POSTS.some((x) => x.by === p.username && x.song === k));
    if (song) {
      await vibe(p, { p_kind: 'music', p_link_preview_id: previews[song], p_text_items: [item('no repeat 🔁', 0.5, 0.22, 'strong', 'white', 'soft')], p_style: styles[(i + 2) % 6] });
      vibeCount++;
    }
    const photo = await uploadPhoto(p.session, 'vibe', 1080, 1920, 40 + i, warnings);
    if (photo) {
      const caption = i % 2 ? [item('vista de hoje', 0.5, 0.84, 'script', 'white', 'none'), item('📍 casa', 0.3, 0.12, 'typewriter', 'white', 'solid')] : null;
      await vibe(p, { p_kind: 'photo', p_media_path: photo.path, p_text_items: caption });
      vibeCount++;
    }
    const shared = pick(posts.filter((x) => x.author !== p.id), 1)[0];
    if (shared && i % 2 === 0) {
      await vibe(p, { p_kind: 'post', p_post_id: shared.id, p_style: styles[(i + 4) % 6] });
      vibeCount++;
    }
  }

  // Descobrir: cada pessoa já deslizou em algumas músicas dos posts das outras, e o cache de
  // dados do Last.fm (o que o card mostra) fica pronto para elas, sem depender da chave da API.
  const songIds = [...new Set(Object.values(previews).filter(Boolean))];
  let swipeCount = 0;
  if (songIds.length) {
    const rows = must('ler músicas')(await admin.from('link_previews').select('id, title, artist, image_url').in('id', songIds));
    const cache = rows.map((r) => ({ link_preview_id: r.id, found: true, title: r.title, artist: r.artist, album: null, image_url: r.image_url?.startsWith('https://') ? r.image_url : null }));
    must('cache do Last.fm')(await admin.from('lastfm_tracks').upsert(cache, { onConflict: 'link_preview_id' }));
    const swipes = people.flatMap((p, i) => songIds.filter((_, k) => (k + i) % 3 !== 0).map((id, k) => ({ user_id: p.id, link_preview_id: id, liked: (k + i) % 4 !== 0 })));
    must('swipes do Descobrir')(await admin.from('discover_swipes').upsert(swipes, { onConflict: 'user_id,link_preview_id', ignoreDuplicates: true }));
    swipeCount = swipes.length;
  }

  console.log(`\nPronto! ${people.length} contas, ${posts.length} posts, ${likes.length} curtidas, ${commentCount} comentários, ${vibeCount} vibes e ${swipeCount} swipes no Descobrir.`);
  if (realUsers.length) console.log(`Suas contas (${realUsers.map((r) => '@' + r.username).join(', ')}) agora seguem as de teste e são seguidas por elas.`);
  else console.log('Nenhuma conta sua ainda: crie a sua no app e rode de novo para seguir as de teste.');
  console.log(`\nPara entrar como uma delas: @${PEOPLE[0].username} (ou ${people[0].email}), senha ${PASSWORD}`);
  for (const w of warnings) console.log(`Aviso: ${w}`);
}

main().catch((err) => {
  console.error(`\nFalhou: ${err.message}`);
  process.exit(1);
});
