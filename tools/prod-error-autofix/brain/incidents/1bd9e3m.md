fingerprint: 1bd9e3m
service: apigen2
message: HTTP 500 GET /api/shop/appStatus
app: SEO
repo: seo
date: 2026-08-22T04:29:42.840Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1bd9e3m

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded @avada/core setSession family (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l): the browser presented a `__session` cookie that decrypts to the JSON primitive number `9`, and @avada/core 4.8.2's setSession does `cookies[key] = value` on that primitive, throwing `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '9'` before any route code runs.

**Mechanism.** GET /api/shop/appStatus at 2026-08-20T09:23:58.670Z (instance 00a41e8c1d0646, revision apigen2-00344-non, 0.27s) hit the auth chain: packages/functions/src/handlers/api.js:59 passes `verifyEmbedRequest(verifyEmbedConfig)` as shopifyCharge's verifyMiddleware, and packages/functions/src/middleware/auth.js:33 re-invokes the same middleware for unauthenticated requests. Inside @avada/core, verifyToken.js:119 calls setSession → cookiesHelper.js:16, which is `var cookies = decryptText(ctx.cookies.get('__session'), ...); cookies[key] = value;`. decryptText JSON.parses the decrypted payload; for this client it yielded the primitive `9`, so assigning `shopifyTopLevelOAuth` onto a Number in strict mode throws. The throw escapes the middleware, Koa's error handler answers 500, and packages/functions/src/handlers/api.js:79 logs `[api] undefined GET /api/shop/appStatus 500` — shopID is `undefined` because auth never completed. The path is incidental: the second occurrence the same day was GET /api/analysis/product/7980952977462 with the identical message.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — verifyMiddleware: verifyEmbedRequest(verifyEmbedConfig) — the entry into @avada/core's verifyToken → setSession chain that threw
- `packages/functions/src/middleware/auth.js:33` — createAuthMiddleware re-runs verifyEmbedRequest for every request without ctx.state.user, so a poisoned __session fails every route
- `packages/functions/src/routes/api.js:70` — the alerted route GET /api/shop/appStatus — never reached; the middleware threw first
- `packages/functions/src/handlers/api.js:79` — api.on('error') emitted the '[api] undefined GET /api/shop/appStatus 500' line that carries the TypeError

## Evidence
- 5 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-20T09:23:40Z" AND timestamp<="2026-08-20T09:24:20Z" AND logName:"stderr"`
- 4 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 8 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND logName:"stderr" AND textPayload:"Cannot create property"`
- 15 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-20T09:09:00.670Z" AND timestamp<="2026-08-20T09:39:00.670Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.78

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
