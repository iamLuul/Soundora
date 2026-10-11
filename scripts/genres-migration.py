#!/usr/bin/env python3
"""Gera a migration com a lista grande de gêneros (supabase/data/genres.json).

    python3 scripts/genres-migration.py > supabase/migrations/20261011000011_genre_catalog.sql

O slug vem do nome (espaços viram _). Alguns nomes já existem com outro slug no Soundora
(kpop → k_pop, rb → r_and_b...) e viram o mesmo gênero. A ordem do arquivo é a popularidade.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
names = json.load(open(ROOT / 'supabase/data/genres.json'))

# Nomes do arquivo que já são gêneros do Soundora com outro slug.
ALIASES = {'kpop': 'k_pop', 'rb': 'r_and_b', 'funk carioca': 'funk_br', 'lofi': 'lo_fi', 'electronica': 'electronic', 'latin': 'latin'}
# Siglas e grafias especiais no nome exibido.
UPPER = {'rb': 'R&B', 'edm': 'EDM', 'mpb': 'MPB', 'uk': 'UK', 'us': 'US', 'nyc': 'NYC', 'dfw': 'DFW', 'atl': 'ATL', 'dmv': 'DMV', 'ccm': 'CCM',
         'opm': 'OPM', 'ebm': 'EBM', 'dnb': 'DnB', 'vgm': 'VGM', 'ost': 'OST', 'nz': 'NZ', 'bc': 'BC', 'oc': 'OC', 'df': 'DF', 'rj': 'RJ',
         'bh': 'BH', 'lgbtq': 'LGBTQ', 'mtg': 'MTG', 'ny': 'NY', 'slc': 'SLC', 'la': 'LA', 'cdo': 'CDO', 'idm': 'IDM', 'rkt': 'RKT',
         'asmr': 'ASMR', 'bgm': 'BGM', 'vbs': 'VBS', 'lds': 'LDS', 'mn': 'MN', 'tx': 'TX', 'nsw': 'NSW', 'nwobhm': 'NWOBHM', 'czsk': 'CZSK',
         'kpop': 'K-pop', 'jpop': 'J-pop', 'cpop': 'C-pop', 'vpop': 'V-pop', 'ppop': 'P-pop', 'hkpop': 'HK-pop', 'jrock': 'J-rock',
         'krock': 'K-rock', 'jrap': 'J-rap', 'krap': 'K-rap', 'jpoprock': 'J-pop rock', 'jmetal': 'J-metal', 'jindie': 'J-indie', 'g': 'G'}

def slug(name):
    if name in ALIASES:
        return ALIASES[name]
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', name.lower())).strip('_')

def label(name):
    return ' '.join(UPPER.get(w, w[:1].upper() + w[1:]) for w in name.split())

def q(s):
    return "'" + s.replace("'", "''") + "'"

seen, rows = set(), []
for rank, name in enumerate(names, start=1):
    name = re.sub(r'\s+', ' ', name).strip()
    s = slug(name)
    if not s or s in seen or len(s) > 80:
        continue
    seen.add(s)
    rows.append(f"  ({q(s)}, {q(label(name))}, {q(label(name))}, {rank})")

out = sys.stdout
out.write("""-- Catálogo grande de gêneros (milhares, de supabase/data/genres.json; gerado por
-- scripts/genres-migration.py). Qualquer pessoa pode pesquisar e ligar ao perfil.
--
-- - featured: os gêneros que aparecem sem pesquisar (os 37 de antes, com nome em português).
-- - rank: popularidade (a ordem do arquivo); a busca mostra os mais populares primeiro.
-- O app não baixa a lista inteira: pesquisa com search_genres().

alter table public.genres
  add column featured boolean not null default false,
  add column rank int;

-- Os gêneros de destaque (antes só no seed.sql; agora também na migration, para a nuvem).
insert into public.genres (slug, name_pt, name_en) values
""")
featured = ROOT / 'supabase/seed.sql'
block = re.search(r"insert into public\.genres \(slug, name_pt, name_en\) values\n(.*?)\non conflict", featured.read_text(), re.S).group(1)
out.write(block + "\non conflict (slug) do nothing;\n")
out.write("update public.genres set featured = true;\n\n")
out.write("insert into public.genres (slug, name_pt, name_en, rank) values\n")
out.write(',\n'.join(rows))
out.write("\non conflict (slug) do update set rank = excluded.rank;\n")
out.write("""
create index genres_featured on public.genres (featured) where featured;
create index genres_name_trgm on public.genres using gin (lower(name_en) extensions.gin_trgm_ops);

-- Pesquisa de gêneros: começa com o texto primeiro, depois contém; destaques e populares antes.
create function public.search_genres(p_query text, p_limit int default 20)
returns table (slug text, name_pt text, name_en text, featured boolean)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(p_query)) as t)
  select g.slug, g.name_pt, g.name_en, g.featured
  from public.genres g, q
  where char_length(q.t) between 1 and 60
    and (lower(g.name_en) like '%' || q.t || '%' or lower(g.name_pt) like '%' || q.t || '%' or g.slug like '%' || replace(q.t, ' ', '_') || '%')
  order by (lower(g.name_en) like q.t || '%' or lower(g.name_pt) like q.t || '%') desc, g.featured desc, g.rank nulls last, g.slug
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.search_genres(text, int) from public, anon;
grant execute on function public.search_genres(text, int) to authenticated;
""")
