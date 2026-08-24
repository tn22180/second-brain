fingerprint: dea93l
service: apigen2
message: HTTP 500 GET /api/tempProData/page
app: SEO
repo: seo
date: 2026-08-22T03:47:14.691Z
status: fix_disabled
attempt: 2

# SEO · apigen2 · dea93l

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded @avada/core setSession family (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb): the browser's `__session` cookie for this merchant decrypts to the JSON primitive number `5`, and @avada/core 4.8.2's setSession does `cookies[key] = value` on that number, so GET /api/tempProData/page dies with `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '5'` before any controller runs.

**Mechanism.** stderr at 2026-08-19T21:47:17.929236Z on instance 00a41e8c1d16 (same instance and 213ms after the 500 request log) carries the full stack: `at setSession (/workspace/node_modules/@avada/core/build/helpers/cookiesHelper.js:16:18)` ← `verifyEmbedRequest/verifyToken.js:119:56`. That verifyEmbedRequest is the app's own auth middleware — `verifyEmbedRequest(verifyEmbedConfig)(ctx, next)` at packages/functions/src/middleware/auth.js:33, also mounted earlier as shopifyCharge's `verifyMiddleware` at packages/functions/src/handlers/api.js:59. verifyToken decrypts the `__session` cookie, gets back the primitive `5` instead of a session object, and hands it to setSession, which assigns `cookies.shopifyTopLevelOAuth = ...` — assigning a property on a primitive throws in strict mode. The throw escapes to createErrorHandler, which classifies it as status 500 (packages/functions/src/middleware/errorHandler.js:17) and logs `[unhandledError]`, then api.js:79 logs `[api] undefined GET /api/tempProData/page 500`. `undefined` for shopID is itself confirmation that auth never completed. Nothing in packages/functions/src validates or clears a malformed `__session` before verifyEmbedRequest runs, so the request is fatal, not recoverable — the merchant's browser retries and gets 500 until the cookie is replaced.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — The verifyEmbedRequest(verifyEmbedConfig) call that enters @avada/core verifyToken → setSession; no guard clears a malformed __session cookie first.
- `packages/functions/src/handlers/api.js:59` — Second mount of the same verifyEmbedRequest as shopifyCharge's verifyMiddleware — it runs before createAuthMiddleware, so a fix in auth.js alone does not cover this path.
- `packages/functions/src/handlers/api.js:42` — createErrorHandler is mounted at :42, before the shopifyCharge/verifyEmbedRequest chain — the only place a repo-side __session sanitiser can sit and still run first.
- `packages/functions/src/middleware/errorHandler.js:17` — The status>=500 branch that turned the TypeError into the alerted HTTP 500 and emitted [unhandledError].

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T21:33:11.546Z" AND timestamp<="2026-08-19T22:03:11.546Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T21:33:11.546Z" AND timestamp<="2026-08-19T22:03:11.546Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T21:33:11.546Z" AND timestamp<="2026-08-19T22:03:11.546Z" AND textPayload:"tempProData"`

## Job
- analyze rounds: 1
- cost: $1.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
