# Testes

Quatro camadas, da mais rápida para a mais completa. O CI (`.github/workflows/ci.yml`) roda as três primeiras a cada push.

| Camada | Ferramenta | Onde | O que cobre | Comando |
| --- | --- | --- | --- | --- |
| Regras compartilhadas | Vitest | `packages/core/src/**/*.test.ts` | Reconhecimento de links de 9 plataformas, cartões de prévia (com `fetch` falso), proteção SSRF, idade, validações | `npm run test:core` |
| Banco e regras de acesso | Vitest + PostgreSQL | `tests/db/*.test.ts` | Migrations aplicam do zero; RLS de perfis, posts, curtidas, comentários, bloqueios, denúncias e destaques; onboarding e regra de idade; feed, Descobrir, Em alta e busca | `npm run test:db` |
| Edge Function | Deno test | `supabase/functions/link-preview/handler.test.ts` | A função inteira (login, cache, Spotify com a resposta real do oEmbed, erros, CORS) com Supabase e plataformas simulados | `npm run test:functions` |
| App | Jest + Testing Library | `apps/mobile/__tests__` | Componentes (cartão de música, post, cartão do Descobrir com swipe, ranking, busca), checagem de username enquanto digita, erros de login, traduções completas em pt-BR e en, erros, curtida otimista | `npm run test:app` |
| Ponta a ponta | Maestro | `apps/mobile/.maestro` | Cadastro completo, login com senha e postar música num app de verdade | `maestro test apps/mobile/.maestro` |

## Testes do banco

Os testes criam um banco `soundora_test`, aplicam um "shim" que imita o Supabase (`tests/db/supabase-shim.sql`: papéis `anon`/`authenticated`, `auth.users`, `auth.uid()`), depois as migrations e o seed. Cada consulta roda como uma pessoa logada, como visitante ou como superusuário.

Com o Supabase local rodando (`npx supabase start`), use o Postgres dele:

```powershell
$env:DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54322/postgres"
npm run test:db
```

O banco de teste é separado; os dados do seu Supabase local não são tocados.

## Ponta a ponta (Maestro)

1. `npx supabase start` e `npx supabase functions serve`.
2. Gere um build de desenvolvimento no emulador: `cd apps/mobile` e `npx expo run:android`.
3. Rode:

```powershell
maestro test apps/mobile/.maestro/01-cadastro.yaml -e EMAIL=teste1@soundora.dev -e USERNAME=teste1
maestro test apps/mobile/.maestro/02-postar-musica.yaml
```

O fluxo de cadastro lê o código de login direto da caixa de e-mail local (`scripts/get-otp.js`).

## Antes de cada commit

```powershell
npm run typecheck; npm run lint; npm test
```
