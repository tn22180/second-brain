fingerprint: 1g4bhm7
service: apigen2
message: HTTP 500 GET /api/competitors
app: SEO
repo: seo
date: 2026-08-22T07:15:35.463Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1g4bhm7

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded @avada/core setSession family (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / 3l54x4 / 1bd9e3m): the browser's `__session` cookie decrypted to the JSON primitive number `4`, and @avada/core 4.8.2's setSession does `cookies.shopifyTopLevelOAuth = ...` on that primitive, throwing `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '4'` inside verifyEmbedRequest before GET /api/competitors ever reaches its controller.

**Mechanism.** Shopify Mobile iOS (UA `Shopify Mobile/iOS/10.2633.0`) sent GET /api/competitors with a `__session` cookie (requestSize 2079). api.js mounts createAuthMiddleware() (packages/functions/src/handlers/api.js:65), which delegates to verifyEmbedRequest(verifyEmbedConfig) (packages/functions/src/middleware/auth.js:33). Inside @avada/core 4.8.2, verifyToken.js:119 calls setSession, and cookiesHelper.js:16 assigns `shopifyTopLevelOAuth` onto whatever decryptText('__session') returned. For this client that value decrypted to the JSON primitive `4`, so the assignment on a Number in strict mode throws — logged verbatim at 2026-08-21T07:32:17.762311Z as `[unhandledError] GET /api/competitors 500 Cannot create property 'shopifyTopLevelOAuth' on number '4'` with the stack landing at cookiesHelper.js:16:18. The 500 is emitted in 0.2645s, before any competitors code runs, so competitorsController.list (routes/api.js:442) is only the symptom's address, not the cause.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:65` — api.use(createAuthMiddleware()) — the middleware in whose stack the throw happens, ahead of every /api route
- `packages/functions/src/middleware/auth.js:33` — returns verifyEmbedRequest(verifyEmbedConfig)(ctx, next) — the exact call whose frame verifyToken.js:119 sits under in the stack
- `packages/functions/src/routes/api.js:442` — router.get('/competitors', competitorsController.list) — the alerted route, never reached; proves the fault is pre-controller
- `packages/functions/package.json:33` — "@avada/core": "4.8.2" — pins the version whose cookiesHelper.js:16 does the unguarded property write

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-21T07:32:17.000Z" AND timestamp<="2026-08-21T07:32:18.500Z" AND logName:"stderr"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-21T07:17:19.776Z" AND timestamp<="2026-08-21T07:47:19.776Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-21T07:17:19.776Z" AND timestamp<="2026-08-21T07:47:19.776Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
