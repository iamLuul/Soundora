-- Idade mínima do MVP: 16 anos. Contas de 13 a 15 anos exigiriam vínculo com um responsável
-- (ECA Digital, Lei 15.211/2025, art. 24), fluxo que o app ainda não tem; por isso só entra
-- quem tem 16 anos ou mais. `guardian_required_under` continua 16 e o fluxo, desligado: com
-- a idade mínima em 16 ninguém cai nele, e ele fica pronto para uma abertura futura.
-- Quem tem 16 ou 17 anos continua marcado como menor (`is_minor`), para a publicidade.
alter table public.app_config alter column min_age set default 16;
update public.app_config set min_age = 16;
