fingerprint: r6ig4i
service: api
message: [handleError] Unauthenticated TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '4'
app: BLOG
repo: blogs
date: 2026-08-28T02:50:10.181Z
status: fix_disabled
attempt: 2

# BLOG · api · r6ig4i

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** @avada/core 4.8.2's setSession assigns a property onto whatever decryptText('__session') returns without checking it is an object, so the browser's __session cookie for this merchant — which decrypts and JSON.parses to the primitive number 4 — makes `cookies['shopifyTopLevelOAuth'] = 1` throw TypeError in the strict-mode module, and GET /api/settings answers 500.

**Mechanism.** GET /api/settings (packages/functions/src/routes/api.js:216) has no ctx.state.user, so packages/functions/src/handlers/api.js:90 hands the request to verifyEmbedRequest. verifyToken's active-token branch calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) at node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119. setSession (cookiesHelper.js:15) decrypts the client-supplied __session with the fixed key 'avada-session-identifier'; decryptText (hashHelper.js:26) returns `JSON.parse(bytes.toString(...))` unguarded, and for this cookie the parse produced the number 4, not a session object. cookiesHelper.js:16 then executes `cookies[key] = value` on that number — the file is "use strict" (cookiesHelper.js:1), so property creation on a primitive throws TypeError "Cannot create property 'shopifyTopLevelOAuth' on number '4'". Nothing in verifyToken wraps the call, so it propagates to errorService.handleError with no ctx.state.user, logged as [handleError] Unauthenticated at 05:04:17.232058Z and as [unhandledError] GET /api/settings 500 at 05:04:17.221430Z — one request, two lines. Same defect family as recorded fingerprints r6ig4i (attempt 1, GET /api/shopify/block), 1qodvk0 on BLOG api and h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / 3l54x4 / 1g4bhm7 on SEO apigen2.

Confidence: `high`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — the throwing line: cookies[key] = value with cookies === 4, in a "use strict" module
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:15` — setSession decrypts the client-supplied __session cookie and never type-checks the result before line 16
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns JSON.parse(...) unguarded, so any JSON scalar (4) is handed back as the session object
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — the caller named in the stack: setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) on the active-token branch, no try/catch
- `packages/functions/src/handlers/api.js:90` — app mounts verifyEmbedRequest for every /api/* request without ctx.state.user — the app-owned point where a malformed __session can be rejected before @avada/core touches it
- `packages/functions/src/handlers/api.js:63` — second entry into the same code path: shopifyCharge is given verifyEmbedRequest(verifyEmbedConfig) as verifyMiddleware, so a guard placed only at line 90 would miss it
- `packages/functions/src/routes/api.js:216` — GET /settings, the endpoint named in the [unhandledError] line

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-27T04:49:19.596Z" AND timestamp<="2026-08-27T05:19:19.596Z" AND severity>=ERROR AND jsonPayload.message:"shopifyTopLevelOAuth"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-28T00:00:00Z" AND jsonPayload.message:"Cannot create property"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-27T04:49:19.596Z" AND timestamp<="2026-08-27T05:19:19.596Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
