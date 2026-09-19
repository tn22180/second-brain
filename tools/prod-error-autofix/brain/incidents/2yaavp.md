fingerprint: 2yaavp
service: apigen2
message: HTTP 500 GET /api/analysis/collection/600783225167
app: SEO
repo: seo
date: 2026-09-19T09:39:39.612Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 2yaavp

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded @avada/core setSession family (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / 1g4bhm7 / 2exedr / mne0rk / jjeu1l). The browser sent a `__session` cookie whose AES/JSON decryption gives back the primitive number 7, not an object. @avada/core 4.8.2's setSession then runs `cookies['shopifyTopLevelOAuth'] = value` on that number, throws a TypeError, and the request fails with 500 before it reaches the analysis controller.

**Mechanism.** 1) At 2026-09-19T09:37:33.068Z, shop stiledicasa.myshopify.com sent GET /api/analysis/collection/600783225167 to apigen2 (referer /embed/analysis/collection, locale=it). It came back 500 after 0.331s. 2) Every /api request goes through `shopifyCharge({... verifyMiddleware: verifyEmbedRequest(verifyEmbedConfig)})` (packages/functions/src/handlers/api.js:48-61) before any route runs. 3) Inside that middleware, verifyToken.js:119 calls setSession(ctx, …, 'shopifyTopLevelOAuth'). In node_modules/@avada/core/build/helpers/cookiesHelper.js:15-16, setSession does `var cookies = decryptText(ctx.cookies.get('__session'), …); cookies[key] = value;` and never checks that `cookies` is an object. 4) For this browser's cookie, decryptText returned the number 7, so the assignment throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '7'`. The stack is logged at 09:37:33.401Z as `[unhandledError] GET /api/analysis/collection/600783225167 500` on instance …0107909e. 5) The error handler turns this into a 500. No analysis code ran, and the upsertTranslationSubcollection lines at 09:37:58 are a later request that succeeded. On apigen2 the same TypeError appeared 7 times from 2026-09-12 to 2026-09-19, with different primitive numbers ('3', '4', '7') and different endpoints (e.g. POST /api/track-event). That spread across endpoints points at the shared middleware, not at any route.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — verifyEmbedRequest(verifyEmbedConfig) is passed as shopifyCharge's verifyMiddleware. This is the @avada/core path that calls setSession on every /api request, before routing.
- `packages/functions/src/handlers/api.js:42` — createErrorHandler turns the uncaught TypeError from the middleware into the `[unhandledError] … 500` line and the 500 response.
- `packages/functions/src/middleware/auth.js:33` — A second verifyEmbedRequest entry point that runs the same library setSession path.

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND logName:"stderr" AND textPayload:"Cannot create property 'shopifyTopLevelOAuth' on number '7'" AND timestamp>="2026-09-19T09:22:58.092Z" AND timestamp<="2026-09-19T09:52:58.092Z"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND httpRequest.status>=500 AND timestamp>="2026-09-19T09:22:58.092Z" AND timestamp<="2026-09-19T09:52:58.092Z"`
- 7 matching entries: `resource.labels.service_name="apigen2" AND logName:"stderr" AND textPayload:"[unhandledError]" AND textPayload:"Cannot create property" AND timestamp>="2026-09-12T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
