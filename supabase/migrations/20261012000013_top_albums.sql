-- Em alta › Top Reviews: os álbuns com as maiores notas médias nas reviews.
--
-- Média de cada álbum guardada em album_rating_stats (soma e quantidade), atualizada por
-- trigger: o ranking não recalcula todas as reviews a cada abertura.
--
-- Ordem: média bayesiana, para um álbum com uma review 10 não passar na frente de um com 40
-- reviews de 9,5. Cada álbum começa com PRIOR "reviews imaginárias" na média geral do app:
--   pontuação = (soma + PRIOR × média_geral) / (quantidade + PRIOR)
-- A tela mostra a média de verdade (soma / quantidade) e quantas reviews o álbum tem.

create table public.album_rating_stats (
  album_id uuid primary key references public.link_previews (id) on delete cascade,
  review_count int not null default 0 check (review_count >= 0),
  rating_sum numeric not null default 0
);
alter table public.album_rating_stats enable row level security;
revoke all on public.album_rating_stats from anon, authenticated;

insert into public.album_rating_stats (album_id, review_count, rating_sum)
select album_id, count(*), sum(rating) from public.album_reviews group by album_id;

create function private.tg_album_rating_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.album_rating_stats
    set review_count = greatest(review_count - 1, 0), rating_sum = rating_sum - old.rating
    where album_id = old.album_id;
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    insert into public.album_rating_stats as s (album_id, review_count, rating_sum)
    values (new.album_id, 1, new.rating)
    on conflict (album_id) do update set review_count = s.review_count + 1, rating_sum = s.rating_sum + excluded.rating_sum;
  end if;
  return null;
end;
$$;
revoke execute on function private.tg_album_rating_stats() from public;
create trigger rating_stats after insert or delete or update of rating, album_id on public.album_reviews
  for each row execute function private.tg_album_rating_stats();

create index album_rating_stats_count on public.album_rating_stats (review_count) where review_count > 0;

create function public.top_reviewed_albums(p_limit int default 50, p_album uuid default null)
returns table (
  rank int,
  album_id uuid,
  title text,
  artist text,
  image_url text,
  url text,
  platform text,
  year int,
  review_count int,
  average numeric,
  score numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  prior constant numeric := 3;
  global_mean numeric;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select coalesce(sum(s.rating_sum) / nullif(sum(s.review_count), 0), 5) into global_mean
  from public.album_rating_stats s where s.review_count > 0;
  return query
  with ranked as (
    select s.album_id, s.review_count,
           round(s.rating_sum / s.review_count, 1) as average,
           round((s.rating_sum + prior * global_mean) / (s.review_count + prior), 3) as score
    from public.album_rating_stats s
    where s.review_count > 0
  ),
  numbered as (
    select r.*, (row_number() over (order by r.score desc, r.review_count desc, r.album_id))::int as rank
    from ranked r
  )
  select n.rank, n.album_id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform,
         extract(year from lp.release_date)::int, n.review_count, n.average, n.score
  from numbered n
  join public.link_previews lp on lp.id = n.album_id
  where (p_album is null and n.rank <= least(greatest(p_limit, 1), 100)) or n.album_id = p_album
  order by n.rank;
end;
$$;
revoke execute on function public.top_reviewed_albums(int, uuid) from public, anon;
grant execute on function public.top_reviewed_albums(int, uuid) to authenticated;
