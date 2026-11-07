# Arquitetura do Soundhora

Como o app é organizado, onde cada coisa fica, como encaixar uma funcionalidade nova e as
decisões de arquitetura (com o que ainda falta fazer). Revisão de 07/11/2026.

## Camadas

```
 Tela (src/app/**)                     rota do Expo Router: monta componentes, não fala com o banco
   │
 Componentes (src/components/**)       visual e interação; dados vêm dos hooks
   │
 Hooks de dados (src/lib/queries.ts,   React Query: cache, páginas, curtir com resposta imediata
   lib/reviews.ts, lib/admin.ts)
   │      └─ chaves do cache: src/lib/query-keys.ts (só lá)
   │
 API (src/lib/api/<assunto>.ts)        uma função por ação; chama o Supabase; telas importam de `lib/api`
   │
 ──────────────────────────── rede ──────────────────────────────────────────────────────────
   │
 Funções do banco (supabase/migrations) RPC `security definer`: conferem login (auth.uid()),
   │                                    papel, bloqueios, limites (private.hit) e só então leem/gravam
 Edge Functions (supabase/functions)   o que o banco não faz: arquivos (fotos, vídeos), APIs de fora
                                        (Spotify, Deezer, Last.fm), contas; chave secreta só aqui
```

Regras que não mudam:

- **O app nunca é confiável.** Tabelas fechadas para escrita (RLS); toda escrita passa por uma
  função que confere quem pede. A chave secreta (service_role) existe só nas Edge Functions.
- **Validar duas vezes.** O app valida para dar resposta rápida (`packages/core`); o banco ou a
  Edge Function valida de novo e é quem decide.
- **Código compartilhado entre app e servidor** fica em `packages/core` e é copiado para as Edge
  Functions com `npm run sync:shared` (o Deno não lê o workspace do npm).

## Onde fica cada coisa

| Preciso de… | Lugar |
| --- | --- |
| Chamar o banco ou uma Edge Function | `src/lib/api/<assunto>.ts` (posts, profile, social, settings, music, reviews, notifications, vibes, messages, communities, media, config) |
| Peças comuns da API (usuário logado, chamar Edge Function e ler o erro) | `src/lib/api/client.ts` |
| Cache, lista com páginas, atualizar depois de mudar algo | `src/lib/queries.ts` (hooks) e `src/lib/query-keys.ts` (chaves) |
| Saber se o tempo real está conectado | `src/lib/live-status.ts` |
| Guardar algo no aparelho | `src/lib/consent.ts` (`storedGet`/`storedSet` com a categoria; item novo entra em `STORED_ITEMS`) |
| Texto na tela | `src/locales/pt-BR.json` e `en.json` (sempre os dois) |
| Cores, espaços, vidro | `src/theme.ts` |
| HTTP nas Edge Functions (CORS, JSON, erro) | `supabase/functions/_shared/http.ts` |

## Encaixar uma funcionalidade nova

1. **Banco:** migration nova em `supabase/migrations/AAAAMMDD00000N_nome.sql`. Tabela com RLS
   ligado e escrita revogada do app; funções `security definer set search_path = ''` que
   conferem `auth.uid()`, o papel e o limite (`private.hit`). `revoke ... from public, anon` e
   `grant ... to authenticated` em cada função.
2. **Teste do banco:** `tests/db/<nome>.test.ts` (o que pode, o que não pode, quem não está logado).
3. **Edge Function** (só se precisar de arquivo, API de fora ou chave secreta): pasta nova em
   `supabase/functions/` com `index.ts` (liga as dependências reais) e `handler.ts` (a lógica,
   recebendo as dependências, para testar sem rede) e `handler.test.ts`. Os scripts
   `typecheck:functions` e `test:functions` acham a pasta sozinhos.
4. **API do app:** `src/lib/api/<assunto>.ts` (novo arquivo para assunto novo, e uma linha em
   `src/lib/api/index.ts`).
5. **Cache:** chave em `src/lib/query-keys.ts`; hook em `src/lib/queries.ts` se a tela precisar.
   O ESLint recusa chave escrita à mão.
6. **Tela:** `src/app/...` e componentes; textos nos dois idiomas; teste em `__tests__/`.
7. **Conferir:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`,
   `npm run test:functions`.

## Decisões (ADRs)

### ADR-001: API do app dividida por assunto — Aceita

**Contexto.** `src/lib/api.ts` tinha 1679 linhas com 200 funções e tipos de todos os assuntos.
Toda funcionalidade nova mexia no mesmo arquivo; achar algo dependia de busca.

**Decisão.** Um arquivo por assunto em `src/lib/api/`, e `src/lib/api/index.ts` reexportando
tudo. As telas continuam importando de `lib/api` (nenhuma tela mudou).

**Consequências.** Assunto novo = arquivo novo. Nos testes, `jest.spyOn` precisa apontar para o
arquivo do assunto (reexportação não deixa espionar); `jest.mock('../src/lib/api', ...)`
continua funcionando.

### ADR-002: Chaves do cache num lugar só — Aceita

**Contexto.** As chaves do React Query estavam em 4 objetos diferentes e em dezenas de arrays
escritos à mão. Um erro de digitação faz a tela não atualizar, sem aviso: era o caso de
`['following']`, invalidada em dois lugares sem nenhuma consulta com essa chave.

**Decisão.** Todas em `src/lib/query-keys.ts`; regra do ESLint (`no-restricted-syntax`) recusa
array escrito à mão em `queryKey`, `setQueryData` e afins.

**Consequências.** Fácil ver o que uma ação atualiza e renomear com segurança. Chaves que
começam igual se atualizam juntas (ex.: tudo de comunidades começa com `'communities'`).

### ADR-003: Tempo real em vez de consulta periódica — Aceita

**Contexto.** O sino consultava o servidor a cada 30 s e as mensagens a cada 1 min, mesmo com o
canal ao vivo (Supabase Realtime) já entregando os avisos. Por pessoa com o app aberto: ~3
consultas por minuto à toa.

**Decisão.** `src/lib/live-status.ts` guarda se o canal está conectado; as consultas periódicas
só rodam sem ele (conectando, caiu, sem internet). Ao reconectar, o app busca o que perdeu.

**Consequências.** Menos carga no banco à medida que cresce. Funcionalidade ao vivo nova deve
seguir o mesmo padrão: aviso pelo canal da pessoa, consulta periódica só de reserva.

### ADR-004: Edge Functions com lógica testável e peças comuns — Aceita

**Contexto.** As 8 funções já separavam `index.ts` (dependências reais) de `handler.ts`
(lógica testável). Mas CORS, resposta JSON e texto de erro estavam copiados em 7 delas, e os
scripts de conferir e testar listavam cada função à mão (`music-charts-daily` tinha ficado de
fora da conferência de tipos).

**Decisão.** `supabase/functions/_shared/http.ts` com as peças comuns; `scripts/functions.mjs`
acha as funções pela pasta.

### ADR-005: Uma regra só de "posso ver este autor" no banco — Proposta

**Contexto.** Bloqueio, conta suspensa/oculta e silenciados são filtrados em cada feed e busca
(`is_blocked_with` aparece 96 vezes nas migrations, `content_hidden` 64). Quando "silenciar"
chegou, foi preciso reescrever 6 funções inteiras (`20261102000003_mute_users.sql`, 628 linhas).
O próximo filtro (ex.: palavras silenciadas) vai repetir isso.

**Opções.**

| | A: função `private.author_visible(author)` | B: deixar como está |
| --- | --- | --- |
| Complexidade | Média (reescrever os feeds uma vez) | Nenhuma agora |
| Desempenho | Precisa de cuidado: a função deve ser `sql stable` (o Postgres a "embute" na consulta) e ser medida com `npm run load` | Já medido |
| Filtro novo | Muda 1 função | Muda todos os feeds |

**Recomendação.** A, feita de uma vez quando o próximo filtro for pedido, com os testes de
`tests/db` (feed, blocks, mute, private) como rede de segurança e comparação do
`EXPLAIN ANALYZE` antes/depois com a carga do `npm run load`.

### ADR-006: Tipos gerados do banco — Proposta

**Contexto.** O app chama ~90 funções do banco pelo nome, com parâmetros e retorno digitados à
mão (`as Tipo`). Renomear um parâmetro numa migration quebra só em produção.

**Decisão proposta.** `npx supabase gen types typescript --local > packages/core/src/database.ts`
(precisa do Supabase local rodando) e `createClient<Database>()`. Começar tipando o cliente e
corrigir os erros que aparecerem; os `as Tipo` saem aos poucos.

### ADR-007: Retrato do esquema atual — Proposta

**Contexto.** Com 62 migrations, a versão atual de uma função é a da última migration que a
recria (`feed_for_you` foi recriada 5 vezes). Para ler o código atual é preciso caçar.

**Decisão proposta.** `npx supabase db dump --local --schema public,private -f supabase/schema.sql`
depois de cada migration nova, versionado (só para leitura: quem manda continuam as
migrations).

## Dívidas restantes (por prioridade)

1. **ADR-005** (regra única de visibilidade) — quando vier o próximo filtro de feed.
2. **ADR-006** (tipos gerados) — evita erros que só aparecem em produção.
3. **Telas grandes demais:** `PostMedia.tsx` (741 linhas), `compose.tsx` (731), `vibes/[author].tsx`
   (683), `admin.tsx` (656). Separar em componentes quando forem mexidas de novo (não vale
   refatorar sem motivo: o risco é maior que o ganho).
4. **`setMyGenres`** lê e grava em 3 passos pelo app; uma função no banco faria em um só
   (atômico, sem estado intermediário se a rede cair no meio).
5. **ADR-007** (retrato do esquema).
6. **Estilo de código misto:** alguns arquivos (`ui.tsx`, `compose.tsx`, `_layout.tsx`,
   `queries.ts`...) não seguem o Prettier do resto. Formatar todos de uma vez, num commit só de
   formatação, para não misturar com mudança de lógica.
