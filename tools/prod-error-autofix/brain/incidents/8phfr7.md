fingerprint: 8phfr7
service: api
message: [unhandledError] GET /api/shops 500 Cannot create property 'shopifyTopLevelOAuth' on number '2' TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '2'
app: BLOG
repo: blogs
date: 2026-09-14T09:11:13.962Z
status: fix_disabled
attempt: 1

# BLOG · api · 8phfr7

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1qodvk0 / a3l435 / r6ig4i / skrvtw (BLOG setSession family, no fix on master): the browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 2 instead of an object, and @avada/core 4.8.2's setSession does `cookies['shopifyTopLevelOAuth'] = 1` on that Number under strict mode, throwing TypeError before GET /api/shops ever reaches shopController.getUserShops.

**Mechanism.** api.js:63/90 mount verifyEmbedRequest(verifyEmbedConfig) on every /api/* request. verifyToken loads the session, checkIfActiveAccessToken returns true, and verifyToken.js:119 calls setSession(ctx, 1, 'shopifyTopLevelOAuth'). setSession (cookiesHelper.js:15) reads the `__session` cookie through decryptText, which is `JSON.parse(AES.decrypt(value,'avada-session-identifier').toString(Utf8))` (hashHelper.js:25-26) with a catch that only covers throw paths. When the decrypted bytes are a single ASCII digit, JSON.parse succeeds and returns a Number; cookiesHelper.js:16 then does `cookies[key] = value` on the primitive 2 → `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '2'`, thrown outside any catch → createErrorHandler logs [unhandledError] + [handleError] Unauthenticated and answers 500. The alert window holds exactly 1 request (execution_id 10r0fcbupqhp, 09:06:46.917Z, two log lines for one failure). Across 2026-08-14→09-14 the api service logged 10 such lines = 5 requests (GET /api/shops, /api/settings, /api/options, /api/shopify/block, PUT /api/article/…), every decrypted value a single digit 2/3/4/7 — matching the 0.0142% single-digit-scalar rate measured in incident 1qodvk0. master still pins @avada/core 4.8.2 (package.json:20) and packages/functions/src has no `__session` sanitiser (grep: zero hits), so the fix from incident 1qodvk0 (commit e1cd02d, push_failed) never shipped. Which client wrote the foreign `__session` value is not in the logs; the MCP OAuth flow writes a raw 64-hex secret into the same cookie name on the same Hosting host (mcp.oauth.controller.js), a latent collision, not proven trigger here.

Confidence: `high`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — exact throw site in the stack (cookiesHelper.js:16:18); no check that decryptText returned an object
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns raw JSON.parse of decrypted bytes, so a single-digit plaintext yields a Number instead of an object and bypasses the catch
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — caller frame verifyToken.js:119:56 in the stack, runs on every verified embedded request with an active token
- `packages/functions/package.json:20` — app still pins @avada/core 4.8.2, the version carrying unguarded setSession
- `packages/functions/src/handlers/api.js:63` — verifyEmbedRequest(verifyEmbedConfig) wired as shopifyCharge's verifyMiddleware on the api function — where the throw surfaces; the cookie sanitiser belongs before this middleware
- `packages/functions/src/handlers/api.js:90` — second verifyEmbedRequest mount for non-swagger requests; same entry into verifyToken → setSession
- `packages/functions/src/routes/api.js:56` — GET /shops → shopController.getUserShops, the alerted endpoint; never executes because the auth middleware upstream throws
- `packages/functions/src/mcp/mcp.oauth.controller.js:101` — MCP connect writes a raw hex secret into the same `__session` cookie on the same Hosting origin — latent source of non-core cookie values; not proven as this event's trigger

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-14T08:52:01.288Z" AND timestamp<="2026-09-14T09:22:01.288Z" AND jsonPayload.error.message:"Cannot create property" AND jsonPayload.error.message:"shopifyTopLevelOAuth"`
- 10 matching entries: `timestamp>="2026-08-14T00:00:00Z" AND jsonPayload.error.message:"shopifyTopLevelOAuth"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-14T08:52:01.288Z" AND timestamp<="2026-09-14T09:22:01.288Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
