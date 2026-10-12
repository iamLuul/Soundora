# Soundora

Rede social de música para Android, iOS e Web. As pessoas postam links de streaming, o Soundora mostra um cartão de prévia (capa, título, artista) e o play abre a faixa **no streaming de origem do link**. O Soundora não toca áudio.

Este repositório tem a fundação do MVP e o primeiro fluxo completo:

- cadastro com e-mail, senha e confirmação por código (e Google/Apple), com onboarding de 4 passos e username checado enquanto se digita;
- login com e-mail ou @usuário, por senha ou por código no e-mail (com @usuário, o servidor acha o e-mail e limita tentativas);
- regra de idade configurável, aplicada no app e no banco;
- indexador de links de 9 plataformas, com cache e proteção contra SSRF;
- postar texto (até 500 caracteres), até 4 fotos ou 1 vídeo e/ou uma música, com até 3 gêneros do catálogo (mais de 6 mil, com busca) (os da música são detectados sozinhos pelo Apple Music e Deezer); feed "Para você", post em tela cheia com os comentários (responder e curtir comentários), curtir, comentar, seguir; link de música colado no texto vira o card sozinho, e o gênero só aparece com música;
- Descobrir (cartões com swipe e prévia de 30 s: sugestões pelo que a pessoa curtiu e pelos gêneros do perfil, via Last.fm + Deezer, misturadas com destaques e indicações da comunidade; busca por gênero; lista de músicas curtidas que abrem na plataforma de streaming da pessoa; gêneros editáveis no Editar perfil), Em alta (as 50 mais tocadas no mundo, pelo Last.fm, com capa, álbum e se subiu ou caiu; cada música abre na plataforma de streaming que a pessoa escolheu no cadastro) e Buscar (gêneros no topo, depois pessoas e músicas; tocar num gênero, na busca ou no próprio post, abre os posts marcados com ele; se o texto não é gênero, pessoa nem música, ao pesquisar aparecem os posts que contêm a palavra, sem diferenciar maiúsculas nem acentos);
- perfil no layout do Figma (banner, foto centralizada, números que abrem seguidores, seguindo e as músicas curtidas no Descobrir), com troca de foto e banner, menu de opções e Configurações (editar perfil, alterar @, redefinir senha, bloqueados, plataforma de streaming, idioma, sair, excluir conta); denunciar, bloquear e apagar post; o teclado empurra a tela para o campo de texto ficar logo acima dele;
- todas as telas no layout do Figma (Case Study UI/UX): logo, ícones e logos das plataformas exportados do arquivo (`apps/mobile/src/assets`), barra inferior com o botão "+" central, Home com a fila de quem você segue, Notificações, aba Músicas (curtidas e postadas), cartão de música por plataforma, botões do Descobrir, login, cadastro, código em 6 caixas e onboarding com pontos de progresso;
- perfis verificados com insígnia ao lado do nome; só a equipe verifica, direto no banco: `update public.profiles set verified = true where username = 'fulano';` (o app não consegue mudar essa coluna);
- notificações de curtidas, comentários, respostas e novos seguidores (aba Todas e Respostas, bolinha no sino), que chegam ao vivo pelo Supabase Realtime (canal privado de cada pessoa, sem puxar para atualizar), e aviso no celular (push) para quem ativar;
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
  seed.sql              Gêneros em destaque
  data/genres.json      Catálogo completo de gêneros (gera a migration via scripts/genres-migration.py)
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
| `npm run demo` | Dados de demonstração no Supabase local (algumas contas, posts e vibes). `-- --remove` apaga |
| `npm run load` | Carga para teste de desempenho no Supabase local: centenas de contas (com foto e banner) e milhares de posts (música, fotos e vídeos), curtidas, comentários, seguidores e vibes. Fotos e vídeos de bancos públicos de teste (randomuser.me, Lorem Picsum, filmes abertos da Blender). `-- --scale small\|large`, `-- --users N --posts N`, `-- --no-media`; `-- --remove` apaga tudo, arquivos inclusive |
| `npm run sync:shared` | Copia o indexador de `packages/core` para a Edge Function. Rode após mudar `packages/core/src/links` |

## Decisões importantes

- **Sem reprodução de áudio.** Toda faixa abre no app ou site de origem. Isso evita licenças de música.
- **Login com @usuário sem expor e-mail.** O app manda o @ para a Edge Function `auth-username`, que acha o e-mail com a chave secreta (função `login_lookup`, fechada para o app) e devolve só a sessão. Tentativas ficam em `public.login_attempts`.
- **Segurança.** O app usa só a chave pública e só acessa o banco logado; RLS em todas as tabelas, limites de ações por pessoa, uploads conferidos pelos bytes e sessão criptografada no celular. Detalhes, limites e o que ligar no painel da nuvem: [docs/SEGURANCA.md](docs/SEGURANCA.md).
- **Idade mínima ainda em decisão.** Está em `public.app_config` (`min_age`, padrão 13). Pelo ECA Digital, contas de 13 a 15 anos precisam de vínculo com um responsável; enquanto esse fluxo não existir (`guardian_flow_enabled = false`), essas idades são bloqueadas no cadastro. Para mudar: `update public.app_config set min_age = 18;`
- **Catálogo de gêneros.** Os ~6 mil gêneros de `supabase/data/genres.json` entram pela migration `20261011000011_genre_catalog.sql`; os marcados com `featured` aparecem como atalhos no cadastro e no Editar perfil, e o resto se acha pela busca (RPC `search_genres`). Para mudar a lista, edite o JSON, rode `python3 scripts/genres-migration.py` e crie uma nova migration com o resultado (não altere uma migration já aplicada).
- **Curadoria do Descobrir.** Destaques ficam na tabela `public.featured` e aparecem primeiro no Descobrir, pelo gênero da pessoa. Para destacar uma música, poste o link no app (isso cria o cartão) e, como administrador, rode no SQL Editor:

  ```sql
  insert into public.featured (link_preview_id, genre, note_pt, note_en, position, ends_at)
  select id, 'shoegaze', 'O som que definiu o gênero.', 'The sound that defined the genre.', 1, now() + interval '14 days'
  from public.link_previews where url = 'https://open.spotify.com/track/<id>';
  ```

- **Moderação.** Para virar administrador: `insert into public.admins (user_id) values ('<seu id>');` (só pelo banco). Aí aparece **Configurações › Painel admin**, com:
  - **Denúncias** agrupadas por conteúdo (as mais denunciadas primeiro): ver, remover o post/comentário/vibe, dispensar ou suspender o autor;
  - **Usuários**: busca por @ ou nome, filtros (verificados, comuns, admins, suspensos, com denúncias) e ordenação (relevância, mais/menos seguidores, A a Z, Z a A); verificar/tirar a insígnia, suspender por 7 dias, 30 dias ou sem data, e reativar. Conta suspensa continua vendo o app, mas o banco recusa posts, comentários, curtidas, seguir, vibes e denúncias, e ela vê um aviso na Início;
  - **Destaques** do Descobrir: colar o link da música, recado e ordem; remover.
  Cada ação fica registrada em `public.admin_actions` (quem fez, o quê, quando).

## Próximos passos do roteiro

Vínculo com responsável e anúncios.
