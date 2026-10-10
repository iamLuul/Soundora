# Soundora

Rede social de música para Android, iOS e Web. As pessoas postam links de streaming, o Soundora mostra um cartão de prévia (capa, título, artista) e o play abre a faixa **no streaming de origem do link**. O Soundora não toca áudio.

Este repositório tem a fundação do MVP e o primeiro fluxo completo:

- cadastro por código no e-mail (e Google/Apple), com onboarding de 4 passos;
- regra de idade configurável, aplicada no app e no banco;
- indexador de links de 9 plataformas, com cache e proteção contra SSRF;
- postar música, feed "Para você", curtir, comentar, seguir;
- Descobrir (cartões com swipe: destaques da curadoria e indicações da comunidade), Em alta (ranking da semana por gênero) e Buscar (pessoas e músicas);
- perfil, denunciar, bloquear e apagar post;
- interface em português do Brasil e inglês.

## Estrutura

```
apps/mobile/            App Expo (Android, iOS e Web no mesmo código)
  src/app/              Telas (Expo Router: cada arquivo é uma rota)
  src/components/       Componentes (cartão de música, post, lista, menu)
  src/lib/              Supabase, autenticação, API, i18n, consultas
  src/locales/          Textos em pt-BR e en
  __tests__/            Testes de componentes e lógica (Jest)
  .maestro/             Testes ponta a ponta no celular/emulador (Maestro)
packages/core/          Regras compartilhadas: links de streaming, idade, validação (+ testes Vitest)
supabase/
  migrations/           Banco: tabelas, regras de acesso (RLS), feed
  functions/link-preview/  Edge Function do indexador de links
  seed.sql              Gêneros
  config.toml           Configuração do Supabase local
tests/db/               Testes do banco e das regras de acesso (Vitest + PostgreSQL)
scripts/sync-shared.mjs Copia o indexador do core para a Edge Function
docs/                   Guia de instalação no Windows e guia de testes
```

## Começo rápido

Guia completo, com todos os programas: [docs/SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md).

```bash
npm install                      # na raiz do repositório
npx supabase start               # Supabase local (precisa do Docker Desktop aberto)
npx supabase functions serve     # em outro terminal: Edge Function do indexador
copy apps\mobile\.env.example apps\mobile\.env.local   # e cole a publishable key
npm run app                      # abre o Expo: tecle w (Web) ou leia o QR code no Expo Go
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run app` | Inicia o app (Expo) |
| `npm run typecheck` | Confere os tipos do core e do app |
| `npm run lint` | ESLint do app |
| `npm test` | Testes do core (Vitest) e do app (Jest) |
| `npm run test:db` | Testes do banco e RLS (precisa de PostgreSQL; veja [docs/TESTES.md](docs/TESTES.md)) |
| `npm run typecheck:functions` | Confere a Edge Function com Deno |
| `npm run sync:shared` | Copia o indexador de `packages/core` para a Edge Function. Rode após mudar `packages/core/src/links` |

## Decisões importantes

- **Sem reprodução de áudio.** Toda faixa abre no app ou site de origem. Isso evita licenças de música.
- **Segurança no banco.** O app usa só a chave pública; o que cada pessoa pode ler e escrever está nas policies de RLS em `supabase/migrations`, cobertas por testes.
- **Idade mínima ainda em decisão.** Está em `public.app_config` (`min_age`, padrão 13). Pelo ECA Digital, contas de 13 a 15 anos precisam de vínculo com um responsável; enquanto esse fluxo não existir (`guardian_flow_enabled = false`), essas idades são bloqueadas no cadastro. Para mudar: `update public.app_config set min_age = 18;`
- **Curadoria do Descobrir.** Destaques ficam na tabela `public.featured` e aparecem primeiro no Descobrir, pelo gênero da pessoa. Para destacar uma música, poste o link no app (isso cria o cartão) e, como administrador, rode no SQL Editor:

  ```sql
  insert into public.featured (link_preview_id, genre, note_pt, note_en, position, ends_at)
  select id, 'shoegaze', 'O som que definiu o gênero.', 'The sound that defined the genre.', 1, now() + interval '14 days'
  from public.link_previews where url = 'https://open.spotify.com/track/<id>';
  ```

- **Moderação.** Para virar administrador: `insert into public.admins (user_id) values ('<seu id>');` Administradores veem todas as denúncias e podem apagar posts e comentários.

## Próximos passos do roteiro

Painel admin (moderação e curadoria sem SQL), notificações push, edição de perfil com avatar (o bucket `avatars` já existe), vídeos e Vibes, e vínculo com responsável.
