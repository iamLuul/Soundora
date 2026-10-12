-- Descobrir: gêneros mais certos.
--
-- 1) Os dois "Funk" do catálogo tinham o mesmo nome em português: o brasileiro (funk_br, dos
--    destaques) e o americano (funk, do catálogo grande, a tag "funk" do Last.fm: James Brown,
--    anos 70). Agora cada um diz qual é. Na busca por "funk", o brasileiro vem primeiro (é
--    destaque).
update public.genres set name_pt = 'Funk brasileiro', name_en = 'Brazilian funk' where slug = 'funk_br';
update public.genres set name_pt = 'Funk (EUA)', name_en = 'Funk (US)' where slug = 'funk';

-- 2) Gêneros do álbum na Deezer de cada cartão do Descobrir, guardados na primeira conferência
--    (a Edge Function discover descarta sugestões de gênero que claramente não são dele).
alter table public.link_previews add column if not exists store_genre_ids int[]
  check (store_genre_ids is null or cardinality(store_genre_ids) <= 10);
