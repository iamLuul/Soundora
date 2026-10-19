#!/usr/bin/env node
// Carga para teste de desempenho no Supabase LOCAL: centenas de contas e milhares de posts,
// curtidas, comentários, respostas, seguidores, vibes (com um ou vários textos estilizados),
// curtidas do Descobrir e cache de dados do Last.fm, espalhados
// pelos últimos dias, para ver como o app se comporta com o banco cheio.
//
//   npm run load                       carga média (300 contas, 3.000 posts)
//   npm run load -- --scale small      100 contas, 1.000 posts
//   npm run load -- --scale large      1.000 contas, 10.000 posts
//   npm run load -- --users 500 --posts 6000
//   npm run load -- --remove           apaga só as contas de carga (e tudo delas, fotos inclusive)
//   npm run load -- --no-media         sem fotos e vídeos (mais rápido)
//
// Fotos e vídeos de bancos públicos feitos para teste: retratos do randomuser.me (fotos de
// perfil), fotos do Lorem Picsum (Unsplash; banners e posts) e trechos de 10 s dos filmes
// abertos da Blender Foundation (Big Buck Bunny, Sintel; CC BY) em test-videos.co.uk.
// Cada arquivo é baixado uma vez e copiado dentro do Storage para cada conta.
//
// Precisa do `npx supabase start` rodando. Com internet, as músicas vêm das paradas da Deezer
// (capa, álbum e prévia de verdade); sem internet, entram só com título e artista.
// As contas de carga usam o domínio @load.soundora.dev; nada fora delas é apagado. As suas
// contas passam a seguir parte delas (e são seguidas), para o Início e as vibes encherem, e
// os seus posts recebem curtidas e comentários (notificações). Enquanto roda, os tokens de
// push das suas contas ficam guardados, para o celular não receber centenas de avisos.
//
// Só roda contra o Supabase do seu PC: recusa qualquer endereço que não seja localhost.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const DOMAIN = 'load.soundora.dev';
const PASSWORD = 'Soundhora2026load';
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const REMOVE = flag('remove');
const NO_MEDIA = flag('no-media');
const SCALES = { small: [100, 1000], medium: [300, 3000], large: [1000, 10000] };
const [defUsers, defPosts] = SCALES[option('scale') ?? 'medium'] ?? SCALES.medium;
const N_USERS = Math.max(20, Number(option('users') ?? defUsers));
const N_POSTS = Math.max(50, Number(option('posts') ?? defPosts));
const DAYS = 14;

// ---------------------------------------------------------------- conexão

function localConfig() {
  let status = {};
  const fromEnv = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY;
  if (!fromEnv)
    try {
      status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      console.error('Não achei o Supabase local. Rode "npx supabase start" e tente de novo.');
      process.exit(1);
    }
  const url = process.env.SUPABASE_URL ?? status.API_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !secret) {
    console.error('O "supabase status" não trouxe a URL e a chave. Confira se o Supabase local está rodando.');
    process.exit(1);
  }
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    console.error(`Recusado: ${url} não é o Supabase local. Este script nunca roda em produção.`);
    process.exit(1);
  }
  return { url, secret };
}

const cfg = localConfig();
const admin = createClient(cfg.url, cfg.secret, { auth: { persistSession: false, autoRefreshToken: false } });

const must =
  (label) =>
  ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message ?? JSON.stringify(error)}`);
    return data;
  };

// Aleatório com semente (a mesma carga a cada execução, fácil de comparar).
let seed = 20261012;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const one = (list) => list[Math.floor(rand() * list.length)];
const some = (list, n) => {
  const copy = [...list];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};
/** Popularidade com cauda longa: a maioria pequena, poucos muito grandes. */
const pareto = (min, alpha, cap) => Math.min(cap, Math.floor(min / Math.pow(1 - rand(), 1 / alpha)));
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;

/** Executa tarefas com no máximo `limit` ao mesmo tempo. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Insere em lotes; devolve as linhas pedidas em `select`. */
async function insertBatches(table, rows, { size = 500, select = null, upsert = null } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    let q = upsert ? admin.from(table).upsert(chunk, { onConflict: upsert, ignoreDuplicates: true }) : admin.from(table).insert(chunk);
    if (select) q = q.select(select);
    const data = must(`inserir em ${table}`)(await q);
    if (select) out.push(...data);
    progress(table, Math.min(i + size, rows.length), rows.length);
  }
  return out;
}

function progress(label, done, total) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r  ${label}: ${done}/${total}${done === total ? '\n' : ''}`);
}

// ---------------------------------------------------------------- conteúdo

const FIRST = ['Ana', 'Bia', 'Caio', 'Duda', 'Enzo', 'Fê', 'Gabi', 'Heitor', 'Iris', 'João', 'Kaio', 'Lara', 'Malu', 'Nina', 'Otto', 'Pedro', 'Quim', 'Rafa', 'Sofia', 'Theo', 'Uli', 'Vivi', 'Will', 'Xande', 'Yasmin', 'Zé', 'Lia', 'Davi', 'Luna', 'Bento', 'Cecília', 'Gael', 'Maya', 'Noah', 'Olívia', 'Tom'];
const LAST = ['Silva', 'Souza', 'Lima', 'Costa', 'Rocha', 'Alves', 'Ramos', 'Nunes', 'Melo', 'Pires', 'Dias', 'Teixeira', 'Barros', 'Moura', 'Freitas', 'Campos', 'Viana', 'Lopes'];
const TAGS = ['beats', 'sons', 'music', 'vinil', 'playlist', 'groove', 'dj', 'rock', 'indie', 'bass', 'fone', 'noise', 'samba', 'lofi'];
const BIOS = [
  'ouvindo música desde sempre 🎧',
  'colecionador de vinil e de playlists',
  'DJ nas horas vagas',
  'indie, shoegaze e café',
  'se tem batida, eu tô dentro',
  'MPB e chuva na janela',
  'show toda semana',
  'trilha sonora pra tudo',
  null,
  null,
];
const GENRES = ['pop', 'rock', 'indie', 'hip_hop', 'trap', 'electronic', 'house', 'mpb', 'samba', 'funk_br', 'sertanejo', 'pagode', 'r_and_b', 'jazz', 'metal', 'k_pop', 'latin', 'reggae', 'alternative', 'lo_fi', 'dance', 'soul', 'bossa_nova', 'forro'];
const POST_TEXT = [
  'que som!! não sai da minha cabeça',
  'essa aqui pra começar o dia',
  'trilha sonora oficial da semana',
  'alguém mais viciado nessa?',
  'refrão perfeito, sem defeitos',
  'ouçam com fone, por favor',
  'descoberta do dia 🔥',
  'pra ouvir no último volume',
  'clássico que nunca cansa',
  'essa versão ao vivo é outra coisa',
  'domingo pede essa',
  'no repeat desde ontem 🔁',
  '',
];
const TEXT_ONLY = [
  'qual foi o último show que vocês foram?',
  'me indiquem uma banda nova, tô sem nada pra ouvir',
  'playlist de corrida: aceito sugestões',
  'fone quebrou e eu tô de luto',
  'quem vai no festival esse ano?',
  'disco novo saindo sexta, ansioso demais',
  'tem coisa melhor que descobrir música boa no domingo?',
  'unpopular opinion: o segundo álbum é melhor que o primeiro',
];
const COMMENTS = ['que som!', 'salvei aqui', 'essa é das minhas favoritas', 'ouvindo agora 🔥', 'não conhecia, que achado', 'concordo demais', 'clássico absoluto', 'o refrão não sai da cabeça', 'que produção!', 'perfeita pra viagem', 'ao vivo é melhor ainda', 'manda mais desse estilo'];
const REPLIES = ['né?? demais', 'também acho!', 'kkkk exato', 'vou ouvir agora', 'boa demais'];
const MEDIA_TEXT = ['olha que foto desse show 📸', 'meu setup de hoje', 'garimpo de vinil 💿', 'ensaio da banda', 'fim de tarde com fone', 'trecho do show de ontem 🎥', '', 'bastidores', 'o palco tava assim'];
const VIBE_TEXT = ['bom dia com música alta', 'sextou 🎶', 'fone no máximo', 'qual música vocês tão ouvindo hoje?', 'show sábado, quem vai?', 'playlist nova no forno', 'no repeat 🔁'];
const FONTS = ['classic', 'modern', 'strong', 'serif', 'typewriter', 'script'];
const TEXT_COLORS = ['white', 'black', 'violet', 'blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink'];
const TEXT_BGS = ['none', 'solid', 'soft'];
/** 1 a 4 textos soltos na tela, cada um com fonte, cor e fundo (o formato text_items das vibes). */
const textItems = (max = 4) => Array.from({ length: int(1, max) }, () => ({ t: one(VIBE_TEXT), x: +(0.25 + rand() * 0.5).toFixed(2), y: +(0.15 + rand() * 0.7).toFixed(2), f: one(FONTS), c: one(TEXT_COLORS), b: one(TEXT_BGS) }));
const joinTexts = (items) => items.map((i) => i.t).join('\n').slice(0, 300);
/** Textos de uma vibe: com a chance dada, nenhum; senão vários textos estilizados (60%) ou o formato antigo, de um texto só. */
const vibeTexts = (chance, max) => {
  if (rand() >= chance) return { text: null };
  if (rand() < 0.6) {
    const items = textItems(max);
    return { text: joinTexts(items), text_items: items };
  }
  return { text: one(VIBE_TEXT), text_x: 0.5, text_y: 0.45 };
};
const STYLES = ['violet', 'blue', 'pink', 'green', 'orange', 'dark'];

// Paradas da Deezer por gênero → slug do Soundhora.
const DEEZER_CHARTS = [
  [0, 'pop'], [132, 'pop'], [116, 'hip_hop'], [152, 'rock'], [113, 'dance'], [165, 'r_and_b'],
  [85, 'alternative'], [106, 'electronic'], [197, 'latin'], [464, 'metal'], [144, 'reggae'], [129, 'jazz'],
];
const OFFLINE_SONGS = [
  ['Elis Regina', 'Águas de Março', 'mpb'], ['Tom Jobim', 'Garota de Ipanema', 'bossa_nova'], ['Travis Scott', 'SICKO MODE', 'hip_hop'],
  ['Anitta', 'Envolver', 'latin'], ['The Strokes', 'Reptilia', 'indie'], ['deadmau5', 'Strobe', 'electronic'], ['Daft Punk', 'One More Time', 'house'],
  ['Sabrina Carpenter', 'Espresso', 'pop'], ['aespa', 'Supernova', 'k_pop'], ['Foo Fighters', 'Everlong', 'rock'], ['System Of A Down', 'Chop Suey!', 'metal'],
  ['Marília Mendonça', 'Infiel', 'sertanejo'], ['Péricles', 'Até Que Durou', 'pagode'], ['Djavan', 'Oceano', 'mpb'], ['Kendrick Lamar', 'Not Like Us', 'hip_hop'],
  ['Billie Eilish', 'BIRDS OF A FEATHER', 'pop'], ['Arctic Monkeys', 'Do I Wanna Know?', 'indie'], ['Bob Marley', 'Is This Love', 'reggae'], ['Miles Davis', 'So What', 'jazz'],
  ['Ludmilla', 'Maldivas', 'funk_br'], ['Frank Ocean', 'Pink + White', 'r_and_b'], ['Tame Impala', 'The Less I Know The Better', 'alternative'], ['Fred again..', 'Delilah', 'house'],
];

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Músicas para os posts: paradas da Deezer (com capa e prévia) ou a lista offline. */
async function songs() {
  const found = new Map();
  for (const [id, genre] of DEEZER_CHARTS) {
    const data = await fetchJson(`https://api.deezer.com/chart/${id}/tracks?limit=100`);
    for (const t of data?.data ?? []) {
      if (!t?.id || found.has(t.id)) continue;
      found.set(t.id, {
        url: `https://www.deezer.com/track/${t.id}`,
        platform: 'deezer',
        kind: 'track',
        provider_id: String(t.id),
        title: String(t.title ?? '').slice(0, 200) || 'Sem título',
        artist: String(t.artist?.name ?? '').slice(0, 200) || null,
        album: t.album?.title ? String(t.album.title).slice(0, 200) : null,
        image_url: /^https:\/\//.test(t.album?.cover_big ?? '') ? t.album.cover_big : null,
        artist_image_url: /^https:\/\//.test(t.artist?.picture_medium ?? '') ? t.artist.picture_medium : null,
        audio_url: /^https:\/\/([a-z0-9-]+\.)*dzcdn\.net\//.test(t.preview ?? '') ? t.preview : null,
        genres: [genre],
        store_checked_at: new Date().toISOString(),
      });
    }
  }
  if (found.size) return { list: [...found.values()], online: true };
  // Teste do script sem internet com muitas músicas (LOAD_FAKE_SONGS=1200).
  const fake = Number(process.env.LOAD_FAKE_SONGS ?? 0);
  if (fake > 0)
    return {
      online: false,
      list: Array.from({ length: fake }, (_, i) => ({ url: `https://www.deezer.com/track/${980000000 + i}`, platform: 'deezer', kind: 'track', provider_id: String(980000000 + i), title: `Faixa ${i}`, artist: `Artista ${i % 97}`, genres: [GENRES[i % GENRES.length]] })),
    };
  return {
    online: false,
    list: OFFLINE_SONGS.map(([artist, title, genre], i) => ({
      url: `https://www.deezer.com/track/${990000000 + i}`,
      platform: 'deezer',
      kind: 'track',
      provider_id: String(990000000 + i),
      title,
      artist,
      genres: [genre],
    })),
  };
}

// ---------------------------------------------------------------- fotos e vídeos

const VIDEOS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
];
const PHOTO_SIZES = [
  [720, 900],
  [720, 720],
  [900, 720],
  [720, 1280],
];
const BUCKET_LIMIT = { avatars: 1_000_000, banners: 2_000_000, 'post-media': 30_000_000, vibes: 30_000_000 };

async function download(url, type, maxBytes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith(type)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Baixa um conjunto pequeno de cada tipo (reaproveitado em todas as contas). */
async function mediaPool() {
  if (NO_MEDIA) return null;
  if (process.env.LOAD_FAKE_MEDIA) {
    const fake = (n) => new Uint8Array(n).fill(7);
    return {
      avatars: Array.from({ length: 4 }, () => fake(100)),
      banners: Array.from({ length: 2 }, () => fake(100)),
      photos: PHOTO_SIZES.map(([w, h]) => ({ buf: fake(100), w, h })),
      videos: [{ buf: fake(100), w: 640, h: 360, ms: 10000 }],
    };
  }
  const avatarUrls = Array.from({ length: 40 }, (_, i) => `https://randomuser.me/api/portraits/${i % 2 ? 'men' : 'women'}/${Math.floor(i / 2) * 3 + 1}.jpg`);
  const bannerUrls = Array.from({ length: 16 }, (_, i) => `https://picsum.photos/seed/soundora-banner-${i}/1500/500.jpg`);
  const photoSpecs = Array.from({ length: 40 }, (_, i) => PHOTO_SIZES[i % PHOTO_SIZES.length]);
  let done = 0;
  const total = avatarUrls.length + bannerUrls.length + photoSpecs.length + VIDEOS.length;
  const step = (x) => (progress('baixando fotos e vídeos', ++done, total), x);
  const avatars = (await pool(avatarUrls, 6, async (u) => step(await download(u, 'image/jpeg', BUCKET_LIMIT.avatars)))).filter(Boolean);
  const banners = (await pool(bannerUrls, 6, async (u) => step(await download(u, 'image/jpeg', BUCKET_LIMIT.banners)))).filter(Boolean);
  const photos = (
    await pool(photoSpecs, 6, async ([w, h], i) => {
      const buf = await download(`https://picsum.photos/seed/soundora-post-${i}/${w}/${h}.jpg`, 'image/jpeg', 5_000_000);
      return step(buf ? { buf, w, h } : null);
    })
  ).filter(Boolean);
  const videos = (
    await pool(VIDEOS, 3, async (u) => {
      const buf = await download(u, 'video/mp4', 10_000_000);
      return step(buf ? { buf, w: 640, h: 360, ms: 10000 } : null);
    })
  ).filter(Boolean);
  if (!avatars.length && !photos.length) return null;
  return { avatars, banners, photos, videos };
}

/**
 * Sobe cada arquivo do conjunto uma vez (pasta seed/ do bucket) e copia no próprio Storage
 * para o caminho de cada conta (bem mais rápido que subir de novo).
 */
function storageCopier() {
  const seeds = new Map();
  const seed = async (bucket, key, buf, contentType) => {
    const id = `${bucket}/${key}`;
    if (!seeds.has(id)) {
      seeds.set(
        id,
        (async () => {
          must(`subir ${id}`)(await admin.storage.from(bucket).upload(`seed/${key}`, buf, { contentType, upsert: true }));
          return `seed/${key}`;
        })(),
      );
    }
    return seeds.get(id);
  };
  return {
    async copy(bucket, key, buf, contentType, to) {
      const from = await seed(bucket, key, buf, contentType);
      must(`copiar para ${bucket}/${to}`)(await admin.storage.from(bucket).copy(from, to));
    },
    async cleanup() {
      const byBucket = {};
      for (const id of seeds.keys()) {
        const [bucket, ...rest] = id.split('/');
        (byBucket[bucket] ??= []).push(`seed/${rest.join('/')}`);
      }
      for (const [bucket, paths] of Object.entries(byBucket)) await admin.storage.from(bucket).remove(paths);
    },
  };
}

/** Apaga do Storage as pastas das contas de carga (fotos de perfil, banners, posts e vibes). */
async function removeUserMedia(userIds) {
  const wanted = new Set(userIds);
  let removed = 0;
  for (const bucket of Object.keys(BUCKET_LIMIT)) {
    const folders = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list('', { limit: 1000, offset });
      if (error || !data?.length) break;
      folders.push(...data.map((f) => f.name).filter((n) => wanted.has(n)));
      if (data.length < 1000) break;
    }
    await pool(folders, 8, async (folder) => {
      const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
      const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
      if (paths.length) {
        await admin.storage.from(bucket).remove(paths);
        removed += paths.length;
      }
    });
  }
  return removed;
}

// ---------------------------------------------------------------- etapas

async function listUsers(filter) {
  const out = new Map();
  for (let page = 1; page <= 1000; page++) {
    const { users } = must('listar usuários')(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    const seen = new Set(out.keys());
    for (const u of users) if (filter(u)) out.set(u.id, u);
    // Fim da lista, ou uma página só com contas já vistas (servidor que ignora a paginação): para.
    const repeated = page > 1 && users.length > 0 && users.every((u) => seen.has(u.id) || !filter(u));
    if (users.length < 1000 || repeated) break;
  }
  return [...out.values()];
}

async function removeLoadUsers() {
  const users = await listUsers((u) => u.email?.endsWith(`@${DOMAIN}`));
  if (users.length) {
    const files = await removeUserMedia(users.map((u) => u.id));
    if (files) console.log(`  (${files} fotos e vídeos de carga apagados)`);
  }
  await removeUserRows(users.map((u) => u.id));
  // Contas já sem conteúdo: apagam rápido. Poucas por vez, com nova tentativa se o Auth reclamar.
  let k = 0;
  await pool(users, 4, async (u) => {
    for (let attempt = 1; ; attempt++) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (!error || /not.?found/i.test(error.message ?? '')) break;
      if (attempt >= 5) throw new Error(`apagar usuário: ${error.message}`);
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
    progress('apagando contas', ++k, users.length);
  });
  return users.length;
}

/**
 * Apaga em massa, tabela por tabela, o que as contas de carga criaram. Apagar 1.000 contas
 * direto (cada uma levando milhares de curtidas, seguidores e comentários em cascata) fazia
 * as exclusões travarem umas nas outras no Postgres ("Database error deleting user").
 */
async function removeUserRows(ids) {
  const steps = [
    ['posts', 'author_id'], // leva junto curtidas, comentários e mídia dos posts
    ['comments', 'author_id'],
    ['likes', 'user_id'],
    ['comment_likes', 'user_id'],
    ['follows', 'follower_id'],
    ['follows', 'followee_id'],
    ['vibes', 'author_id'],
    ['discover_swipes', 'user_id'],
    ['notifications', 'user_id'],
    ['notifications', 'actor_id'],
  ];
  for (const [table, column] of steps) {
    for (let i = 0; i < ids.length; i += 50) {
      must(`limpar ${table}`)(await admin.from(table).delete().in(column, ids.slice(i, i + 50)));
      progress(`limpando ${table}`, Math.min(i + 50, ids.length), ids.length);
    }
  }
}

/** Guarda e tira os tokens de push das contas de verdade (devolve uma função que restaura). */
async function parkPushTokens(realIds) {
  if (!realIds.length) return async () => {};
  const tokens = must('ler tokens de push')(await admin.from('push_tokens').select('*').in('user_id', realIds));
  if (tokens.length) must('guardar tokens de push')(await admin.from('push_tokens').delete().in('user_id', realIds));
  return async () => {
    if (tokens.length) must('devolver tokens de push')(await admin.from('push_tokens').upsert(tokens));
  };
}

async function main() {
  console.log(`Supabase local: ${cfg.url}`);
  if (REMOVE) {
    const n = await removeLoadUsers();
    console.log(`Pronto: ${n} contas de carga apagadas (com posts, curtidas, comentários e vibes).`);
    return;
  }

  const t0 = Date.now();
  const old = await removeLoadUsers();
  if (old) console.log(`  (carga anterior apagada: ${old} contas)`);

  const realProfiles = must('ler perfis')(await admin.from('profiles').select('id, username'));
  const realIds = realProfiles.map((p) => p.id);
  const restorePush = await parkPushTokens(realIds);

  try {
    // Músicas
    console.log('Buscando músicas...');
    const { list: songList, online } = await songs();
    await insertBatches('link_previews', songList, { size: 200, upsert: 'url' });
    // Lê de volta em pedaços: com mais de mil músicas, os links todos não cabem num endereço só.
    const tracks = [];
    const urls = songList.map((s) => s.url);
    for (let i = 0; i < urls.length; i += 100) {
      tracks.push(...must('ler músicas')(await admin.from('link_previews').select('id, genres').in('url', urls.slice(i, i + 100))));
    }

    // Cache do Last.fm (o que o card do Descobrir mostra): metade das músicas já conhecida, e
    // algumas marcadas como não encontradas, para as duas rotas aparecerem.
    {
      const rows = [];
      for (let i = 0; i < tracks.length; i += 100) {
        rows.push(...must('ler músicas')(await admin.from('link_previews').select('id, title, artist, image_url').in('id', tracks.slice(i, i + 100).map((t) => t.id))));
      }
      const cache = rows.filter(() => rand() < 0.5).map((r) =>
        rand() < 0.1
          ? { link_preview_id: r.id, found: false }
          : { link_preview_id: r.id, found: true, title: r.title, artist: r.artist, album: null, image_url: r.image_url?.startsWith('https://') ? r.image_url : null },
      );
      await insertBatches('lastfm_tracks', cache, { size: 500, upsert: 'link_preview_id' });
    }

    // Fotos e vídeos (bancos públicos de teste)
    const media = await mediaPool();
    if (!NO_MEDIA && !media) console.log('  Sem internet para as fotos e vídeos: a carga segue sem mídia.');
    const store = storageCopier();

    // Contas
    console.log(`Criando ${N_USERS} contas...`);
    const people = await pool(Array.from({ length: N_USERS }, (_, i) => i), 8, async (i) => {
      const first = one(FIRST);
      const username = `${first.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase()}.${one(TAGS)}${i}`.slice(0, 20);
      const email = `${username}@${DOMAIN}`;
      const user = must(`criar ${username}`)(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).user;
      progress('contas', i + 1, N_USERS);
      return { id: user.id, username, name: `${first} ${one(LAST)}`, genres: some(GENRES, int(3, 6)) };
    });
    // Foto de perfil para todos e banner para a maioria (copiados no Storage antes do perfil).
    if (media) {
      let k = 0;
      await pool(people, 8, async (p, i) => {
        const ts = Date.now() * 10 + i;
        if (media.avatars.length) {
          const a = i % media.avatars.length;
          await store.copy('avatars', `avatar-${a}.jpg`, media.avatars[a], 'image/jpeg', `${p.id}/avatar-${ts}.jpg`);
          p.avatar = `avatars/${p.id}/avatar-${ts}.jpg`;
        }
        if (media.banners.length && rand() < 0.6) {
          const b = i % media.banners.length;
          await store.copy('banners', `banner-${b}.jpg`, media.banners[b], 'image/jpeg', `${p.id}/banner-${ts}.jpg`);
          p.banner = `banners/${p.id}/banner-${ts}.jpg`;
        }
        progress('fotos de perfil e banners', ++k, people.length);
      });
    }
    await insertBatches('profiles', people.map((p) => ({ id: p.id, username: p.username, display_name: p.name, bio: one(BIOS), locale: 'pt-BR', avatar_url: p.avatar ?? null, banner_url: p.banner ?? null })));
    await insertBatches('profile_private', people.map((p) => ({ user_id: p.id, birthdate: `${int(1975, 2005)}-0${int(1, 9)}-1${int(0, 9)}`, is_minor: false, streaming_platform: one(['spotify', 'deezer', 'apple_music', 'youtube_music']) })));
    await insertBatches('user_genres', people.flatMap((p) => p.genres.map((genre) => ({ user_id: p.id, genre }))), { upsert: 'user_id,genre' });

    // Quem segue quem (alguns perfis muito seguidos, a maioria pouco)
    const ids = people.map((p) => p.id);
    const follows = new Map();
    const follow = (a, b) => a !== b && follows.set(`${a}|${b}`, { follower_id: a, followee_id: b });
    const stars = some(ids, Math.ceil(N_USERS * 0.05));
    for (const a of ids) {
      for (const b of some(ids, pareto(5, 1.5, 80))) follow(a, b);
      for (const b of some(stars, int(0, stars.length))) follow(a, b);
    }
    for (const me of realIds) {
      for (const b of some(ids, Math.min(60, ids.length))) follow(me, b);
      for (const a of some(ids, Math.min(40, ids.length))) follow(a, me);
    }
    await insertBatches('follows', [...follows.values()], { upsert: 'follower_id,followee_id' });

    // Posts (60% com música; espalhados pelos últimos dias, mais no recente)
    const authorWeight = ids.map(() => pareto(1, 1.2, 40));
    const totalW = authorWeight.reduce((a, b) => a + b, 0);
    const pickAuthor = () => {
      let r = rand() * totalW;
      for (let i = 0; i < ids.length; i++) if ((r -= authorWeight[i]) <= 0) return ids[i];
      return ids[ids.length - 1];
    };
    // Posts com mídia: ~12% com fotos (1 a 4) e ~2% com vídeo (com teto para não pesar o disco).
    const MAX_PHOTO_POSTS = 1000;
    const MAX_VIDEO_POSTS = 80;
    let photoPosts = 0;
    let videoPosts = 0;
    const plannedMedia = [];
    const postRows = Array.from({ length: N_POSTS }, (_, idx) => {
      const at = agoIso(Math.pow(rand(), 1.6) * DAYS * 24 * HOUR);
      const r = rand();
      if (media?.videos.length && r < 0.02 && videoPosts < MAX_VIDEO_POSTS) {
        videoPosts++;
        plannedMedia[idx] = { kind: 'video' };
        return { author_id: pickAuthor(), type: 'media', body: one(MEDIA_TEXT), genres: [], created_at: at };
      }
      if (media?.photos.length && r < 0.14 && photoPosts < MAX_PHOTO_POSTS) {
        photoPosts++;
        plannedMedia[idx] = { kind: 'photo', count: rand() < 0.5 ? 1 : rand() < 0.5 ? 2 : rand() < 0.6 ? 3 : 4 };
        return { author_id: pickAuthor(), type: 'media', body: one(MEDIA_TEXT), genres: [], created_at: at };
      }
      if (rand() < 0.6 && tracks.length) {
        const t = one(tracks);
        const genres = (t.genres ?? []).filter((g) => GENRES.includes(g)).slice(0, 3);
        return { author_id: pickAuthor(), type: 'music', body: one(POST_TEXT), link_preview_id: t.id, genres, created_at: at };
      }
      return { author_id: pickAuthor(), type: 'text', body: one(TEXT_ONLY), genres: [], created_at: at };
    });
    console.log(`Criando ${N_POSTS} posts...`);
    const posts = await insertBatches('posts', postRows, { select: 'id, author_id, created_at' });

    // Arquivos dos posts com mídia (copiados para a pasta do autor) e as linhas de post_media.
    const mediaRows = [];
    if (media) {
      const jobs = [];
      posts.forEach((p, idx) => {
        const plan = plannedMedia[idx];
        if (!plan) return;
        if (plan.kind === 'video') {
          const v = int(0, media.videos.length - 1);
          const path = `${p.author_id}/${randomUUID()}.mp4`;
          jobs.push(() => store.copy('post-media', `video-${v}.mp4`, media.videos[v].buf, 'video/mp4', path));
          mediaRows.push({ post_id: p.id, position: 0, kind: 'video', path, width: media.videos[v].w, height: media.videos[v].h, duration_ms: media.videos[v].ms });
        } else {
          for (let pos = 0; pos < plan.count; pos++) {
            const f = int(0, media.photos.length - 1);
            const path = `${p.author_id}/${randomUUID()}.jpg`;
            jobs.push(() => store.copy('post-media', `photo-${f}.jpg`, media.photos[f].buf, 'image/jpeg', path));
            mediaRows.push({ post_id: p.id, position: pos, kind: 'photo', path, width: media.photos[f].w, height: media.photos[f].h });
          }
        }
      });
      let k = 0;
      await pool(jobs, 8, async (job) => {
        await job();
        progress('fotos e vídeos dos posts', ++k, jobs.length);
      });
      await insertBatches('post_media', mediaRows);
    }

    // Curtidas (cauda longa: a maioria com poucas, alguns virais)
    const likes = [];
    for (const p of posts) for (const u of some(ids, pareto(1, 1.1, Math.min(250, ids.length)))) if (u !== p.author_id) likes.push({ user_id: u, post_id: p.id });
    console.log(`Curtindo (${likes.length})...`);
    await insertBatches('likes', likes, { size: 1000, upsert: 'user_id,post_id' });

    // Comentários, respostas e curtidas em comentários
    const commentRows = [];
    for (const p of posts) {
      const n = rand() < 0.45 ? 0 : pareto(1, 1.3, 40);
      const base = new Date(p.created_at).getTime();
      for (let i = 0; i < n; i++) commentRows.push({ post_id: p.id, author_id: one(ids), body: one(COMMENTS), created_at: new Date(Math.min(Date.now(), base + int(1, 600) * 60_000)).toISOString() });
    }
    console.log(`Comentando (${commentRows.length})...`);
    const comments = await insertBatches('comments', commentRows, { select: 'id, post_id, author_id, created_at' });
    const authorName = new Map(people.map((p) => [p.id, p.username]));
    const replyRows = [];
    for (const c of comments)
      if (rand() < 0.3)
        for (let i = 0, n = pareto(1, 1.4, 8); i < n; i++) {
          const by = one(ids);
          replyRows.push({ post_id: c.post_id, parent_id: c.id, author_id: by, body: `@${authorName.get(c.author_id) ?? 'alguem'} ${one(REPLIES)}`, created_at: new Date(Math.min(Date.now(), new Date(c.created_at).getTime() + int(1, 300) * 60_000)).toISOString() });
        }
    console.log(`Respondendo (${replyRows.length})...`);
    await insertBatches('comments', replyRows);
    const commentLikes = [];
    for (const c of comments) for (const u of some(ids, pareto(1, 1.6, 20)).slice(0, rand() < 0.5 ? 0 : 20)) commentLikes.push({ user_id: u, comment_id: c.id });
    await insertBatches('comment_likes', commentLikes, { size: 1000, upsert: 'user_id,comment_id' });

    // Os seus posts recebem curtidas e comentários (enchem as notificações)
    const mine = realIds.length ? must('ler seus posts')(await admin.from('posts').select('id, author_id').in('author_id', realIds).order('created_at', { ascending: false }).limit(30)) : [];
    await insertBatches('likes', mine.flatMap((p) => some(ids, int(15, 60)).map((u) => ({ user_id: u, post_id: p.id }))), { size: 1000, upsert: 'user_id,post_id' });
    await insertBatches('comments', mine.flatMap((p) => some(ids, int(2, 8)).map((u) => ({ post_id: p.id, author_id: u, body: one(COMMENTS) }))));

    // Vibes das últimas horas (fila do topo cheia para quem você segue)
    const followedByReal = new Set([...follows.values()].filter((f) => realIds.includes(f.follower_id)).map((f) => f.followee_id));
    const vibeRows = [];
    for (const id of ids) {
      if (!(followedByReal.has(id) ? rand() < 0.6 : rand() < 0.15)) continue;
      for (let i = 0, n = int(1, 4); i < n; i++) {
        const at = agoIso(rand() * 20 * HOUR);
        const r = rand();
        if (media?.photos.length && r < 0.25) {
          const f = int(0, media.photos.length - 1);
          vibeRows.push({ author_id: id, kind: 'photo', media_path: `${id}/${randomUUID()}.jpg`, file: ['photo', f], ...vibeTexts(0.4, 3), style: one(STYLES), created_at: at });
        } else if (media?.videos.length && r < 0.33) {
          const f = int(0, media.videos.length - 1);
          vibeRows.push({ author_id: id, kind: 'video', media_path: `${id}/${randomUUID()}.mp4`, file: ['video', f], duration_ms: media.videos[f].ms, text: null, style: one(STYLES), created_at: at });
        } else if (rand() < 0.5 && tracks.length) vibeRows.push({ author_id: id, kind: 'music', link_preview_id: one(tracks).id, ...vibeTexts(0.5, 2), style: one(STYLES), created_at: at });
        else vibeRows.push({ author_id: id, kind: 'text', ...vibeTexts(1, 5), style: one(STYLES), created_at: at });
      }
    }
    console.log(`Vibes (${vibeRows.length})...`);
    if (media) {
      const withFile = vibeRows.filter((v) => v.file);
      let k = 0;
      await pool(withFile, 8, async (v) => {
        const [kind, f] = v.file;
        if (kind === 'photo') await store.copy('vibes', `photo-${f}.jpg`, media.photos[f].buf, 'image/jpeg', v.media_path);
        else await store.copy('vibes', `video-${f}.mp4`, media.videos[f].buf, 'video/mp4', v.media_path);
        progress('fotos e vídeos das vibes', ++k, withFile.length);
      });
    }
    await insertBatches('vibes', vibeRows.map(({ file, ...v }) => (void file, v)));
    await store.cleanup();

    // Curtidas do Descobrir (perfil › Curtidas)
    const swipes = [];
    for (const id of ids) for (const t of some(tracks, int(0, 30))) swipes.push({ user_id: id, link_preview_id: t.id, liked: rand() < 0.75, created_at: agoIso(rand() * DAYS * 24 * HOUR) });
    await insertBatches('discover_swipes', swipes, { size: 1000, upsert: 'user_id,link_preview_id' });

    const s = ((Date.now() - t0) / 1000).toFixed(0);
    if (media) console.log(`\nMídia: ${people.filter((p) => p.avatar).length} fotos de perfil, ${people.filter((p) => p.banner).length} banners, ${mediaRows.filter((m) => m.kind === 'photo').length} fotos e ${mediaRows.filter((m) => m.kind === 'video').length} vídeos em posts, ${vibeRows.filter((v) => v.media_path).length} vibes com foto/vídeo.`);
    console.log(`\nPronto em ${s}s: ${N_USERS} contas, ${posts.length} posts, ${likes.length} curtidas, ${comments.length + replyRows.length} comentários, ${follows.size} seguidores, ${vibeRows.length} vibes, ${swipes.length} swipes no Descobrir, ${tracks.length} músicas.`);
    if (!online) console.log('Aviso: sem internet para a Deezer; as músicas entraram sem capa e sem prévia.');
    console.log(`Suas contas (${realProfiles.map((p) => '@' + p.username).join(', ') || 'nenhuma ainda'}) seguem parte das contas de carga e são seguidas por elas.`);
    console.log(`Para entrar como uma delas: @${people[0].username}, senha ${PASSWORD}`);
    console.log('Para apagar tudo: npm run load -- --remove');
  } finally {
    await restorePush();
  }
}

main().catch((err) => {
  console.error('\nFalhou:', err.message ?? err);
  process.exit(1);
});
