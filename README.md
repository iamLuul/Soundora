# Soundhora

Rede social de música para Android, iOS e Web. As pessoas postam links de streaming, o Soundhora mostra um cartão de prévia (capa, título, artista) e o play abre a faixa **no streaming de origem do link**. O Soundhora não toca áudio.

Este repositório tem a fundação do MVP e o primeiro fluxo completo:

- cadastro com e-mail, senha e confirmação por código (e Google/Apple), com onboarding de 4 passos e username checado enquanto se digita;
- login com e-mail ou @usuário, por senha ou por código no e-mail (com @usuário, o servidor acha o e-mail e limita tentativas);
- regra de idade configurável, aplicada no app e no banco;
- indexador de links de 9 plataformas, com cache e proteção contra SSRF;
- postar texto (até 500 caracteres), até 4 fotos ou 1 vídeo e/ou uma música, com até 3 gêneros do catálogo (mais de 6 mil, com busca) (os da música são detectados sozinhos pelo Apple Music e Deezer); feed "Para você", post em tela cheia com os comentários (responder e curtir comentários), curtir, comentar, seguir; link de música colado no texto vira o card sozinho, e o gênero só aparece com música;
- Perfil (layout do Figma): até 5 gêneros da pessoa acima da bio (tocar abre os posts do gênero), "Músicas favoritas" com até 5 músicas escolhidas pela própria pessoa (busca pelo nome na Deezer ou link; ordem ajustável), argola de Vibes na foto quando há vibes ativas (tocar abre as vibes) e duas seções embaixo: Posts e Reviews;
- Reviews de álbuns (Postar › Review): a pessoa escolhe o álbum (busca pelo nome na Deezer, pelo servidor, ou cola o link de um álbum), dá uma nota de 0 a 10 nas 5 estrelas (cada estrela vale 2; tocar ou arrastar, com ajuste fino de 0,1) e escreve a análise (20 a 5000 letras). Ficam em Músicas › Reviews, com curtir, denunciar e apagar a própria; uma review por álbum por pessoa. Em alta › Top Reviews lista os álbuns com as maiores médias (média ao lado e quantas reviews; ordem bayesiana, para uma nota 10 sozinha não liderar) e cada álbum abre uma tela com a média, a posição e todas as reviews dele;
- Descobrir (cartões com swipe e prévia de 30 s: sugestões pelo que a pessoa curtiu e pelos gêneros do perfil, via Last.fm + Deezer, misturadas com destaques e indicações da comunidade; busca por gênero; lista de músicas curtidas que abrem na plataforma de streaming da pessoa; gêneros editáveis no Editar perfil), Em alta (as 50 mais tocadas no mundo, pelo Last.fm, com capa, álbum e se subiu ou caiu; cada música abre na plataforma de streaming que a pessoa escolheu no cadastro) e Buscar (gêneros no topo, depois pessoas e músicas; tocar num gênero, na busca ou no próprio post, abre os posts marcados com ele; se o texto não é gênero, pessoa nem música, ao pesquisar aparecem os posts que contêm a palavra, sem diferenciar maiúsculas nem acentos);
- perfil no layout do Figma (banner, foto centralizada, números que abrem seguidores, seguindo e as músicas curtidas no Descobrir), com troca de foto e banner, menu de opções e Configurações (editar perfil, alterar @, redefinir senha, bloqueados, plataforma de streaming, idioma, sair, excluir conta); denunciar, bloquear e apagar post; o teclado empurra a tela para o campo de texto ficar logo acima dele;
- todas as telas no layout do Figma (Case Study UI/UX): logo, ícones e logos das plataformas exportados do arquivo (`apps/mobile/src/assets`), barra inferior com o botão "+" central, Home com a fila de quem você segue, Notificações, aba Músicas (curtidas e postadas), cartão de música por plataforma, botões do Descobrir, login, cadastro, código em 6 caixas e onboarding com pontos de progresso;
- perfis verificados com insígnia ao lado do nome; só a equipe verifica, direto no banco: `update public.profiles set verified = true where username = 'fulano';` (o app não consegue mudar essa coluna);
- notificações de curtidas, comentários, respostas e novos seguidores (aba Todas e Respostas, bolinha no sino), que chegam ao vivo pelo Supabase Realtime (canal privado de cada pessoa, sem puxar para atualizar), e aviso no celular (push) para quem ativar;
- Vibes (como os Stories): foto, vídeo de até 30 s, texto escrito direto na tela, card de música (com a prévia de 30 s tocando de fundo, quando a Apple Music ou a Deezer oferecem) ou post compartilhado, que somem em 24 horas; fila no topo da Home com anel de "não visto", tela cheia com avançar/voltar/pausar, quem viu, apagar e denunciar;
- anúncios no app do celular (AdMob): posts anunciados no feed da Início e vibes anunciadas entre uma pessoa e outra, com o selo "Patrocinado", nunca personalizados; desligados até a equipe ligar no banco;
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
| `npm run web:prod` | Gera o build de produção da web e serve em `localhost:8088`. Use para avaliar a velocidade: `npm run app` roda o modo de desenvolvimento (React com checagens extras, bundle sem minificar), que é bem mais lento que o app publicado |
| `npm run sync:shared` | Copia o indexador de `packages/core` para a Edge Function. Rode após mudar `packages/core/src/links` |

## Versões

O Soundhora usa 5 números: **GRANDE.MÉDIA.PEQUENA.MÊS.ANO** (ex.: `0.40.0.10.26`). O histórico de todas as versões está no [CHANGELOG.md](CHANGELOG.md).

| Número | Quando sobe | Exemplo |
| --- | --- | --- |
| GRANDE | mudança gigante: sistema novo, sair do beta para a versão final. **Fica 0 durante o beta.** | `0.7.3` → `1.0.0` |
| MÉDIA | funcionalidade nova (ou mudança grande numa que já existe) | `0.40.3` → `0.41.0` |
| PEQUENA | ajuste pequeno ou correção: fonte, botão, ícone, bug | `0.40.0` → `0.40.1` |
| MÊS.ANO | mês e ano da mudança, ano com 2 dígitos (automático) | `10.26` |

Subir um número zera os que vêm depois dele. Mudanças só de ferramentas (CI, testes, scripts de dados, configuração local) não mudam a versão.

**A versão sobe sozinha pela marca no commit.** Ao enviar para a `main`, o GitHub (`.github/workflows/versao.yml`) lê cada commit novo, sobe a versão, escreve no CHANGELOG.md, cria uma tag `vGRANDE.MÉDIA.PEQUENA.MÊS.ANO` no commit e envia um commit "Versão … [versao-auto]". Depois de enviar, rode `git pull` para trazer esse commit.

| Marca na mensagem do commit | Efeito |
| --- | --- |
| `[media]` (ou `[média]`) | funcionalidade nova |
| `[pequena]` | ajuste pequeno ou correção |
| `[grande]` | mudança gigante (só ao sair do beta) |
| `[nada]` | não muda a versão |
| sem marca | `[pequena]` se mexeu no app ou no servidor (`apps/mobile`, `packages/core`, `supabase`); senão `[nada]` |

Exemplo: `git commit -m "Mensagens diretas [media]"`. O MÊS.ANO é o da data do commit.

Para casos fora do comum dá para mudar à mão (marque o commit com `[nada]`, senão sobe de novo); o texto entre aspas entra no CHANGELOG.md:

```bash
npm run versao                                        # mostra a atual
npm run versao -- pequena "Ícone novo do sino"        # ajuste pequeno ou correção
npm run versao -- media "Mensagens diretas"           # funcionalidade nova
npm run versao -- grande --confirmar "Versão final"   # só ao sair do beta
```

O app mostra os 5 números, com "(beta)" enquanto a GRANDE for 0 (Configurações e Configurações › Sobre). As lojas só aceitam 3, então o `app.config.js` manda `GRANDE.MÉDIA.PEQUENA` como versão e calcula o número do build (`GRANDE×1.000.000 + MÉDIA×1.000 + PEQUENA`), que sobe sozinho a cada versão. Para mandar outro build da mesma versão às lojas, suba a PEQUENA.

## Decisões importantes

- **Sem reprodução de áudio.** Toda faixa abre no app ou site de origem. Isso evita licenças de música.
- **Login com @usuário sem expor e-mail.** O app manda o @ para a Edge Function `auth-username`, que acha o e-mail com a chave secreta (função `login_lookup`, fechada para o app) e devolve só a sessão. Tentativas ficam em `public.login_attempts`.
- **Segurança.** O app usa só a chave pública e só acessa o banco logado; RLS em todas as tabelas, limites de ações por pessoa, uploads conferidos pelos bytes e sessão criptografada no celular. Detalhes, limites e o que ligar no painel da nuvem: [docs/SEGURANCA.md](docs/SEGURANCA.md).
- **Idade mínima: 16 anos (MVP).** Está em `public.app_config` (`min_age`, padrão 16). Pelo ECA Digital (art. 24), contas de menores de 16 anos precisam de vínculo com um responsável; como esse fluxo não existe (`guardian_flow_enabled = false`), o cadastro só aceita 16 anos ou mais. Quem tem 16 ou 17 anos fica marcado como menor (`profile_private.is_minor`), o que importa para a publicidade (sem anúncios personalizados). Para mudar: `update public.app_config set min_age = 18;`
- **Catálogo de gêneros.** Os ~6 mil gêneros de `supabase/data/genres.json` entram pela migration `20261011000011_genre_catalog.sql`; os marcados com `featured` aparecem como atalhos no cadastro e no Editar perfil, e o resto se acha pela busca (RPC `search_genres`). Para mudar a lista, edite o JSON, rode `python3 scripts/genres-migration.py` e crie uma nova migration com o resultado (não altere uma migration já aplicada).
- **Busca com muitos dados.** Medida com 500 mil posts, 5 mil pessoas e 20 mil músicas: todas as buscas ficam abaixo de ~30 ms, menos frases com várias palavras comuns ("banda incrivel"), ~0,2 s. Posts pela palavra usam índice trigram sobre o texto sem acentos (`private.fold`) e pedem 3 letras; posts por gênero usam o índice GIN de `posts.genres`; a quantidade de posts de cada gênero fica em `genre_post_counts`, atualizada por trigger (não é contada na hora).
- **Curadoria do Descobrir.** Destaques ficam na tabela `public.featured` e aparecem primeiro no Descobrir, pelo gênero da pessoa. Para destacar uma música, poste o link no app (isso cria o cartão) e, como administrador, rode no SQL Editor:

  ```sql
  insert into public.featured (link_preview_id, genre, note_pt, note_en, position, ends_at)
  select id, 'shoegaze', 'O som que definiu o gênero.', 'The sound that defined the genre.', 1, now() + interval '14 days'
  from public.link_previews where url = 'https://open.spotify.com/track/<id>';
  ```

- **Selos do perfil.** Só para exibir (não dão vantagem nenhuma): ficam numa fileira entre a bio e as músicas favoritas, e tocar num selo mostra ele grande, com nome, data e descrição. O catálogo fica em `public.badges` e quem tem cada um em `public.user_badges`; o app só lê pelas funções `profile_badges` e as do painel. Em **Configurações › Painel admin › Selos** a equipe concede pelo @, tira de alguém, pausa e reabre a entrega, marca uma data para encerrar ou encerra na hora. **Selo encerrado não volta**: depois da data ninguém mais recebe, nem pelo painel nem por SQL (trigger), e a data não muda mais; quem já tem continua tendo. Selos `award = 'auto'` ficam reservados para regras do sistema no futuro (seguidores, reviews, dias ativos) e não são concedidos pelo painel. Para criar um selo novo, insira no banco e desenhe o ícone em `apps/mobile/src/assets/badgeIcons.ts` (sem desenho, aparece uma medalha):

  ```sql
  insert into public.badges (slug, icon, name_pt, name_en, description_pt, description_en, award, position)
  values ('beta', 'beta', 'Conta da beta', 'Beta account', 'Criou a conta na fase de testes.', 'Joined during the beta.', 'manual', 2);
  ```

- **Para você e recomendações.** O servidor monta o gosto de cada pessoa (gêneros, artistas e palavras-chave) com o que ela curte, posta, comenta, pesquisa e curte no Descobrir, as músicas favoritas, as reviews que escreveu/curtiu e os gêneros de quem ela segue (`private.taste` e `private.taste_terms`, na migration `20261024000001_recommendations.sql`). O feed soma também quantas pessoas que ela segue curtiram cada post. No meio do Para você entram faixas "Reviews que você pode curtir" (`feed_reviews_for_you`: reviews curtidas de álbuns do gosto da pessoa, uma por álbum). O Para você abre de novo sempre que a pessoa volta para o Início de outra aba, puxa para atualizar ou volta ao app depois de 10 min: o app manda os posts que ela já viu (guardados só no aparelho, ~300 por 3 dias), que vão para o fim, e cada abertura tem uma pequena variação de ordem (`20261025000001_feed_fresh.sql`). As pesquisas só são guardadas quando a pessoa pesquisa de fato (Enter, abrir um gênero, buscar nos posts): só o texto, por 90 dias, no máximo as 100 últimas; ela vê, apaga e desliga em Configurações › Privacidade › Histórico de pesquisas.

- **Apoio (Patreon), só na Web.** O botão "Apoie o Soundhora" aparece na coluna da direita do desktop, em Configurações › Sobre e no selo Contribuidor inicial, só na versão Web (nos apps nada fala de doação, pelas regras das lojas). O pagamento é todo no Patreon; a equipe confere lá e concede o selo pelo painel. O link vem do banco (só aceita `https://patreon.com/...`); sem link, o botão não aparece:

  ```sql
  update public.app_config set support_url = 'https://www.patreon.com/<sua-pagina>';
  ```

- **Anúncios (AdMob).** Só no app do celular (a web não tem anúncios). Um post anunciado a cada `ads_feed_every` posts no feed da Início (Para você e Seguindo) e uma vibe anunciada a cada `ads_vibes_every` pessoas na fila de vibes, nunca no fim da lista. Ficam **desligados** até a equipe ligar, sem publicar o app de novo:

  ```sql
  update public.app_config set ads_enabled = true;             -- liga (false desliga na hora)
  update public.app_config set ads_feed_every = 10, ads_vibes_every = 5;  -- frequência
  ```

  - **Nunca personalizados:** todo pedido sai com `requestNonPersonalizedAdsOnly`, e o app não manda nada da conta para o Google (nem @, e-mail, idade ou gostos). Por isso não há o aviso de rastreamento do iOS (ATT). Para quem tem 16 ou 17 anos (`is_minor`), o SDK também recebe `tagForUnderAgeOfConsent` e anúncios até a classificação T (ECA Digital, arts. 22 e 26). Código: `apps/mobile/src/lib/ads.ts` e `ads-sdk.ts`.
  - **Política do AdMob:** o anúncio tem o selo "Patrocinado" (18 px), visual diferente do post, o ícone AdChoices no canto e nenhum botão do app por cima. Na vibe anunciada, voltar, pular e fechar ficam fora da área do anúncio; sem anúncio em 5 s, a fila segue sozinha.
  - **IDs:** o `app.config.js` usa `ADMOB_ANDROID_APP_ID` e `ADMOB_IOS_APP_ID`, e o app usa `EXPO_PUBLIC_ADMOB_NATIVE_ANDROID` e `EXPO_PUBLIC_ADMOB_NATIVE_IOS` (unidades de anúncio **nativo**). Nenhum deles é segredo. Sem eles, o build usa os IDs de teste do Google; o app publicado sem as unidades não mostra anúncio nenhum. Precisa de development build (o AdMob não roda no Expo Go).
  - **Antes de ligar em produção:** acordo comercial com o Last.fm (os termos da API só permitem uso não comercial), conferir os termos da API da Deezer, criar o app e as duas unidades nativas no AdMob, publicar o `app-ads.txt` no site do app, preencher a "Segurança dos dados" do Google Play e os rótulos de privacidade da App Store (o SDK do Google coleta IP, identificador de publicidade e dados do aparelho), e, antes de abrir para a Europa, o formulário de consentimento (UMP).

- **Moderação.** Para virar administrador: `insert into public.admins (user_id) values ('<seu id>');` (só pelo banco). Aí aparece **Configurações › Painel admin**, com:
  - **Denúncias** agrupadas por conteúdo (as mais denunciadas primeiro): ver, remover o post/comentário/vibe, dispensar ou suspender o autor;
  - **Usuários**: busca por @ ou nome, filtros (verificados, comuns, admins, suspensos, com denúncias) e ordenação (relevância, mais/menos seguidores, A a Z, Z a A); verificar/tirar a insígnia, suspender por 7 dias, 30 dias ou sem data, e reativar. Conta suspensa continua vendo o app, mas o banco recusa posts, comentários, curtidas, seguir, vibes e denúncias, e ela vê um aviso na Início;
  - **Destaques** do Descobrir: colar o link da música, recado e ordem; remover.
  Cada ação fica registrada em `public.admin_actions` (quem fez, o quê, quando).

## Próximos passos do roteiro

Vínculo com responsável (hoje o cadastro é só para 16 anos ou mais).
