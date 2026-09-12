fingerprint: skrvtw
service: api
message: [unhandledError] GET /api/options 500 Cannot create property 'shopifyTopLevelOAuth' on number '3' TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '3'
app: BLOG
repo: blogs
date: 2026-09-11T20:36:37.117Z
status: fix_disabled
attempt: 1

# BLOG · api · skrvtw

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 3 instead of an object, and @avada/core 4.8.2's setSession assigns a property onto that return value unguarded, so `cookies['shopifyTopLevelOAuth'] = 1` throws TypeError in strict mode and every embedded /api/* request from that browser 500s.

**Mechanism.** GET /api/options enters verifyEmbedRequest(verifyEmbedConfig), mounted at packages/functions/src/handlers/api.js:90 (and as shopifyCharge's verifyMiddleware at api.js:63). verifyToken loads the session, finds the access token active, and calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) at node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119 — the exact frame in the stack (verifyToken.js:119:56). setSession reads the `__session` cookie through hashHelper.decryptText, which is `JSON.parse(CryptoJS.AES.decrypt(...).toString(Utf8))` (hashHelper.js:26) with no type check on the result: a plaintext that is a bare JSON scalar parses to a Number, not an object. cookiesHelper.js:16 then does `cookies['shopifyTopLevelOAuth'] = 1` on that Number under "use strict" → `Cannot create property 'shopifyTopLevelOAuth' on number '3'`, thrown outside any catch, so errorHandler emits [unhandledError] and answers 500 Unauthenticated. Identical stack, same two log lines per request, as the already-recorded family (fingerprints 1qodvk0 on this app, h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / jjeu1l / 18rdy2b / mne0rk on SEO, a3l435 / r6ig4i on BLOG) — the sanitiser attempted for 1qodvk0 never landed: api.js on this worktree's master still has no guard before verifyEmbedRequest.

Confidence: `high`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — exact throw site named in the stack (cookiesHelper.js:16:18); no check that decryptText returned an object
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns the raw JSON.parse of the decrypted bytes, so a scalar plaintext yields a Number; only a throw inside AES/JSON is caught, and a bare digit does not throw
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — the caller frame at verifyToken.js:119:56 in the stack, reached on the active-access-token branch
- `packages/functions/src/handlers/api.js:90` — verifyEmbedRequest(verifyEmbedConfig) mounted for every /api/* request without a prior __session sanitiser — the fix belongs here (and at api.js:63, apiV2.js:60/65)
- `packages/functions/src/handlers/apiV2.js:65` — same unguarded verifyEmbedRequest mount on apiv2, so the same cookie 500s that service too

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-11T20:18:42.298Z" AND timestamp<="2026-09-11T20:48:42.298Z" AND severity>=ERROR`
- 4 matching entries: `timestamp>="2026-08-20T00:00:00Z" AND "shopifyTopLevelOAuth"`

## Job
- analyze rounds: 1
- cost: $1.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
