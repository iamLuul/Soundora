-- Em alta: os links por plataforma passam a partir também do link da Apple Music
-- (quando a Deezer não acha a música). Só renomeia e amplia a regra: os dados ficam.
alter table public.track_platform_links rename column deezer_url to source_url;
alter table public.track_platform_links drop constraint track_platform_links_deezer_url_check;
alter table public.track_platform_links add constraint track_platform_links_source_url_check
  check (source_url ~ '^https://(www\.deezer\.com/track/[0-9]{1,15}|music\.apple\.com/[a-z]{2}/(album|song)/[^\s?#]{1,200}(\?i=[0-9]{1,15})?)$');
