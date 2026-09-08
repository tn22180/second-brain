fingerprint: a2foaq
service: api
message: [syncShopDataFromShopify] PnKC4q13qtMCeY1BDfEz HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:02:02.958Z
status: fix_disabled
attempt: 1

# BLOG · api · a2foaq

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin API brownouted HTTP 500 for this api instance during 08:35–08:46Z, and `void syncShopDataFromShopify(shop.id)` in afterLoginService is the one fire-and-forget call there with no `.catch()` while syncShopDataFromShopify rethrows — so the Shopify 500 became an unhandled promise rejection that the functions-framework turned into a 500 on the in-flight GET /api/shops.

**Mechanism.** afterLoginService (run by @avada/core's verifyEmbedRequest on every /api/* login request) fires `void syncShopDataFromShopify(shop.id)` at after-login.service.js:24 with no `.catch()` — its four siblings at lines 25, 26, 30 and 36 all attach one. syncShopDataFromShopify issues two bare `initShopify(shopFromDB).graphql(...)` calls (shop.service.js:83 and :95) through shopify-api-node's got client with no shopifyRetryGraphQL wrapper, so Shopify's HTTP 500 surfaces as `HTTPError: Response code 500` from got/as-promise/index.js:118, is logged at shop.service.js:130 and rethrown at shop.service.js:131 into a floating promise. Node has no handler, so the functions-framework's uncaught-rejection path answers the request that is still open. Two independent proofs: (1) each of the 3 request-log 500s ends exactly on a `[syncShopDataFromShopify]` rejection — 08:46:25.188+0.4576s = 08:46:25.646 == rejection at 08:46:25.646415Z (0 ms), 08:46:24.108+0.9251s = 08:46:25.033 vs rejection 08:46:25.047110Z (14 ms), 08:35:21.378+0.6829s = 08:35:22.061 == rejection 08:35:22.061141Z (0 ms); (2) the 08:35:22.774904Z rejection is followed 102 microseconds later, at 08:35:22.775006Z, by the framework line `Exception from a finished function: HTTPError: Response code 500`. All 3 500s are GET /api/shops — the route the embedded FE hits at login, i.e. the route that runs afterLoginService — and 0 of them produced an `[unhandledError]` line from Koa's createErrorHandler (errorHandler.js:17 logs every >=500 it catches; the window's only one is for GET /api/article/630397731103 at 08:35:26.584Z), so the 500 did not come out of the route stack at all. The alerted `[getMainThemeId]` 500s (4×) are a separate non-fatal symptom of the same upstream brownout: getMainThemeId rethrows at shopifyService.js:705 but its caller setupTemplates is `.catch()`-guarded at after-login.service.js:36; it did not retry because shopifyRetryError's code list (shopifyService.js:160) is [429,430,502,503] and excludes 500, whereas the GraphQL path's RETRYABLE_STATUSES (helpers/api.js:145) includes 500 — which is why shopifyRetryGraphQL logged 25 attempts while each REST call site logged one.

Confidence: `high`

## Code
- `packages/functions/src/services/after-login.service.js:24` — `void syncShopDataFromShopify(shop.id)` — only fire-and-forget call in afterLoginService with no `.catch()`; siblings at 25, 26, 30, 36 all have one
- `packages/functions/src/services/shop.service.js:131` — `throw e` after logging — turns the caller's `void` into an unhandled rejection
- `packages/functions/src/services/shop.service.js:130` — `logger.error('[syncShopDataFromShopify]', shopId, e)` — emits the exact alerted line, 4× in window
- `packages/functions/src/services/shop.service.js:83` — bare `initShopify(shopFromDB).graphql(...)` with no retry wrapper; got client, source of the `HTTPError: Response code 500` stack frame at got/as-promise/index.js:118
- `packages/functions/src/middleware/errorHandler.js:17` — logs `[unhandledError]` for every >=500 Koa catches — its absence for the 3 /api/shops 500s proves they bypassed the route stack
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError codes [429,430,502,503] exclude 500, so the REST path (getMainThemeId) never retried the brownout
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES includes 500 — GraphQL path did retry, explaining 25 shopifyRetryGraphQL lines vs 1 per REST call site
- `packages/functions/src/services/shopifyService.js:705` — getMainThemeId rethrows after logging the alerted `[getMainThemeId]` line — non-fatal, swallowed by the guarded setupTemplates caller

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[syncShopDataFromShopify]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND textPayload:"Exception from a finished function"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND httpRequest.status=500`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[unhandledError]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[getMainThemeId]"`

## Job
- analyze rounds: 1
- cost: $1.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
