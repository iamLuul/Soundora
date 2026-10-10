# Testes

Quatro camadas, da mais rápida para a mais completa. O CI (`.github/workflows/ci.yml`) roda as três primeiras a cada push.

| Camada | Ferramenta | Onde | O que cobre | Comando |
| --- | --- | --- | --- | --- |
| Regras compartilhadas | Vitest | `packages/core/src/**/*.test.ts` | Reconhecimento de links de 9 plataformas, cartões de prévia (com `fetch` falso), proteção SSRF, idade, validações | `npm run test:core` |
| Banco e regras de acesso | Vitest + PostgreSQL | `tests/db/*.test.ts` | Migrations aplicam do zero; RLS de perfis, posts, curtidas, comentários, bloqueios, denúncias e destaques; onboarding e regra de idade; feed, Descobrir, Em alta e busca; o app nunca lê o e-mail de alguém pelo @; invariantes de segurança (RLS em toda tabela, nada para visitantes, sem TRUNCATE, funções novas fechadas, limites de ações, bucket sem escrita pelo app) | `npm run test:db` |
| Edge Functions | Deno test | `supabase/functions/*/handler.test.ts` | Indexador (login, cache, Spotify com a resposta real do oEmbed, limites, erros, CORS), login com @usuário (senha, código, e-mail nunca exposto, limites de tentativas) e foto de perfil (tipo real pelos bytes, bomba de pixels, ZIP escondido, tamanho, limite) com Supabase e plataformas simulados | `npm run test:functions` |
| App | Jest + Testing Library | `apps/mobile/__tests__` | Chave secreta recusada, sessão criptografada, URL da foto, componentes (cartão de música, post, cartão do Descobrir com swipe, ranking, busca), cadastro com senha e código, login por e-mail ou @usuário com senha ou código, checagem de username enquanto digita, erros de login, traduções completas em pt-BR e en, erros, curtida otimista | `npm run test:app` |
| Ponta a ponta | Maestro | `apps/mobile/.maestro` | Cadastro completo (senha + código), login com @usuário (senha e código) e postar música num app de verdade | `maestro test apps/mobile/.maestro` |

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
maestro test apps/mobile/.maestro/01-cadastro.yaml -e EMAIL=teste1@soundora.dev -e USERNAME=teste1 -e PASSWORD=senha-forte-123
maestro test apps/mobile/.maestro/02-postar-musica.yaml
maestro test apps/mobile/.maestro/03-login-usuario.yaml -e USERNAME=teste1 -e PASSWORD=senha-forte-123
```

Os fluxos leem o código direto da caixa de e-mail local (`scripts/get-otp.js`).

## Antes de cada commit

```powershell
npm run check:secrets; npm run typecheck; npm run lint; npm test
```
