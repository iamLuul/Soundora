# Segurança do Soundora

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
- **Dados privados.** A data de nascimento fica em `profile_private`, que só a própria pessoa lê. O e-mail fica em `auth.users`, que o app não alcança. O login com @usuário acha o e-mail no servidor e nunca devolve o e-mail ao app.
- **Tempo máximo por consulta:** 8 s para quem está logado e 3 s para visitantes. Cada pedido devolve no máximo 100 linhas (`max_rows`).

## Senhas e sessão

- **Hash, não texto.** O Supabase Auth guarda só o hash da senha (bcrypt) em `auth.users`. A senha nunca passa pelas tabelas do Soundora.
- **Regras da senha:** pelo menos 10 caracteres, com letras e números. Valem no app (`passwordSchema`) e no servidor (`config.toml`).
- **Troca de senha:** numa sessão com mais de 24 h, o Supabase exige um código enviado ao e-mail (`secure_password_change`).
- **Sessão no celular criptografada.** Os tokens são cifrados com AES-256. A chave de cada sessão fica no cofre do sistema (Keychain no iOS, Keystore no Android) e o disco guarda só o texto cifrado.
- **Na Web**, a sessão fica no `localStorage` do navegador. Não existe cofre do sistema lá.
- **Em trânsito:** tudo vai por HTTPS na nuvem. **Em repouso:** o Supabase criptografa o disco do banco e do Storage (AES-256).

## Arquivos (fotos de perfil)

O app não escreve no Storage. A foto passa pela Edge Function `upload-avatar`, que confere, nesta ordem:

1. Login, antes de ler qualquer byte do arquivo.
2. Limite de 10 trocas por hora.
3. Tamanho: até 1 MB. Um `Content-Length` maior é recusado na hora. Se o header faltar ou mentir, a leitura para assim que passa de 1 MB.
4. Tipo real pelos bytes (assinatura do arquivo). Aceita só JPEG, PNG e WebP. ZIP, SVG, GIF, HTML ou extensão trocada são recusados.
5. Dimensões lidas do cabeçalho, sem abrir a imagem: entre 32 e 2048 px de lado. Isso barra a bomba de pixels, um arquivo pequeno que vira uma imagem gigante na memória.
6. Nada escondido depois do fim da imagem, como um ZIP colado num JPEG. WebP animado também é recusado.

O nome do arquivo é gerado no servidor. O perfil guarda só o caminho (`avatars/{id}/avatar-123.jpg`), conferido por uma regra do banco, então ninguém aponta a própria foto para um site de fora.

O bucket `avatars` é público para leitura: a foto abre pela URL. Mas não tem policy de listagem nem de escrita, e o próprio bucket limita 1 MB e os tipos de imagem.

Não existe upload de ZIP ou de outros arquivos. Quando houver, cada tipo novo ganha a sua própria validação nesse mesmo modelo.

## Limite de requisições

| O quê | Limite | Onde |
| --- | --- | --- |
| Cadastro e login | 30 a cada 5 min por IP | Supabase Auth (`[auth.rate_limit]`) |
| Verificar código | 30 a cada 5 min por IP | Supabase Auth |
| Renovar sessão | 150 a cada 5 min por IP | Supabase Auth |
| E-mails para a mesma pessoa | 1 a cada 60 s | Supabase Auth (`max_frequency`) |
| Login com @usuário | 5 senhas ou códigos errados a cada 15 min e 3 envios de código a cada 10 min, por @ | Edge Function `auth-username` |
| Prévia de link | 30 por minuto e 500 por dia, por pessoa | Edge Function `link-preview` |
| Trocar foto | 10 por hora | Edge Function `upload-avatar` |
| Posts | 30 por hora | Banco (trigger) |
| Comentários | 60 a cada 10 min | Banco |
| Curtidas | 300 por hora | Banco |
| Seguir | 100 por hora | Banco |
| Denúncias | 20 por dia | Banco |
| Bloqueios | 50 por dia | Banco |
| Swipes no Descobrir | 600 por hora | Banco |
| Editar perfil | 30 por hora | Banco |

Os limites do banco ficam em `supabase/migrations/20261010000004_security.sql`. Para mudar um, crie uma migration nova que recrie o trigger com o número novo.

Corpo dos pedidos às Edge Functions: até 8 KB no `link-preview` e 4 KB no `auth-username`.

Contra DDoS de verdade, de muitos IPs ao mesmo tempo, quem segura é a rede do Supabase. As travas acima evitam que uma conta ou um script sozinho derrube o app ou gere custo.

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
   npx supabase functions deploy upload-avatar
   ```

## Próximos passos de segurança

- **CAPTCHA no cadastro** (Cloudflare Turnstile ou hCaptcha), quando abrir para o público.
- **Verificação em duas etapas (MFA)** opcional na conta.
- **Painel admin** com registro de quem moderou o quê.
