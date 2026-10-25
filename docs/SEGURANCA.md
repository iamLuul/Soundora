# Segurança do Soundhora

O que protege cada parte, os limites em vigor e o que ligar no painel quando o projeto for para a nuvem.

## Chaves do Supabase

| Chave | Onde fica | O que pode |
| --- | --- | --- |
| Publishable (`sb_publishable_...`) | No app (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | Só o que as regras de RLS deixam. Sem login, nada |
| Secreta (`sb_secret_...`, antiga `service_role`) | Só nas Edge Functions, injetada pelo próprio Supabase | Ignora o RLS. Nunca vai para o app, para o Git nem para um `.env` com `EXPO_PUBLIC_` |

Três travas impedem o vazamento:

1. O app não abre se receber a chave secreta (`apps/mobile/src/lib/key-guard.ts`).
2. `npm run check:secrets` (roda no CI) falha se aparecer uma chave secreta ou um `.env` real em qualquer arquivo do Git, ou se o código do app citar a chave secreta.
3. `.env`, `.env*.local` e `supabase/.env` estão no `.gitignore`.

Se a chave secreta vazar: no painel, em **Project Settings → API Keys**, crie uma nova e apague a antiga. As Edge Functions passam a usar a nova sozinhas.

## Banco de dados

- **RLS em todas as tabelas.** Um teste (`tests/db/security.test.ts`) falha se alguma tabela do schema `public` ficar sem RLS, inclusive as que forem criadas no futuro.
- **Sem login, nada.** O papel `anon` não lê nenhuma tabela e não chama nenhuma função. Toda policy vale só para `authenticated`.
- **Novas tabelas e funções nascem fechadas.** Os privilégios padrão foram removidos, então cada uma precisa de `grant` explícito.
- **Sem TRUNCATE pelo app.** O TRUNCATE apaga a tabela inteira ignorando o RLS, e o Supabase o libera por padrão.
- **Funções com privilégio de dono** (`security definer`) fixam o `search_path`, o que impede sequestro de funções.
- **Prévia de 30 s das músicas** (Vibes): só endereços dos CDNs da Apple (`mzstatic.com`, `itunes.apple.com`) e da Deezer (`dzcdn.net`), conferidos na Edge Function e por uma regra do banco. O Soundhora não baixa nem guarda o áudio: o app toca direto da loja, que oferece essas prévias para divulgação, e o botão "Ouvir no ..." leva para a música completa.
- **Capas das músicas só de CDNs das plataformas** (Spotify, Apple, Deezer, YouTube, SoundCloud, TIDAL, Amazon, Bandcamp). Capa de outro domínio é descartada, para ninguém usar uma imagem para registrar o IP de quem vê o post. O indexador só busca páginas numa lista fechada de domínios (o Amazon Music tem um domínio por país, listado um a um).
- **Dados privados.** A data de nascimento fica em `profile_private`, que só a própria pessoa lê. O e-mail fica em `auth.users`, que o app não alcança. O login com @usuário acha o e-mail no servidor e nunca devolve o e-mail ao app.
- **Tempo máximo por consulta:** 8 s para quem está logado e 3 s para visitantes. Cada pedido devolve no máximo 100 linhas (`max_rows`).

- **Notificações** são criadas só por triggers do banco. As tabelas `notifications` e `push_tokens` são fechadas para o app (sem leitura nem escrita direta); o app só usa as funções `notifications_list`, `notifications_mark_read` e `push_token_register/unregister`, que sempre filtram pela pessoa logada. Quem está bloqueado não gera notificação, e as antigas somem da lista.
- **Push** sai do banco para o serviço da Expo (`https://exp.host`) com o `@` de quem agiu e, em comentários, o começo do texto, que já é público no post. Nunca vai e-mail, data de nascimento ou outro dado privado. Ao sair da conta, o aparelho é descadastrado.

## Senhas e sessão

- **Hash, não texto.** O Supabase Auth guarda só o hash da senha (bcrypt) em `auth.users`. A senha nunca passa pelas tabelas do Soundhora.
- **Regras da senha:** pelo menos 10 caracteres, com letras e números. Valem no app (`passwordSchema`) e no servidor (`config.toml`).
- **Troca de senha:** numa sessão com mais de 24 h, o Supabase exige um código enviado ao e-mail (`secure_password_change`).
- **Sessão no celular criptografada.** Os tokens são cifrados com AES-256. A chave de cada sessão fica no cofre do sistema (Keychain no iOS, Keystore no Android) e o disco guarda só o texto cifrado.
- **Na Web**, a sessão fica no `localStorage` do navegador. Não existe cofre do sistema lá.
- **Em trânsito:** tudo vai por HTTPS na nuvem. **Em repouso:** o Supabase criptografa o disco do banco e do Storage (AES-256).

## Arquivos (foto e banner do perfil)

Antes de enviar, o app converte a imagem no próprio aparelho (`apps/mobile/src/lib/image-convert.ts` e `.web.ts`): recorta no centro, deixa no tamanho exato (foto 512 × 512, banner 1500 × 500), recodifica como JPEG sem metadados (EXIF e GPS saem) e reduz a qualidade até caber no limite. Qualquer foto da galeria funciona, inclusive HEIC no celular e PNG de 50 MB, e só esse JPEG pequeno sai do aparelho. O servidor não confia nisso e confere tudo de novo.

O app não escreve no Storage. A foto e o banner passam pela Edge Function `profile-image`, que confere, nesta ordem:

1. Login, antes de ler qualquer byte do arquivo.
2. Limite de 10 trocas por hora.
3. Tamanho: até 1 MB a foto e 2 MB o banner. Um `Content-Length` maior é recusado na hora. Se o header faltar ou mentir, a leitura para assim que passa do limite.
4. Tipo real pelos bytes (assinatura do arquivo). Aceita só JPEG, PNG e WebP. ZIP, SVG, GIF, HTML ou extensão trocada são recusados.
5. Dimensões lidas do cabeçalho, sem abrir a imagem: entre 32 e 2048 px de lado na foto, e até 3000 px no banner. Isso barra a bomba de pixels, um arquivo pequeno que vira uma imagem gigante na memória.
6. Nada escondido depois do fim da imagem, como um ZIP colado num JPEG. WebP animado também é recusado.

O nome do arquivo é gerado no servidor. O perfil guarda só o caminho (`avatars/{id}/avatar-123.jpg`, `banners/{id}/banner-123.jpg`), conferido por uma regra do banco, então ninguém aponta a própria foto para um site de fora.

Os buckets `avatars` e `banners` são públicos para leitura: a imagem abre pela URL. Mas não têm policy de listagem nem de escrita, e cada bucket limita o tamanho (1 MB e 2 MB) e os tipos de imagem.

### Vibes e posts (foto e vídeo)

A mídia das Vibes e dos posts passa pela Edge Function `media-upload` (`?for=vibe|post`), com as mesmas etapas: login antes de ler o arquivo, 100 envios por dia, tamanho com corte no meio da leitura e conferência dos bytes.

- **Foto:** o app converte no aparelho (imagem inteira, até 1080 × 1920, JPEG sem metadados). O servidor aceita só JPEG de até 3 MB e 1080 × 1920 pixels.
- **Vídeo:** MP4 ou MOV de até 30 MB e 30 segundos. A função lê a estrutura do arquivo, sem decodificar: tipo real pela assinatura (`ftyp`), duração (`mvhd`), uma trilha de vídeo com tamanho até 4096 px, e as caixas cobrindo o arquivo exatamente (nada colado no fim, como um ZIP).
- **Posts:** até 4 fotos ou 1 vídeo. O arquivo vai para o bucket privado `post-media` e só abre com URL assinada para quem não tem bloqueio com o autor. `post_create` confere que cada arquivo é da pessoa, está no bucket e não foi usado em outro post.
- **Bucket privado `vibes`:** ninguém lista, ninguém grava pelo app. Só abre com URL assinada de 1 hora, e só se a vibe estiver ativa (24 h) e sem bloqueio entre quem vê e o autor (policy do Storage com `vibe_media_visible`).
- **Criar a vibe** (`vibe_create`) confere que o arquivo está na pasta da própria pessoa, existe no bucket e não foi usado em outra vibe. Post compartilhado de alguém com bloqueio é recusado.
- **Faxina:** a cada envio, a função apaga os arquivos da pessoa que venceram, foram apagados ou nunca viraram vibe (com 1 h de folga).
- Quem viu a vibe só aparece para o autor.

### Descobrir (sugestões)

- A Edge Function `discover` monta as sugestões no servidor: lê as curtidas e os gêneros da pessoa com a chave secreta, pede músicas parecidas e dos gêneros ao Last.fm e acha cada uma na Deezer. O app só recebe os cartões.
- O cache das buscas (`track_lookups`) é fechado para o app. Os cartões vão para `link_previews`, que já é pública, com capa, álbum, foto do artista e prévia só de hosts permitidos (CDNs da Deezer e da Apple).
- O link para a plataforma da pessoa só sai para cartões que existem, e passa pelas mesmas conferências do Em alta.
- Limite: 12 pilhas e 30 links por minuto por pessoa.

### Em alta (Last.fm)

- A chave do Last.fm fica só no servidor, como segredo da Edge Function `music-charts` (`LASTFM_API_KEY`). O app nunca a recebe nem fala com o Last.fm, a Deezer, o iTunes ou o song.link: pede o ranking e o link à função, que exige login.
- O ranking fica em cache no banco (`music_chart_snapshots`, atualizado a cada 3 h) e os links por plataforma também (`track_platform_links`, 30 dias, a partir do link da Deezer ou da Apple Music). As duas tabelas são fechadas para o app (RLS e `revoke all`); só a função, com a chave secreta, lê e grava.
- A função só procura links de músicas que estão no ranking, e cada link do song.link é conferido pelo indexador: só volta se for mesmo da plataforma pedida. Se não houver link exato, o app abre a busca da música na plataforma.
- A plataforma de streaming de cada pessoa fica em `profile_private`: só ela vê, e só troca pela função `set_streaming_platform`, que aceita apenas as plataformas da lista.

Não existe upload de ZIP ou de outros arquivos. Quando houver, cada tipo novo ganha a sua própria validação nesse mesmo modelo.

## Limite de requisições

| O quê | Limite | Onde |
| --- | --- | --- |
| Cadastro e login | 30 a cada 5 min por IP | Supabase Auth (`[auth.rate_limit]`) |
| Verificar código | 30 a cada 5 min por IP | Supabase Auth |
| Renovar sessão | 150 a cada 5 min por IP | Supabase Auth |
| E-mails para a mesma pessoa | 1 a cada 60 s | Supabase Auth (`max_frequency`) |
| Login com @usuário, por @ | 5 senhas erradas e 5 códigos errados a cada 15 min; 3 envios de código a cada 10 min e 6 por dia | Banco (`login_attempt_start`), chamado pela `auth-username` |
| Login com @usuário, por IP | 20 falhas a cada 15 min somando todos os @; 10 envios de código por hora | Banco (`login_attempt_start`) |
| Excluir conta | 3 por hora, com login feito nos últimos 30 min | Edge Function `delete-account` |
| Prévia de link | 30 por minuto e 500 por dia, por pessoa | Edge Function `link-preview` |
| Trocar foto | 10 por hora | Edge Function `profile-image` |
| Trocar banner | 10 por hora | Edge Function `profile-image` |
| Trocar @ | 1 a cada 30 dias | Banco (`change_username`) |
| Posts | 30 por hora | Banco (trigger) |
| Comentários | 60 a cada 10 min | Banco |
| Curtidas | 300 por hora | Banco |
| Curtidas em comentários | 300 por hora | Banco |
| Seguir | 100 por hora | Banco |
| Denúncias | 20 por dia | Banco |
| Bloqueios | 50 por dia | Banco |
| Swipes no Descobrir | 600 por hora | Banco |
| Editar perfil | 30 por hora | Banco |
| Vibes | 30 por dia | Banco (trigger) |
| Envio de foto/vídeo (vibes e posts) | 100 por dia | Edge Function `media-upload` |
| Em alta: ranking e links | 30 por minuto cada | Edge Function `music-charts` |
| Push recebidos | 30 por hora por pessoa (o resto fica só na lista do app) | Banco (`tg_push_notification`) |
| Cadastrar aparelho para push | 30 por hora; até 10 aparelhos por conta | Banco |

Os limites de ações ficam em `supabase/migrations/20261010000004_security.sql`, e os do login por @ em `20261010000006_review_fixes.sql`. As tentativas de login são reservadas **antes** de falar com o Supabase Auth, com trava no banco: pedidos simultâneos contam um por um (um teste dispara 50 de uma vez e só 5 passam). Para mudar um, crie uma migration nova que recrie o trigger com o número novo.

Corpo dos pedidos às Edge Functions: até 8 KB no `link-preview` e 4 KB no `auth-username`.

**IP no login por @.** Quem fala com o Supabase Auth é a Edge Function, então o Auth veria sempre o IP dela, e o limite por IP do Auth pegaria todo mundo junto. Por isso a função repassa o IP de quem pediu (`X-Forwarded-For`) e tem o próprio limite por IP no banco. **Confira na nuvem** antes de abrir ao público: entre por @ com 31 contas diferentes em 5 minutos, a partir de redes diferentes. Se a 31ª for barrada, o Auth não está lendo o IP repassado; aí, aumente o limite de logins em Authentication → Rate Limits.

Contra DDoS de verdade, de muitos IPs ao mesmo tempo, quem segura é a rede do Supabase. As travas acima evitam que uma conta ou um script sozinho derrube o app ou gere custo.

## Histórico de pesquisas

- **Só pelas funções.** `search_history` tem RLS ligado e nenhum acesso direto para `anon`/`authenticated`: grava só por `log_search` e lê/apaga só por `my_search_history`, `clear_search_history` e `set_search_history_enabled`, sempre da própria conta (`auth.uid()`).
- **Mínimo de dados.** Guarda só o termo (minúsculo, sem acento), nunca o que é digitado letra a letra, links ou buscas de pessoa com "@". 90 dias, no máximo 100 por pessoa; `log_search` apaga o excesso a cada gravação. Limite de 60 gravações por hora (passou disso, não guarda, sem erro).
- **Controle da pessoa.** Desligar apaga tudo e para de guardar; o gosto (`private.taste`) também ignora as pesquisas de quem desligou. Excluir a conta apaga junto (`on delete cascade`).

## Anúncios (AdMob)

O SDK do Google Mobile Ads é o único código de terceiros no app que fala com um servidor fora do Soundhora e da Supabase (só no celular; a web não tem anúncios).

- **Nada da conta sai do app para o Google.** O pedido de anúncio leva só a unidade de anúncio e as opções fixas de `ads-sdk.ts` (sem personalização, vídeo sem som). Nunca passe @, e-mail, idade, gênero, gostos ou conteúdo em `keywords`, `contentUrl` ou `customTargeting`.
- **O SDK coleta dados do aparelho** (IP, identificador de publicidade, modelo, interações com o anúncio). Isso precisa aparecer na "Segurança dos dados" do Google Play, nos rótulos de privacidade da App Store e na página Anúncios do app (já descrito lá).
- **Só depois do login.** O SDK só é iniciado com o app liberado e os anúncios ligados no banco (`delayAppMeasurementInit` no `app.config.js`): até lá ele não roda nem coleta nada.
- **Menores (16 e 17 anos):** `tagForUnderAgeOfConsent` e classificação máxima T, além de nunca personalizados.
- **Chave de emergência:** `update public.app_config set ads_enabled = false;` desliga os anúncios em todos os aparelhos: o app guarda a configuração por até 10 minutos e depois busca de novo (ao abrir a Início ou voltar para o app).

## Na nuvem: o que ligar no painel

O `config.toml` só vale para o Supabase local. Na nuvem, ajuste no painel (os nomes dos menus podem mudar um pouco entre versões do painel):

1. **Authentication → Sign In / Providers → Email:** ligar **Confirm email** e **Secure password change**. Deixar o tamanho do código em 6.
2. **Authentication**, nas configurações de senha do provedor Email: mínimo de 10 caracteres e exigir letras e números. Em **Attack Protection**, ligar **Leaked password protection**, que recusa senhas que já vazaram na internet (disponível nos planos pagos).
3. **Authentication → Email Templates:** colar `supabase/templates/magic_link.html` em **Magic Link** e **Confirm signup**, e `supabase/templates/reauthentication.html` em **Reauthentication**.
4. **Authentication → Rate Limits:** conferir os números da tabela acima.
5. **Project Settings → Data API:** **Max rows** = 100.
6. **Database → Settings:** ligar **Enforce SSL** e, em **Network restrictions**, liberar só os IPs que acessam o banco direto.
7. **Advisors → Security Advisor:** rodar e deixar sem alertas.
8. Publicar as funções:

   ```powershell
   npx supabase functions deploy link-preview
   npx supabase functions deploy auth-username --no-verify-jwt
   npx supabase functions deploy profile-image
   npx supabase functions deploy delete-account
   npx supabase functions deploy media-upload
   npx supabase functions deploy music-charts
   npx supabase functions deploy discover
   ```

## Web no computador (layout desktop)

- A versão desktop (barra lateral, tela no meio e coluna da direita) só muda o layout. Ela usa as mesmas consultas do app (RPCs e tabelas com RLS, sempre como `authenticated`) e não tem endpoint, chave nem permissão nova.
- A moldura do desktop só aparece depois do login e do onboarding. Na tela de entrada não há barra lateral, então nenhuma consulta sai sem sessão.
- A busca da coluna da direita só leva o termo para a aba Buscar (até 100 caracteres, pela URL). A busca em si é a mesma do celular, com os mesmos limites no servidor.
- Os links do rodapé são todos internos (termos, privacidade, cookies, anúncios e configurações).
- O HTML já vem com `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` e `referrer strict-origin-when-cross-origin`.
- Na hospedagem do site, configure também estes cabeçalhos, que não funcionam em `<meta>`:
  - `Content-Security-Policy: frame-ancestors 'none'`, para o site não poder ser aberto dentro de outro (clickjacking);
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
  - `X-Content-Type-Options: nosniff`;
  - `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`.

## Excluir conta

Em **Configurações → Excluir conta**, a pessoa digita o próprio @. A Edge Function `delete-account` confere o login, exige que ele tenha sido feito nos últimos 30 minutos, apaga a foto e o banner dos buckets e apaga o usuário do Supabase Auth. Perfil, posts, curtidas, comentários, seguidores, bloqueios e denúncias feitas saem junto, em cascata no banco (coberto por teste). É exigido pela App Store para apps com cadastro e é um direito pela LGPD.

## Próximos passos de segurança

- **CAPTCHA no cadastro** (Cloudflare Turnstile ou hCaptcha), quando abrir para o público.
- **Verificação em duas etapas (MFA)** opcional na conta.
- **Painel admin** com registro de quem moderou o quê.
