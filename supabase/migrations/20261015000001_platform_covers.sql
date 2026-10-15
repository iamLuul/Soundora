-- Capas do Descobrir nas plataformas sem prévia (Spotify, YouTube Music, Amazon, TIDAL,
-- SoundCloud). O song.link manda, junto com os links, a capa de cada plataforma; agora ela
-- fica guardada com os links (images = null: links guardados antes, sem as capas).
alter table public.track_platform_links add column images jsonb;

-- Antes, quando o song.link pedia para esperar (limite de pedidos), a música ficava marcada
-- como "não está nessa plataforma", e quando a página não tinha capa, ficava sem capa para
-- sempre. Apaga esses resultados para procurar de novo (a Apple usa o iTunes: fica como está).
delete from public.platform_tracks
where platform not in ('apple_music', 'deezer') and (not found or image_url is null);
