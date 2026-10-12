#!/usr/bin/env node
// Carga para teste de desempenho no Supabase LOCAL: centenas de contas e milhares de posts,
// curtidas, comentários, respostas, seguidores, vibes e curtidas do Descobrir, espalhados
// pelos últimos dias, para ver como o app se comporta com o banco cheio.
//
//   npm run load                       carga média (300 contas, 3.000 posts)
//   npm run load -- --scale small      100 contas, 1.000 posts
//   npm run load -- --scale large      1.000 contas, 10.000 posts
//   npm run load -- --users 500 --posts 6000
//   npm run load -- --remove           apaga só as contas de carga (e tudo delas)
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
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const DOMAIN = 'load.soundora.dev';
const PASSWORD = 'Soundora2026load';
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const REMOVE = flag('remove');
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
const VIBE_TEXT = ['bom dia com música alta', 'sextou 🎶', 'fone no máximo', 'qual música vocês tão ouvindo hoje?', 'show sábado, quem vai?', 'playlist nova no forno', 'no repeat 🔁'];
const STYLES = ['violet', 'blue', 'pink', 'green', 'orange', 'dark'];

// Paradas da Deezer por gênero → slug do Soundora.
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

// ---------------------------------------------------------------- etapas

async function listUsers(filter) {
  const out = [];
  for (let page = 1; ; page++) {
    const { users } = must('listar usuários')(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    out.push(...users.filter(filter));
    if (users.length < 1000) break;
  }
  return out;
}

async function removeLoadUsers() {
  const users = await listUsers((u) => u.email?.endsWith(`@${DOMAIN}`));
  await pool(users, 8, async (u, i) => {
    must('apagar usuário')(await admin.auth.admin.deleteUser(u.id));
    progress('apagando contas', i + 1, users.length);
  });
  return users.length;
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
    const previews = await insertBatches('link_previews', songList, { size: 200, upsert: 'url' });
    void previews;
    const tracks = must('ler músicas')(await admin.from('link_previews').select('id, genres').in('url', songList.map((s) => s.url)).limit(5000));

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
    await insertBatches('profiles', people.map((p) => ({ id: p.id, username: p.username, display_name: p.name, bio: one(BIOS), locale: 'pt-BR' })));
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
    const postRows = Array.from({ length: N_POSTS }, () => {
      const at = agoIso(Math.pow(rand(), 1.6) * DAYS * 24 * HOUR);
      if (rand() < 0.6 && tracks.length) {
        const t = one(tracks);
        const genres = (t.genres ?? []).filter((g) => GENRES.includes(g)).slice(0, 3);
        return { author_id: pickAuthor(), type: 'music', body: one(POST_TEXT), link_preview_id: t.id, genres, created_at: at };
      }
      return { author_id: pickAuthor(), type: 'text', body: one(TEXT_ONLY), genres: [], created_at: at };
    });
    console.log(`Criando ${N_POSTS} posts...`);
    const posts = await insertBatches('posts', postRows, { select: 'id, author_id, created_at' });

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
        if (rand() < 0.5 && tracks.length) vibeRows.push({ author_id: id, kind: 'music', link_preview_id: one(tracks).id, text: rand() < 0.5 ? one(VIBE_TEXT) : null, style: one(STYLES), text_x: 0.5, text_y: 0.22, created_at: at });
        else vibeRows.push({ author_id: id, kind: 'text', text: one(VIBE_TEXT), style: one(STYLES), text_x: 0.5, text_y: 0.45, created_at: at });
      }
    }
    console.log(`Vibes (${vibeRows.length})...`);
    await insertBatches('vibes', vibeRows);

    // Curtidas do Descobrir (perfil › Curtidas)
    const swipes = [];
    for (const id of ids) for (const t of some(tracks, int(0, 30))) swipes.push({ user_id: id, link_preview_id: t.id, liked: rand() < 0.75, created_at: agoIso(rand() * DAYS * 24 * HOUR) });
    await insertBatches('discover_swipes', swipes, { size: 1000, upsert: 'user_id,link_preview_id' });

    const s = ((Date.now() - t0) / 1000).toFixed(0);
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
