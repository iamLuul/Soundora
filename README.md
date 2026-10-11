# Soundora

Rede social de música para Android, iOS e Web. As pessoas postam links de streaming, o Soundora mostra um cartão de prévia (capa, título, artista) e o play abre a faixa **no streaming de origem do link**. O Soundora não toca áudio.

Este repositório tem a fundação do MVP e o primeiro fluxo completo:

- cadastro com e-mail, senha e confirmação por código (e Google/Apple), com onboarding de 4 passos e username checado enquanto se digita;
- login com e-mail ou @usuário, por senha ou por código no e-mail (com @usuário, o servidor acha o e-mail e limita tentativas);
- regra de idade configurável, aplicada no app e no banco;
- indexador de links de 9 plataformas, com cache e proteção contra SSRF;
- postar texto (até 500 caracteres), até 4 fotos ou 1 vídeo e/ou uma música, com até 3 gêneros de toda a lista (os da música são detectados sozinhos pelo Apple Music e Deezer); feed "Para você", post em tela cheia com os comentários (responder e curtir comentários), curtir, comentar, seguir; link de música colado no texto vira o card sozinho, e o gênero só aparece com música;
- Descobrir (cartões com swipe: destaques da curadoria e indicações da comunidade), Em alta (as 50 mais tocadas no mundo, pelo Last.fm, com capa, álbum e se subiu ou caiu; cada música abre na plataforma de streaming que a pessoa escolheu no cadastro) e Buscar (pessoas e músicas);
- perfil no layout do Figma (banner, foto centralizada, números que abrem seguidores, seguindo e posts curtidos), com troca de foto e banner, menu de opções e Configurações (editar perfil, alterar @, redefinir senha, idioma, sair, excluir conta); denunciar, bloquear e apagar post;
- todas as telas no layout do Figma (Case Study UI/UX): logo, ícones e logos das plataformas exportados do arquivo (`apps/mobile/src/assets`), barra inferior com o botão "+" central, Home com a fila de quem você segue, Notificações, aba Músicas (curtidas e postadas), cartão de música por plataforma, botões do Descobrir, login, cadastro, código em 6 caixas e onboarding com pontos de progresso;
- notificações de curtidas, comentários, respostas e novos seguidores (aba Todas e Respostas, bolinha no sino) e aviso no celular (push) para quem ativar;
- Vibes (como os Stories): foto, vídeo de até 30 s, texto escrito direto na tela, card de música (com a prévia de 30 s tocando de fundo, quando a Apple Music ou a Deezer oferecem) ou post compartilhado, que somem em 24 horas; fila no topo da Home com anel de "não visto", tela cheia com avançar/voltar/pausar, quem viu, apagar e denunciar;
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
  functions/auth-username/ Edge Function do login com @usuário
  functions/profile-image/ Edge Function que confere e grava a foto e o banner do perfil
  functions/delete-account/ Edge Function que exclui a conta
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
npx supabase functions serve     # em outro terminal: Edge Functions (indexador, login com @ e foto)
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
| `npm run typecheck:functions` | Confere as Edge Functions com Deno |
| `npm run test:functions` | Testa as Edge Functions no Deno, com Spotify e Supabase simulados |
| `npm run check:secrets` | Confere que nenhuma chave secreta está no Git ou no app |
| `npm run sync:shared` | Copia o indexador de `packages/core` para a Edge Function. Rode após mudar `packages/core/src/links` |

## Decisões importantes

- **Sem reprodução de áudio.** Toda faixa abre no app ou site de origem. Isso evita licenças de música.
- **Login com @usuário sem expor e-mail.** O app manda o @ para a Edge Function `auth-username`, que acha o e-mail com a chave secreta (função `login_lookup`, fechada para o app) e devolve só a sessão. Tentativas ficam em `public.login_attempts`.
- **Segurança.** O app usa só a chave pública e só acessa o banco logado; RLS em todas as tabelas, limites de ações por pessoa, uploads conferidos pelos bytes e sessão criptografada no celular. Detalhes, limites e o que ligar no painel da nuvem: [docs/SEGURANCA.md](docs/SEGURANCA.md).
- **Idade mínima ainda em decisão.** Está em `public.app_config` (`min_age`, padrão 13). Pelo ECA Digital, contas de 13 a 15 anos precisam de vínculo com um responsável; enquanto esse fluxo não existir (`guardian_flow_enabled = false`), essas idades são bloqueadas no cadastro. Para mudar: `update public.app_config set min_age = 18;`
- **Curadoria do Descobrir.** Destaques ficam na tabela `public.featured` e aparecem primeiro no Descobrir, pelo gênero da pessoa. Para destacar uma música, poste o link no app (isso cria o cartão) e, como administrador, rode no SQL Editor:

  ```sql
  insert into public.featured (link_preview_id, genre, note_pt, note_en, position, ends_at)
  select id, 'shoegaze', 'O som que definiu o gênero.', 'The sound that defined the genre.', 1, now() + interval '14 days'
  from public.link_previews where url = 'https://open.spotify.com/track/<id>';
  ```

- **Moderação.** Para virar administrador: `insert into public.admins (user_id) values ('<seu id>');` Administradores veem todas as denúncias e podem apagar posts e comentários.

## Próximos passos do roteiro

Painel admin (moderação e curadoria sem SQL) e vínculo com responsável.
