-- Recomendação do "Para você" mais completa e reviews populares no meio do feed.
--
-- O GOSTO (private.taste, por gênero) ganha sinais novos:
--   nicho de quem eu sigo (gêneros do perfil delas, pela fração que tem cada um) .. até 2
--   músicas favoritas do perfil ................................................... 2
--   reviews que escrevi (gêneros do álbum) ........................................ 2   (~60 dias)
--   reviews que curti ............................................................. 1   (~30 dias)
--   pesquisas que batem com um gênero ("rock", "samba") ........................... 1,5 (~30 dias)
-- (continuam: gêneros do perfil 3, posts que publiquei 2, comentei 1,5, curti 1, Descobrir 1,2)
--
-- PALAVRAS E ARTISTAS (private.taste_terms), o que os gêneros não pegam:
--   artistas: das músicas favoritas, dos meus posts, dos posts que curti, das curtidas do
--     Descobrir, das reviews que escrevi/curti e das pesquisas;
--   palavras-chave: do texto dos meus posts, dos posts que curti/comentei e das pesquisas
--     (sem palavras comuns como "para", "muito", "that"; ver private.terms).
--
-- PESQUISAS (search_history): só o termo (minúsculo e sem acento), guardado quando a pessoa
-- pesquisa de fato (Enter, abrir um gênero, buscar nos posts), não a cada letra digitada.
-- Ficam 90 dias, no máximo as 100 últimas. A pessoa vê a lista, apaga e desliga em
-- Configurações › Privacidade; desligar apaga tudo e para de guardar. Nada disso é público.
--
-- PARA VOCÊ (feed_for_you) passa a somar também: artista da música que eu curto (forte),
-- palavras-chave do texto do post e quantas pessoas que eu sigo curtiram o post.
--
-- REVIEWS PARA VOCÊ (feed_reviews_for_you): reviews populares (curtidas) dos últimos meses,
-- primeiro as de álbuns de artistas e gêneros do meu gosto e de quem eu sigo; uma por álbum,
-- sem as minhas, as que já curti, as de quem bloqueei/me bloqueou, de contas privadas que não
-- sigo e de gêneros silenciados. O app mostra em faixas no meio do Para você.

-- ---------------------------------------------------------------- palavras e artistas

-- Palavras-chave de um texto: minúsculas, sem acento, sem links, 4 a 30 letras, sem números
-- soltos e sem as palavras comuns (pt e en). Tira o acento como private.fold, mas sem chamá-la:
-- a coluna gerada roda com o papel de quem posta, que não enxerga o esquema private.
create function private.terms(p text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct w order by w), '{}')
  from regexp_split_to_table(regexp_replace(translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), 'https?://\S+', ' ', 'g'), '[^a-z0-9]+') w
  where char_length(w) between 4 and 30
    and w !~ '^[0-9]+$'
    and w <> all (array[
      -- português
      'para', 'como', 'mais', 'muito', 'muita', 'muitos', 'muitas', 'esse', 'essa', 'esses', 'essas', 'isso',
      'este', 'esta', 'estes', 'estas', 'isto', 'aqui', 'agora', 'ainda', 'quando', 'onde', 'porque', 'pois',
      'entao', 'tambem', 'sobre', 'depois', 'antes', 'todo', 'toda', 'todos', 'todas', 'tudo', 'nada', 'cada',
      'mesmo', 'mesma', 'minha', 'minhas', 'meus', 'nossa', 'nosso', 'voce', 'voces', 'eles', 'elas', 'dele',
      'dela', 'deles', 'delas', 'pelo', 'pela', 'pelos', 'pelas', 'numa', 'umas', 'estao', 'estou', 'estava',
      'foram', 'sera', 'seria', 'sendo', 'sido', 'tenho', 'tinha', 'temos', 'fazer', 'feito', 'vamos', 'acho',
      'achei', 'gente', 'coisa', 'coisas', 'alguem', 'alguma', 'algum', 'algo', 'outra', 'outro', 'outros',
      'outras', 'qual', 'quais', 'quem', 'mano', 'cara', 'demais', 'sempre', 'nunca', 'hoje', 'ontem', 'amanha',
      'dias', 'vezes', 'assim', 'tipo', 'pode', 'posso', 'podem', 'entre', 'desde', 'ouvir', 'ouvindo', 'escutar',
      'escutando', 'musica', 'musicas', 'album', 'albuns', 'disco', 'discos', 'faixa', 'faixas', 'cancao', 'amei',
      'gosto', 'gostei', 'curti', 'curto', 'melhor', 'melhores', 'pior', 'novo', 'nova', 'novos', 'novas', 'anos',
      'bom', 'boa', 'bons', 'boas', 'demais', 'super', 'vale', 'pena', 'sabe', 'acabei', 'saiu', 'ficou', 'fica',
      'deve', 'nesse', 'nessa', 'neste', 'nesta', 'disso', 'desse', 'dessa', 'deste', 'desta', 'aquele', 'aquela',
      'mim', 'contra', 'pouco', 'quase', 'bem', 'sem', 'tanto', 'tanta', 'qualquer', 'durante', 'fazendo',
      -- inglês
      'that', 'this', 'with', 'from', 'have', 'just', 'like', 'what', 'when', 'your', 'they', 'them', 'then',
      'than', 'there', 'their', 'about', 'into', 'some', 'only', 'also', 'been', 'were', 'will', 'would',
      'could', 'should', 'very', 'really', 'much', 'more', 'most', 'here', 'over', 'after', 'before', 'because',
      'which', 'while', 'these', 'those', 'again', 'still', 'even', 'dont', 'cant', 'love', 'song', 'songs',
      'music', 'track', 'tracks', 'listen', 'listening', 'album', 'albums', 'best', 'good', 'great', 'new',
      'year', 'years', 'time', 'today', 'know', 'think', 'thing', 'things', 'make', 'made', 'every', 'never',
      'always', 'being', 'does', 'want', 'need', 'feel'
    ]);
$$;
revoke execute on function private.terms(text) from public;
-- Quem posta/escreve review precisa dela (a coluna gerada chama a função ao gravar).
grant execute on function private.terms(text) to authenticated, service_role;

-- Artistas de um campo "artista" (minúsculo, sem acento), separando participações:
-- "Anitta, Pedro Sampaio & J Balvin feat. X" → anitta, pedro sampaio, j balvin, x.
create function private.artist_names(p text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct a), '{}')
  from regexp_split_to_table(translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s*(,|&|;|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+with\s+)\s*') x,
       lateral (select btrim(x) as a) y
  where char_length(a) between 1 and 100;
$$;
revoke execute on function private.artist_names(text) from public;
grant execute on function private.artist_names(text) to authenticated, service_role;

alter table public.posts add column terms text[] generated always as (private.terms(body)) stored;
alter table public.album_reviews add column terms text[] generated always as (private.terms(body)) stored;
-- Artistas já separados em cada música (calculado ao gravar, não a cada feed).
alter table public.link_previews add column artist_keys text[] generated always as (private.artist_names(artist)) stored;
create index link_previews_artist_keys on public.link_previews using gin (artist_keys);
create index album_reviews_popular on public.album_reviews (like_count desc, created_at desc);
create index follows_follower_created on public.follows (follower_id, created_at desc);
create index review_likes_user_created on public.review_likes (user_id, created_at desc);
-- Pesquisa → gênero pelo nome (sem acento), sem varrer o catálogo inteiro.
create index genres_name_pt_fold on public.genres (private.fold(name_pt));
create index genres_name_en_fold on public.genres (private.fold(name_en));

-- ---------------------------------------------------------------- pesquisas

alter table public.profile_private add column use_search_history boolean not null default true;

create table public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  term text not null check (char_length(term) between 2 and 100),
  created_at timestamptz not null default now()
);
create index search_history_user on public.search_history (user_id, created_at desc);
create index search_history_created on public.search_history (created_at);
alter table public.search_history enable row level security;
revoke all on public.search_history from anon, authenticated;
-- Leitura e escrita só pelas funções abaixo (e só da própria pessoa).

-- Termo como é guardado: minúsculo, sem acento, espaços simples. null = não guarda
-- (curto/longo demais, link, ou busca de pessoa com "@").
create function private.search_term(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when v is null or char_length(v) < 2 or char_length(v) > 100 or v ~ '^(https?://|www\.|@)' then null
    else v
  end
  from (select nullif(btrim(regexp_replace(private.fold(coalesce(p, '')), '\s+', ' ', 'g')), '') as v) x;
$$;
revoke execute on function private.search_term(text) from public;

-- Guarda uma pesquisa (se a pessoa não desligou). Nunca dá erro por limite: só não guarda.
create function public.log_search(p_term text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v text := private.search_term(p_term);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v is null then return; end if;
  if not coalesce((select pp.use_search_history from public.profile_private pp where pp.user_id = uid), false) then return; end if;
  if not private.hit(uid, 'search_log', 60, interval '1 hour') then return; end if;
  -- A mesma pesquisa de novo (no mesmo dia) só atualiza a hora.
  update public.search_history set created_at = now()
  where user_id = uid and term = v and created_at > now() - interval '1 day';
  if not found then
    insert into public.search_history (user_id, term) values (uid, v);
  end if;
  -- No máximo as 100 últimas da pessoa; de todo mundo, nada com mais de 90 dias.
  delete from public.search_history
  where user_id = uid
    and id not in (select h.id from public.search_history h where h.user_id = uid order by h.created_at desc limit 100);
  delete from public.search_history where created_at < now() - interval '90 days';
end;
$$;

-- Configuração e lista (só da própria pessoa): ligado? e as pesquisas guardadas.
create function public.my_search_history(p_limit int default 100)
returns table (enabled boolean, term text, searched_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  on_ boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select coalesce(pp.use_search_history, false) into on_ from public.profile_private pp where pp.user_id = uid;
  on_ := coalesce(on_, false);
  -- Sempre ao menos uma linha, para o app saber se está ligado mesmo sem pesquisa guardada.
  return query
  select on_, h.term, h.created_at
  from public.search_history h
  where h.user_id = uid and h.created_at > now() - interval '90 days'
  order by h.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
  if not found then
    return query select on_, null::text, null::timestamptz;
  end if;
end;
$$;

-- Liga ou desliga. Desligar apaga as pesquisas guardadas.
create function public.set_search_history_enabled(p_enabled boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_enabled is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.profile_private set use_search_history = p_enabled where user_id = uid;
  if not p_enabled then
    delete from public.search_history where user_id = uid;
  end if;
end;
$$;

-- Apaga as pesquisas guardadas (todas ou uma).
create function public.clear_search_history(p_term text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.search_history where user_id = uid and (p_term is null or term = p_term);
end;
$$;

revoke execute on function public.log_search(text), public.my_search_history(int), public.set_search_history_enabled(boolean), public.clear_search_history(text) from public, anon;
grant execute on function public.log_search(text), public.my_search_history(int), public.set_search_history_enabled(boolean), public.clear_search_history(text) to authenticated;

-- ---------------------------------------------------------------- gosto (gêneros)

create or replace function private.taste(p_user uuid, p_at timestamptz)
returns table (genre text, weight float8)
language sql stable security definer set search_path = '' as $$
  with fw as (
    select f.followee_id as id from public.follows f
    where f.follower_id = p_user and f.created_at <= p_at
    order by f.created_at desc limit 500
  ),
  searches as (
    select h.term, h.created_at from public.search_history h
    where h.user_id = p_user and h.created_at <= p_at and h.created_at > p_at - interval '90 days'
      and exists (select 1 from public.profile_private pp where pp.user_id = p_user and pp.use_search_history)
    order by h.created_at desc limit 100
  ),
  signals (genre, w) as (
    select ug.genre, 3.0::float8 from public.user_genres ug where ug.user_id = p_user
    union all
    select g.genre, 2.0 * exp(-extract(epoch from (p_at - p.created_at)) / (60 * 86400.0))
    from (
      select id, genres, link_preview_id, created_at from public.posts
      where author_id = p_user and created_at <= p_at and created_at > p_at - interval '180 days'
      order by created_at desc limit 50
    ) p
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.5 * exp(-extract(epoch from (p_at - c.at)) / (30 * 86400.0))
    from (
      select post_id, max(created_at) as at from (
        select post_id, created_at from public.comments
        where author_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
        order by created_at desc limit 200
      ) c0 group by post_id
    ) c
    join public.posts p on p.id = c.post_id and p.author_id <> p_user
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.0 * exp(-extract(epoch from (p_at - l.created_at)) / (30 * 86400.0))
    from (
      select post_id, created_at from public.likes
      where user_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) l
    join public.posts p on p.id = l.post_id
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.2 * exp(-extract(epoch from (p_at - s.created_at)) / (30 * 86400.0))
    from (
      select link_preview_id, created_at from public.discover_swipes
      where user_id = p_user and liked and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) s
    join public.link_previews lp on lp.id = s.link_preview_id
    cross join lateral (select distinct x from unnest(coalesce(lp.genres, '{}')) x) g (genre)
    -- Nicho de quem eu sigo: gênero que todas as pessoas que sigo escolheram vale 2 (seguindo
    -- 10 ou mais; com menos gente, vale proporcionalmente menos: seguir 1 pessoa não muda muito).
    union all
    select ug.genre, 2.0 * count(*)::float8 / greatest((select count(*) from fw), 10)
    from fw join public.user_genres ug on ug.user_id = fw.id
    group by ug.genre
    -- Músicas favoritas do perfil.
    union all
    select g.genre, 2.0
    from public.profile_favorite_songs f
    join public.link_previews lp on lp.id = f.link_preview_id
    cross join lateral (select distinct x from unnest(coalesce(lp.genres, '{}')) x) g (genre)
    where f.user_id = p_user
    -- Reviews que escrevi e que curti (gêneros do álbum).
    union all
    select g.genre, 2.0 * exp(-extract(epoch from (p_at - r.created_at)) / (60 * 86400.0))
    from (
      select album_id, created_at from public.album_reviews
      where author_id = p_user and created_at <= p_at and created_at > p_at - interval '365 days'
      order by created_at desc limit 50
    ) r
    join public.link_previews lp on lp.id = r.album_id
    cross join lateral (select distinct x from unnest(coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.0 * exp(-extract(epoch from (p_at - rl.created_at)) / (30 * 86400.0))
    from (
      select review_id, created_at from public.review_likes
      where user_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 200
    ) rl
    join public.album_reviews r on r.id = rl.review_id and r.author_id <> p_user
    join public.link_previews lp on lp.id = r.album_id
    cross join lateral (select distinct x from unnest(coalesce(lp.genres, '{}')) x) g (genre)
    -- Pesquisas que são um gênero (pelo nome em pt/en ou pelo código).
    union all
    select gg.slug, 1.5 * exp(-extract(epoch from (p_at - s.created_at)) / (30 * 86400.0))
    from searches s
    cross join lateral (
      select g1.slug from public.genres g1 where g1.slug = replace(s.term, ' ', '_')
      union
      select g2.slug from public.genres g2 where private.fold(g2.name_pt) = s.term
      union
      select g3.slug from public.genres g3 where private.fold(g3.name_en) = s.term
    ) gg
  ),
  summed as (
    select s.genre, sum(s.w) as w from signals s where s.genre is not null group by s.genre
  )
  select genre, w / max(w) over () from summed where w > 0 order by w desc limit 40;
$$;
revoke execute on function private.taste(uuid, timestamptz) from public;

-- ---------------------------------------------------------------- gosto (artistas e palavras)

create function private.taste_terms(p_user uuid, p_at timestamptz)
returns table (term text, kind text, weight float8)
language sql stable security definer set search_path = '' as $$
  with my_posts as (
    select p.body, p.terms, p.link_preview_id, p.created_at from public.posts p
    where p.author_id = p_user and p.created_at <= p_at and p.created_at > p_at - interval '180 days'
    order by p.created_at desc limit 50
  ),
  liked as (
    select p.terms, p.link_preview_id, l.created_at
    from (
      select post_id, created_at from public.likes
      where user_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) l
    join public.posts p on p.id = l.post_id and p.author_id <> p_user
  ),
  commented as (
    select p.terms, c.at as created_at
    from (
      select post_id, max(created_at) as at from (
        select post_id, created_at from public.comments
        where author_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
        order by created_at desc limit 200
      ) c0 group by post_id
    ) c
    join public.posts p on p.id = c.post_id and p.author_id <> p_user
  ),
  searches as (
    select h.term, h.created_at from public.search_history h
    where h.user_id = p_user and h.created_at <= p_at and h.created_at > p_at - interval '90 days'
      and exists (select 1 from public.profile_private pp where pp.user_id = p_user and pp.use_search_history)
    order by h.created_at desc limit 100
  ),
  decay as (select 60 * 86400.0 as long_, 30 * 86400.0 as short_),
  artist_signals (term, w) as (
    select a, 2.0::float8
    from public.profile_favorite_songs f
    join public.link_previews lp on lp.id = f.link_preview_id,
    unnest(lp.artist_keys) a
    where f.user_id = p_user
    union all
    select a, 2.0 * exp(-extract(epoch from (p_at - p.created_at)) / (select long_ from decay))
    from my_posts p join public.link_previews lp on lp.id = p.link_preview_id, unnest(lp.artist_keys) a
    union all
    select a, 1.0 * exp(-extract(epoch from (p_at - l.created_at)) / (select short_ from decay))
    from liked l join public.link_previews lp on lp.id = l.link_preview_id, unnest(lp.artist_keys) a
    union all
    select a, 1.2 * exp(-extract(epoch from (p_at - s.created_at)) / (select short_ from decay))
    from (
      select link_preview_id, created_at from public.discover_swipes
      where user_id = p_user and liked and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) s
    join public.link_previews lp on lp.id = s.link_preview_id, unnest(lp.artist_keys) a
    union all
    select a, 2.0 * exp(-extract(epoch from (p_at - r.created_at)) / (select long_ from decay))
    from (
      select album_id, created_at from public.album_reviews
      where author_id = p_user and created_at <= p_at and created_at > p_at - interval '365 days'
      order by created_at desc limit 50
    ) r
    join public.link_previews lp on lp.id = r.album_id, unnest(lp.artist_keys) a
    union all
    select a, 1.0 * exp(-extract(epoch from (p_at - rl.created_at)) / (select short_ from decay))
    from (
      select review_id, created_at from public.review_likes
      where user_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 200
    ) rl
    join public.album_reviews r on r.id = rl.review_id and r.author_id <> p_user
    join public.link_previews lp on lp.id = r.album_id, unnest(lp.artist_keys) a
    -- A pesquisa inteira pode ser um artista ("radiohead", "marina sena").
    union all
    select s.term, 1.5 * exp(-extract(epoch from (p_at - s.created_at)) / (select short_ from decay))
    from searches s
  ),
  word_signals (term, w) as (
    select t, 1.5 * exp(-extract(epoch from (p_at - p.created_at)) / (select long_ from decay))
    from my_posts p, unnest(p.terms) t
    union all
    select t, 1.0 * exp(-extract(epoch from (p_at - l.created_at)) / (select short_ from decay))
    from liked l, unnest(l.terms) t
    union all
    select t, 0.8 * exp(-extract(epoch from (p_at - c.created_at)) / (select short_ from decay))
    from commented c, unnest(c.terms) t
    union all
    select t, 1.5 * exp(-extract(epoch from (p_at - s.created_at)) / (select short_ from decay))
    from searches s, unnest(private.terms(s.term)) t
  ),
  artists as (
    select term, sum(w) as w from artist_signals where term is not null and term <> '' group by term
    order by w desc limit 30
  ),
  words as (
    select term, sum(w) as w from word_signals where term is not null group by term
    order by w desc limit 40
  )
  select term, 'artist', w / max(w) over () from artists where w > 0
  union all
  select term, 'word', w / max(w) over () from words where w > 0;
$$;
revoke execute on function private.taste_terms(uuid, timestamptz) from public;

-- ---------------------------------------------------------------- Para você

CREATE OR REPLACE FUNCTION public.feed_for_you(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  terms as (select t.term, t.kind, t.weight from me, private.taste_terms(me.uid, me.at) t),
  artist_list as (select coalesce(array_agg(term), '{}') as a from terms where kind = 'artist'),
  word_list as (select coalesce(array_agg(term), '{}') as a from terms where kind = 'word'),
  -- Gêneros parecidos: o peso do pedaço é metade do maior peso entre os gêneros que o contêm.
  tokens as (
    select tok, max(t.weight) * 0.5 as weight
    from taste t, unnest(private.genre_tokens(array[t.genre])) tok
    group by tok
  ),
  has_taste as (select exists (select 1 from taste) or exists (select 1 from terms) as yes),
  following as (select followee_id as id from public.follows, me where follower_id = me.uid),
  blocked as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  -- Contas privadas que eu não sigo (o conteúdo delas não entra).
  hidden_private as (
    select pr.id from public.profiles pr, me
    where pr.is_private and pr.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = pr.id)
  ),
  muted as (select coalesce(array_agg(genre), '{}') as g from public.muted_genres, me where user_id = me.uid),
  -- De quem eu curto/comento posts (últimos 60 dias até abrir o feed).
  interactions as (
    select author_id as id, count(*)::float8 as n from (
      select p.author_id from public.likes l join public.posts p on p.id = l.post_id, me
      where l.user_id = me.uid and l.created_at <= me.at and l.created_at > me.at - interval '60 days'
      union all
      select p.author_id from public.comments c join public.posts p on p.id = c.post_id, me
      where c.author_id = me.uid and c.created_at <= me.at and c.created_at > me.at - interval '60 days'
    ) x, me where author_id <> me.uid group by author_id
  ),
  -- Quanto o perfil de cada autor (gêneros que ele escolheu) bate com o meu gosto.
  author_taste as (
    select ug.user_id as id, sum(t.weight) as w
    from public.user_genres ug join taste t on t.genre = ug.genre
    group by ug.user_id
  ),
  -- Posts que podem entrar (com muito post na rede, não dá para pontuar todos a cada página):
  -- os mais novos, os do meu gosto (gênero, artista, palavra) e os de quem sigo, de quem
  -- interajo e os meus. Todos dos últimos 14 dias; nunca mais que ~4.100 para pontuar.
  pool as (
    (select p.id from public.posts p, me
     where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
     order by p.created_at desc limit 1000)
    union
    (select p.id from public.posts p, me
     where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       and p.genres && (select coalesce(array_agg(genre), '{}') from taste)
     order by p.created_at desc limit 1000)
    union
    -- Palavras: entre os 5.000 mais novos (custo fixo; o índice por palavra pegaria posts
    -- demais quando a palavra é comum).
    (select x.id from (
       select p.id, p.terms, p.created_at from public.posts p, me
       where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       order by p.created_at desc limit 5000
     ) x
     where x.terms && (select a from word_list)
     order by x.created_at desc limit 300)
    union
    (select p.id
     from public.link_previews lp
     join public.posts p on p.link_preview_id = lp.id, me
     where lp.artist_keys && (select a from artist_list)
       and p.created_at > me.at - interval '14 days' and p.created_at <= me.at
     order by p.created_at desc limit 300)
    union
    (select y.id from (
       select x.id, x.created_at
       from (select id from following union select id from interactions union select uid from me) a
       cross join lateral (
         select p.id, p.created_at from public.posts p, me
         where p.author_id = a.id and p.created_at > me.at - interval '14 days' and p.created_at <= me.at
         order by p.created_at desc limit 30
       ) x
       order by x.created_at desc limit 1500
     ) y)
  ),
  candidates as (
    select p.id, p.author_id, p.created_at, p.like_count, p.comment_count, p.terms,
      p.genres || coalesce(lp.genres, '{}') as g,
      lp.artist_keys as artists
    from pool
    join public.posts p on p.id = pool.id
    left join public.link_previews lp on lp.id = p.link_preview_id
    where p.author_id not in (select id from blocked)
      and p.author_id not in (select id from hidden_private)
      and not ((p.genres || coalesce(lp.genres, '{}')) && (select g from muted))
  ),
  -- Gêneros e pedaços de gênero de cada post (para cruzar com o gosto por join, não post a post).
  post_genres as (select distinct c.id, x.genre from candidates c, unnest(c.g) x (genre)),
  post_match as (
    select pg.id, sum(t.weight) as w from post_genres pg join taste t on t.genre = pg.genre group by pg.id
  ),
  near_match as (
    select x.id, sum(k.weight) as w
    from (select distinct pg.id, tok from post_genres pg, unnest(string_to_array(pg.genre, '_')) tok) x
    join tokens k on k.tok = x.tok
    group by x.id
  ),
  artist_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.artists) a join terms t on t.kind = 'artist' and t.term = a
    group by c.id
  ),
  word_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.terms) w join terms t on t.kind = 'word' and t.term = w
    group by c.id
  ),
  -- Quantas pessoas que eu sigo curtiram (até eu abrir o feed).
  social as (
    select l.post_id as id, count(*)::float8 as n
    from candidates c
    join public.likes l on l.post_id = c.id
    join following f on f.id = l.user_id, me
    where l.created_at <= me.at
    group by l.post_id
  ),
  scored as (
    select c.id, c.created_at, c.like_count, c.comment_count,
      f.id is not null as followed,
      c.author_id = (select uid from me) as mine,
      coalesce(i.n, 0) as inter,
      least(coalesce(pm.w, 0), 2) as post_match,
      least(coalesce(nm.w, 0), 1) as near_match,
      least(coalesce(a.w, 0), 2) as author_match,
      least(coalesce(am.w, 0), 1) as artist_match,
      least(coalesce(wm.w, 0), 1) as word_match,
      coalesce(so.n, 0) as social
    from candidates c
    left join following f on f.id = c.author_id
    left join interactions i on i.id = c.author_id
    left join author_taste a on a.id = c.author_id
    left join post_match pm on pm.id = c.id
    left join near_match nm on nm.id = c.id
    left join artist_match am on am.id = c.id
    left join word_match wm on wm.id = c.id
    left join social so on so.id = c.id
  ),
  -- 1) Só a pontuação, para escolher a página (barato).
  ranked as (
    select s.id,
      case
        when not (select yes from has_taste) then 0
        when s.followed or s.mine or s.inter > 0 or s.post_match > 0 or s.near_match > 0 or s.author_match > 0
          or s.artist_match > 0 or s.word_match > 0 or s.social > 0 then 0
        else 1
      end as tier,
      (
        0.5
        + s.post_match + 0.6 * s.near_match + 0.5 * s.author_match
        + 1.2 * s.artist_match + 0.6 * s.word_match + 0.5 * ln(1 + s.social)
        + case when s.followed then 2.5 else 0 end
        + case when s.mine then 2 else 0 end
        + 0.8 * ln(1 + s.inter)
        + 0.5 * ln(1 + s.like_count) + 0.3 * ln(1 + s.comment_count)
      ) / power(extract(epoch from ((select at from me) - s.created_at))::float8 / 3600.0 + 2, 1.25) as score
    from scored s
    order by tier, score desc, s.created_at desc, s.id
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  )
  -- 2) Detalhes (autor, música, mídia, curtida) só dos posts da página.
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    r.score,
    p.genres, private.post_media_json(p.id), p.type
  from ranked r
  join public.posts p on p.id = r.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by r.tier, r.score desc, p.created_at desc, p.id;
$function$;

-- ---------------------------------------------------------------- reviews para você

create function public.feed_reviews_for_you(p_limit int default 15, p_now timestamptz default null)
returns table (
  id uuid,
  rating numeric,
  body text,
  like_count int,
  liked_by_me boolean,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  album_id uuid,
  album_title text,
  album_artist text,
  album_image_url text,
  album_url text,
  album_platform text,
  album_year int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  terms as (select t.term, t.kind, t.weight from me, private.taste_terms(me.uid, me.at) t),
  artist_list as (select coalesce(array_agg(t.term), '{}') as a from terms t where t.kind = 'artist'),
  following as (select f.followee_id as id from public.follows f, me where f.follower_id = me.uid),
  blocked as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  hidden_private as (
    select pr.id from public.profiles pr, me
    where pr.is_private and pr.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = pr.id)
  ),
  muted as (select coalesce(array_agg(m.genre), '{}') as g from public.muted_genres m, me where m.user_id = me.uid),
  -- Reviews que podem entrar: as mais curtidas dos últimos 6 meses, as de álbuns de artistas e
  -- gêneros do meu gosto e as recentes de quem eu sigo.
  pool as (
    (select r.id from public.album_reviews r, me
     where r.created_at > me.at - interval '180 days' and r.created_at <= me.at and r.like_count > 0
     order by r.like_count desc, r.created_at desc limit 300)
    union
    (select r.id from public.link_previews lp join public.album_reviews r on r.album_id = lp.id, me
     where lp.artist_keys && (select a from artist_list)
       and r.created_at > me.at - interval '365 days' and r.created_at <= me.at
     order by r.like_count desc, r.created_at desc limit 200)
    union
    (select r.id from public.link_previews lp join public.album_reviews r on r.album_id = lp.id, me
     where lp.genres && (select coalesce(array_agg(t.genre), '{}') from taste t)
       and r.created_at > me.at - interval '365 days' and r.created_at <= me.at
     order by r.like_count desc, r.created_at desc limit 200)
    union
    (select r.id from public.album_reviews r join following f on f.id = r.author_id, me
     where r.created_at > me.at - interval '60 days' and r.created_at <= me.at
     order by r.created_at desc limit 100)
  ),
  candidates as (
    select r.id, r.album_id, r.author_id, r.like_count, r.created_at, r.terms,
      coalesce(lp.genres, '{}') as g,
      lp.artist_keys as artists,
      private.terms(lp.title) as title_terms
    from pool
    join public.album_reviews r on r.id = pool.id
    join public.link_previews lp on lp.id = r.album_id, me
    where r.author_id <> me.uid
      and r.author_id not in (select b.id from blocked b)
      and r.author_id not in (select h.id from hidden_private h)
      and not (coalesce(lp.genres, '{}') && (select m.g from muted m))
      and not exists (select 1 from public.review_likes l where l.review_id = r.id and l.user_id = me.uid)
  ),
  genre_match as (
    select c.id, sum(t.weight) as w from candidates c, unnest(c.g) x join taste t on t.genre = x group by c.id
  ),
  artist_match as (
    select c.id, sum(t.weight) as w from candidates c, unnest(c.artists) x join terms t on t.kind = 'artist' and t.term = x group by c.id
  ),
  word_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.terms || c.title_terms) x join terms t on t.kind = 'word' and t.term = x
    group by c.id
  ),
  scored as (
    select c.id, c.album_id, c.created_at,
      (
        0.3
        + least(coalesce(gm.w, 0), 2)
        + 1.5 * least(coalesce(am.w, 0), 1)
        + 0.5 * least(coalesce(wm.w, 0), 1)
        + case when f.id is not null then 1 else 0 end
      ) * (1 + ln(1 + c.like_count))
      / power(extract(epoch from ((select at from me) - c.created_at))::float8 / 86400.0 + 3, 0.5) as score,
      coalesce(gm.w, 0) + coalesce(am.w, 0) + coalesce(wm.w, 0) > 0 or f.id is not null as relevant,
      c.like_count
    from candidates c
    left join genre_match gm on gm.id = c.id
    left join artist_match am on am.id = c.id
    left join word_match wm on wm.id = c.id
    left join following f on f.id = c.author_id
  ),
  -- Uma por álbum (a de maior pontuação). Fora do gosto, só as bem curtidas (2+).
  best as (
    select s.*, row_number() over (partition by s.album_id order by s.score desc, s.created_at desc, s.id) as n
    from scored s
    where s.relevant or s.like_count >= 2
  ),
  page as (
    select b.id, b.score from best b where b.n = 1
    order by b.relevant desc, b.score desc, b.created_at desc, b.id
    limit least(greatest(coalesce(p_limit, 15), 1), 30)
  )
  select r.id, r.rating, r.body, r.like_count, false, r.created_at,
         a.id, a.username, a.display_name, a.avatar_url,
         lp.id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform,
         extract(year from lp.release_date)::int
  from page
  join public.album_reviews r on r.id = page.id
  join public.profiles a on a.id = r.author_id
  join public.link_previews lp on lp.id = r.album_id
  join best b on b.id = page.id
  order by b.relevant desc, page.score desc, r.created_at desc, r.id;
end;
$$;
revoke execute on function public.feed_reviews_for_you(int, timestamptz) from public, anon;
grant execute on function public.feed_reviews_for_you(int, timestamptz) to authenticated;

-- ---------------------------------------------------------------- contas sugeridas

-- Igual a antes; só os gêneros mostrados no cartão ("Também curte...") ficam entre os fortes
-- do meu gosto (o nicho de quem eu sigo pesa pouco e não deve aparecer como "gosto meu").
create or replace function public.suggested_accounts(p_limit int default 10)
returns table (id uuid, username text, display_name text, avatar_url text, genres text[], reason text)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, now() as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  excluded as (
    select (select uid from me) as id
    union select followee_id from public.follows, me where follower_id = me.uid
    union select b.blocked_id from public.blocks b, me where b.blocker_id = me.uid
    union select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  -- Gêneros do perfil e dos posts recentes de cada pessoa que batem com o meu gosto.
  genre_fit as (
    select x.id, sum(t.weight) as w,
      (array_agg(t.genre order by t.weight desc) filter (where t.weight >= 0.25))[1:2] as top
    from (
      select ug.user_id as id, ug.genre from public.user_genres ug
      union
      select p.author_id, g from public.posts p, me, unnest(p.genres) g
      where p.created_at > me.at - interval '60 days'
    ) x
    join taste t on t.genre = x.genre
    where x.id not in (select id from excluded)
    group by x.id
  ),
  liked_authors as (
    select p.author_id as id, count(*)::float8 as n
    from public.likes l join public.posts p on p.id = l.post_id, me
    where l.user_id = me.uid and l.created_at > me.at - interval '90 days'
      and p.author_id not in (select id from excluded)
    group by p.author_id
  ),
  -- Seguido por quem eu sigo.
  friends_of_friends as (
    select f2.followee_id as id, count(*)::float8 as n
    from public.follows f1 join public.follows f2 on f2.follower_id = f1.followee_id, me
    where f1.follower_id = me.uid and f2.followee_id not in (select id from excluded)
    group by f2.followee_id
  ),
  pool as (
    select id from genre_fit union select id from liked_authors union select id from friends_of_friends
  ),
  scored as (
    select pool.id,
      coalesce(g.w, 0) + 0.8 * ln(1 + coalesce(l.n, 0)) + 0.6 * ln(1 + coalesce(f.n, 0))
        + case when exists (select 1 from public.posts p, me where p.author_id = pool.id and p.created_at > me.at - interval '14 days') then 0.3 else 0 end
        as score,
      coalesce(g.top, '{}') as top,
      case
        when coalesce(l.n, 0) >= 2 then 'liked'
        when cardinality(coalesce(g.top, '{}')) > 0 then 'genres'
        else 'friends'
      end as reason
    from pool
    left join genre_fit g on g.id = pool.id
    left join liked_authors l on l.id = pool.id
    left join friends_of_friends f on f.id = pool.id
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, s.top, s.reason
  from scored s
  join public.profiles pr on pr.id = s.id
  order by s.score desc, pr.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

