-- Anúncios (posts e vibes anunciados, AdMob). Ficam desligados até a equipe ligar:
--   update public.app_config set ads_enabled = true;
-- ads_feed_every: um anúncio depois de cada N posts do feed da Início (mínimo 5, para não
-- encostar nas contas sugeridas, que entram depois do 4º post).
-- ads_vibes_every: uma vibe anunciada depois de cada N pessoas na fila de vibes.
-- Só a equipe muda (pelo banco): o app só lê, como o resto de app_config.
alter table public.app_config
  add column ads_enabled boolean not null default false,
  add column ads_feed_every int not null default 8 check (ads_feed_every between 5 and 50),
  add column ads_vibes_every int not null default 4 check (ads_vibes_every between 2 and 20);
