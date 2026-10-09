# Ambiente de desenvolvimento no Windows

Tudo o que é preciso para rodar o Soundora no seu PC, testar no celular e publicar.

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

Em outro terminal, suba a Edge Function do indexador de links (ela precisa de internet para ler as plataformas):

```powershell
npx supabase functions serve
```

## 4. App

```powershell
copy apps\mobile\.env.example apps\mobile\.env.local
```

Edite `apps\mobile\.env.local` e cole a publishable key. Para abrir no celular, troque `127.0.0.1` pelo IP do seu PC na rede (veja com `ipconfig`) e libere a porta 54321 no Firewall do Windows.

```powershell
npm run app
```

- Tecle **w** para abrir na Web.
- Leia o QR code com o **Expo Go** para abrir no celular.
- Tecle **a** para abrir no emulador Android.

Para entrar: digite um e-mail qualquer, abra `http://127.0.0.1:54324` e copie o código.

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
```

3. Em **Authentication → Email Templates → Magic Link**, cole o conteúdo de `supabase/templates/magic_link.html` (para mandar o código de 6 dígitos).
4. Em **Authentication → URL Configuration**, adicione `soundora://**` e a URL do site em Redirect URLs.
5. Rode o `seed.sql` no SQL Editor (gêneros).

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
