# BLOG — `blogs`

| | |
|---|---|
| Prod project | `avada-blog-app` |
| Base branch | `master` |
| Test | `npx jest --ci` at repo root (23 test files) |
| Functions gen | gen2 (`firebase-functions/v2`, `src/globalOptions.js`, `src/functions/http.js`) |
| Logger severity | **yes** — the only app with the fix. `errors` read is usable here. |

## Layout

```
packages/functions/src/
  index.js            exports
  functions/http.js   per-function runtime config (memory, timeoutSeconds, maxInstances, concurrency)
  routes/             api.js, proxy.js — route registration
  handlers/           api.js, apiSa.js, apiSaV2.js, apiV2.js, embed.js, cron/
  controllers/        request handlers
  services/           Shopify, AI, Firestore access
  helpers/logger.js   structured JSON logger, emits `severity`
  langgraph/          SSE generation
```

Deployed code is `packages/functions/lib/` — babel output, same relative paths, **different line
numbers**. Cite `src/`.

## Handler mounts

`/api/*` embedded app · `/apiSa/*` standalone (session auth) · `/apiv2/*` · `/proxy/*` App Proxy,
behind `verifyAppProxySignature`.

## Endpoint → handler map

Verified on `master` at `aad0e1df7` (2026-07-28). Names, not line numbers.

| Endpoint | Route file | Handler |
|---|---|---|
| `POST /api/gen-ai-suggested/:type` | `routes/api.js` | `controllers/genAIBlogController.js` `genSuggested` |
| `POST /apiv2/apiV2/langgraph/blog` | `routes/api.js` | `controllers/langGraphController.js` `generate` |
| `GET /proxy/tags` | `routes/proxy.js` | `controllers/tag.controller.js` `listStorefront` |
| `GET /proxy/posts-by-tag` | `routes/proxy.js` | `controllers/tag.controller.js` `getPostsByTag` |
| `PUT /api/article/:id` | `routes/api.js` | `controllers/articleController.js` `update` |
| `GET /api/get-list-ai-image` | `routes/api.js` | `controllers/genImageAIController.js` `get` |
| `GET /proxy/seoOn-preview` | `routes/proxy.js` | `controllers/appProxyController.js` `getPreview` |
| `POST /api/audit-agent/fix-issue` | `routes/api.js` | `controllers/auditAgentController.js` `fixAuditIssue` |

`/gen-ai-suggested/:type` dispatches by `:type`, so `recommendBlogPost`, `topic`, `mainSeoKeyword`
and `secondarySeoKeyword` are **one handler** — one cause, four symptoms.

## Quirks

- `langGraphController.generate` sets `ctx.status = 200` before streaming SSE. Once headers are
  written the response is already 200, so an HTTP **500** on that endpoint can only have come from
  the pre-stream section. Later failures can only be reported through the stream.
- `articleController.update` answers **200** with `{success: false}` on error, deliberately: the admin
  UI reads the `success` flag, and a 500 would move `usePutApi` onto its throw path
  (`packages/assets/src/helpers.js`) and change which toast the merchant sees. Do not "fix" this to
  a 500.
- 3 suites fail on untouched `master` from module resolution —
  `checkHeadersForReauthorization`, `parseHtmlToEditor.imageRoundtrip`, and one more. The smoke gate
  baselines them; do not chase them.
- `proxy` was capped at `maxInstances: 1` and raised to 10 (2026-07-30). That was hardening, not a
  fix: the `/proxy/*` 500s fail in 0.15–0.43s, which is immediate failure, not saturation.

## Incident history

Triaged 2026-07-30 over 257 request-log entries and 1592 application error lines. Applies patterns
P1 (54 failures), P2 (44), P3 (10 OOM), P4 (540.00s), P6 (47 UNAUTHENTICATED), P7.

Still open on this app:
- `/proxy/tags` (40) and `/proxy/posts-by-tag` (41) had **zero** application log lines — P5. The
  logging fix has since shipped, so the next occurrence should name the cause.
- `id.includes is not a function` via `articleController.list` → `shopifyGraphQlService`
  `getShopifyArticleById`, live on 2026-07-30. Same family as the `getPreview` fix, different caller.
