# Ambiente de desenvolvimento no Windows

Tudo o que é preciso para rodar o Soundhora no seu PC, testar no celular e publicar.

## 1. Programas

| Programa | Para quê | Como instalar |
| --- | --- | --- |
| Node.js 22 LTS ou mais novo | Rodar o app, os testes e as ferramentas | `winget install OpenJS.NodeJS.LTS` |
| Git | Versionar e enviar ao GitHub | `winget install Git.Git` |
| VS Code | Editor | `winget install Microsoft.VisualStudioCode` |
| Docker Desktop | Rodar o Supabase local (`supabase start`) | `winget install Docker.DockerDesktop` (ative o WSL 2 quando pedir) |
| Expo Go (celular) | Abrir o app no seu Android ou iPhone sem compilar | Play Store / App Store |
| Android Studio (opcional) | Emulador Android e testes Maestro | `winget install Google.AndroidStudio` |
| Maestro (opcional) | Testes ponta a ponta | Veja https://docs.maestro.dev (no Windows, via WSL) |

A CLI do Supabase, o Deno e o EAS já vêm pelo `npm install` ou rodam com `npx`. Não instale nada global.

Extensões do VS Code recomendadas: **Expo Tools**, **ESLint**, **Deno** (só para a pasta `supabase/functions`), **PostgreSQL**.

## 2. Primeira vez

```powershell
git clone https://github.com/<seu-usuario>/soundora.git
cd soundora
npm install
```

## 3. Backend local (Supabase)

Com o Docker Desktop aberto:

```powershell
npx supabase start
```

Na primeira vez demora alguns minutos. No fim, o terminal mostra:

- **API URL**: `http://127.0.0.1:54321`
- **Publishable key**: a chave pública que vai no app
- **Studio**: `http://127.0.0.1:54323` (painel do banco)
- **Mailpit/Inbucket**: `http://127.0.0.1:54324` (os e-mails com o código de login chegam aqui)

As migrations e o `seed.sql` são aplicados sozinhos. Para recriar o banco do zero: `npx supabase db reset`.

Em outro terminal, suba as Edge Functions: o indexador de links (precisa de internet para ler as plataformas), o login com @usuário e a troca de foto e banner:

```powershell
npx supabase functions serve
```

A aba **Em alta** (as mais tocadas no mundo) e as sugestões do **Descobrir** usam a API do Last.fm, que precisa de uma chave gratuita:

1. Crie a chave em https://www.last.fm/api/account/create (o que importa é a **API key**; o "shared secret" não é usado).
2. Copie `supabase/functions/.env.example` para `supabase/functions/.env` e cole a chave em `LASTFM_API_KEY=`. Esse arquivo nunca sobe para o GitHub.
3. Reinicie o `npx supabase functions serve`.

Sem a chave, o resto do app funciona; só a aba Em alta mostra que o ranking não carregou.

### Dados de teste (opcional)

Para o app não ficar vazio nos testes, com o Supabase e as functions rodando:

```powershell
npm run demo
```

Cria 6 contas de teste (@marina.sons, @caio.beats, @lua.indie, @dj.tavares, @bia.ramos, @theo.rock) com foto, banner, posts com música e foto, comentários, respostas, curtidas e vibes. As suas contas passam a seguir as de teste e ganham seguidores e notificações. Para entrar como uma delas: `marina_sons@demo.soundora.dev` (ou `@marina.sons`), senha `Soundhora2026demo`.

- Rodar de novo apaga e recria só as contas de teste (as vibes somem em 24 h; é assim que se renova).
- `npm run demo -- --remove` apaga as contas de teste e tudo delas.
- O script só roda contra o Supabase local: recusa qualquer endereço que não seja o do seu PC.

## 4. App

```powershell
copy apps\mobile\.env.example apps\mobile\.env.local
```

Edite `apps\mobile\.env.local` e cole a publishable key. Pode deixar `127.0.0.1`: no celular (Expo Go), o app troca sozinho pelo IP do seu PC, o mesmo do QR code. O celular precisa estar no mesmo Wi-Fi do PC, e a porta 54321 precisa estar liberada no Firewall do Windows:

```powershell
# PowerShell como administrador
New-NetFirewallRule -DisplayName "Supabase local" -Direction Inbound -Protocol TCP -LocalPort 54321 -Action Allow
```

```powershell
npm run app
```

- Tecle **w** para abrir na Web.
- Leia o QR code com o **Expo Go** para abrir no celular.
- Tecle **a** para abrir no emulador Android.

Para criar conta: toque em **Criar conta**, digite um e-mail qualquer, a senha duas vezes, abra `http://127.0.0.1:54324` e copie o código de 6 dígitos.

Para entrar depois: em **Entrar**, use o e-mail **ou** o @usuário, com a senha **ou** com um código por e-mail. Com @usuário, quem acha o e-mail da conta é a Edge Function `auth-username`, no servidor; o app nunca recebe o e-mail (no código, mostra só uma dica como `ra•••@gmail.com`). Cada @ aceita no máximo 5 senhas ou códigos errados a cada 15 minutos e 3 envios de código a cada 10 minutos.

## 5. Login com Google e Apple (opcional no começo)

1. **Google**: crie credenciais OAuth no Google Cloud Console (tipo "Aplicativo da Web"). URL de redirecionamento: `http://127.0.0.1:54321/auth/v1/callback` (local) e `https://<projeto>.supabase.co/auth/v1/callback` (nuvem).
2. **Apple**: precisa do Apple Developer Program. Crie um Services ID com "Sign in with Apple" e a mesma URL de callback.
3. Copie `supabase/.env.example` para `supabase/.env`, preencha as chaves e mude `enabled = true` em `supabase/config.toml`.

## 6. Supabase na nuvem

1. Crie o projeto em https://supabase.com (região São Paulo).
2. Ligue o repositório ao projeto e envie o banco e a função:

```powershell
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
npx supabase functions deploy link-preview
npx supabase functions deploy auth-username --no-verify-jwt
npx supabase functions deploy profile-image
npx supabase functions deploy delete-account
npx supabase functions deploy media-upload
npx supabase functions deploy music-charts
npx supabase functions deploy discover
npx supabase secrets set LASTFM_API_KEY=<sua-chave-do-last.fm>
```

3. Em **Authentication → Email Templates**, cole o conteúdo de `supabase/templates/magic_link.html` em **Magic Link** e em **Confirm signup** (os dois mandam o código de 6 dígitos em vez de link), e `supabase/templates/reauthentication.html` em **Reauthentication**.
4. Siga a lista de segurança da nuvem em [SEGURANCA.md](SEGURANCA.md#na-nuvem-o-que-ligar-no-painel) (confirmação de e-mail, regras de senha, limites, SSL).
5. Em **Authentication → URL Configuration**, adicione `soundhora://**` e a URL do site em Redirect URLs.
6. Rode o `seed.sql` no SQL Editor (gêneros).

## 7. Builds e lojas (EAS)

```powershell
cd apps\mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<projeto>.supabase.co --environment preview --environment production
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <chave> --environment preview --environment production
npx eas-cli@latest build --profile preview --platform android   # APK para testar
npx eas-cli@latest build --profile production --platform all     # lojas
```

Builds de iOS rodam na nuvem do EAS, então não é preciso ter um Mac.

### Notificações no celular (push)

As notificações aparecem sempre na tela de Notificações (sino). O aviso no celular, com o app fechado, só funciona no **app instalado** (build do EAS): o Expo Go, os emuladores e a Web não recebem push.

1. `npx eas-cli@latest init` grava o `projectId` no `app.json`. Sem ele, a opção aparece desativada.
2. Android: no painel do Firebase, crie um projeto, baixe a chave de conta de serviço (FCM V1) e envie com `npx eas-cli@latest credentials` → Android → Push Notifications.
3. iOS: o próprio `eas build` cria a chave de push da Apple (precisa da conta de desenvolvedor).
4. No app instalado: **Configurações → Notificações no celular**, ou o cartão no topo das Notificações.

O banco envia os avisos pelo serviço da Expo usando a extensão `pg_net`, que o Supabase já tem. Nada a configurar no servidor.

## 8. Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| Web: `Worker chunk not found ... expo-sqlite\web\worker.ts` | Código antigo ainda rodando (antes do commit `81b0a17`) | `git pull`, feche o Expo (Ctrl+C) e abra de novo com `npm run app -- --clear` |
| Celular: erro ao tocar em "Receber código", com "Não foi possível conectar ao servidor" | O celular não alcança o Supabase do PC | Mesmo Wi-Fi, porta 54321 liberada no firewall e `npx supabase start` rodando. A mensagem de erro mostra o endereço que o app tentou |
| O Docker ainda mostra o banco como `supabase_db_soundora` | O Supabase nomeia containers e volumes pelo `project_id` do `supabase/config.toml` (agora `soundhora`) | `npx supabase stop --project-id soundora`, depois `npx supabase start` (cria `supabase_db_soundhora`, já com as migrations). O volume antigo continua no Docker: apague com `docker volume rm supabase_db_soundora` (e `supabase_storage_soundora`) quando não precisar mais dos dados |
| Console: `WebCrypto API is not supported. Code challenge method will default to use plain` | Aviso do Supabase no Android/iOS (o celular não tem WebCrypto) | Só um aviso, não é o erro. Não afeta o login por código |
| Postar: erro ao gerar a prévia do link | A Edge Function não está rodando, ou não foi publicada na nuvem | Local: deixe `npx supabase functions serve` aberto num terminal. Nuvem: `npx supabase functions deploy link-preview`. Em desenvolvimento, a tela mostra o código HTTP e o motivo logo abaixo da mensagem |
| O e-mail de cadastro chega com um link em vez do código | Na nuvem, o modelo **Confirm signup** ainda é o padrão | Cole `supabase/templates/magic_link.html` em Authentication → Email Templates → Confirm signup |
| "Entrar com @usuário não está disponível agora" | A Edge Function `auth-username` não está rodando ou não foi publicada | Local: `npx supabase functions serve`. Nuvem: `npx supabase functions deploy auth-username --no-verify-jwt`. Entrar com e-mail continua funcionando |
| "Não achamos uma conta..." ao pedir código | Login por código não cria conta | Use a aba **Criar conta** |
| "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY recebeu a chave SECRETA" | A chave secreta foi colada no `.env.local` do app | Troque pela publishable key (`sb_publishable_...`). A secreta nunca vai no app |
| Trocar foto ou banner dá erro | A Edge Function `profile-image` não está rodando | Deixe `npx supabase functions serve` aberto |
| Depois de atualizar, o app pediu login de novo | A sessão no celular passou a ser criptografada; a antiga é descartada | Normal, só na primeira vez |
| `Incompatible React versions` | `node_modules` antigo | Apague `node_modules` e rode `npm ci` |
| "Notificações no celular" desativada nas Configurações | Expo Go, emulador, Web ou falta o `projectId` do EAS | Normal em desenvolvimento. Veja "Notificações no celular (push)" acima |

Em desenvolvimento, a tela de login mostra o erro técnico e o endereço do Supabase abaixo da mensagem. O terminal do Expo também mostra a linha `[Soundhora] Supabase em ...` ao abrir o app.
