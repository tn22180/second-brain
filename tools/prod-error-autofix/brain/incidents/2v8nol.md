fingerprint: 2v8nol
service: apigen2
message: HTTP 500 GET /api/shopify/media
app: SEO
repo: seo
date: 2026-10-14T16:52:24.074Z
status: fix_disabled
attempt: 2

# SEO · apigen2 · 2v8nol

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A transient TLS socket reset (ECONNRESET) on the outbound Shopify Admin GraphQL POST to thedetailersemporium.myshopify.com is not retryable by `shopifyRetryGraphQL` (it only retries statusCode 429/502/503/520, and a socket error carries no status), and `getShopifyMedia` has no try/catch, so the rethrown error reaches the global errorHandler and answers HTTP 500 instead of the usual `{success:false}` 200.

**Mechanism.** FE audit page (referer https://seo.apps.avada.io/embed/seo-audit/seoOnPage/product/15421815881877) calls GET /api/shopify/media?productId=15421815881877 → routes/api.js:377 → shopifyController.getShopifyMedia (shopifyController.js:1106) → getProductMedia (shopifyGraphQlService.js:786) → handleGetProductByListId → makeGraphQlApi (helpers/api.js:43) → axios POST https://thedetailersemporium.myshopify.com/admin/api/2026-07/graphql.json (the exact url+query body are in the logged error's `config`). The socket is reset: stack is `at TLSWrap.onStreamRead (node:internal/stream_base_commons:216:20)`, `errno: -104, code: 'ECONNRESET', syscall: 'read'`. axios rejects with no `response`, so in shopifyRetryGraphQL (shopifyService.js:828) `statusCode = e.statusCode || e.response?.status` is `undefined`, `isRetryError` (`:830`) is false, and `:832` rethrows on attempt 0 — confirmed by zero `[shopifyRetryGraphQL]` log lines in the 16:48–16:50 window and by the request's total latency of 0.2759s (no backoff delay happened). getProductMedia logs `[getProductMedia] xkMhVc9yxAiT1PhDiaoV 15421815881877 read ECONNRESET` and rethrows (`:858-859`). getShopifyMedia has no try/catch around the call at shopifyController.js:1116 — unlike its sibling addMediaToProduct at `:1127` — so the error escapes to middleware/errorHandler.js:14, which sets status 500 and logs `[unhandledError] GET /api/shopify/media 500 read ECONNRESET`. The merchant's image/alt audit panel for that product fails outright.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:830` — isRetryError = [429, 502, 503, 520].includes(statusCode) — a socket-level error (ECONNRESET/ECONNABORTED/ETIMEDOUT) has no statusCode, so it is classified non-retryable
- `packages/functions/src/services/shopifyService.js:832` — rethrows immediately on attempt 0 for a non-retryable error; explains the 0.2759s latency and the absence of any [shopifyRetryGraphQL] retry log
- `packages/functions/src/helpers/api.js:54` — the only outbound handler — a bare axios POST with no socket-error handling; its rejection is what reaches shopifyRetryGraphQL
- `packages/functions/src/services/shopifyGraphQlService.js:858` — emits the exact prod line '[getProductMedia] <shopId> <productId> read ECONNRESET' then rethrows
- `packages/functions/src/controllers/shopifyController.js:1116` — getProductMedia is awaited with no try/catch in getShopifyMedia, so the rethrown error becomes an unhandled 500 instead of {success:false}
- `packages/functions/src/middleware/errorHandler.js:14` — status = err.status || 500 → the 500 in the alert, and the [unhandledError] line at :18

## Evidence
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-10-14T16:34:13.199Z" AND timestamp<="2026-10-14T17:04:13.199Z" AND logName:"stderr" AND "ECONNRESET"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-10-14T16:34:13.199Z" AND timestamp<="2026-10-14T17:04:13.199Z" AND logName:"stderr" AND "getProductMedia"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-10-14T16:34:13.199Z" AND timestamp<="2026-10-14T17:04:13.199Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/media"`

## Job
- analyze rounds: 1
- cost: $1.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
