fingerprint: r6ig4i
service: api
message: [handleError] Unauthenticated TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '4'
app: BLOG
repo: blogs
date: 2026-08-17T22:04:22.275Z
status: inconclusive
attempt: 1

# BLOG · api · r6ig4i

**Outcome.** MR not opened: push_failed

**Root cause.** @avada/core 4.8.2's setSession writes a property onto whatever decryptText('__session') returns without checking it is an object, so a client-supplied __session cookie that decrypts+JSON.parses to a scalar (here the number 4) makes `cookies['shopifyTopLevelOAuth'] = 1` throw TypeError in strict mode and the api function answers GET /api/shopify/block with 500.

**Mechanism.** GET /api/shopify/block (routes/api.js:192) enters verifyEmbedRequest mounted at handlers/api.js:88. verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) once checkIfActiveAccessToken passes. setSession (cookiesHelper.js:15) decrypts the browser's __session with the fixed key 'avada-session-identifier'; decryptText (hashHelper.js:26) returns JSON.parse(bytes) unguarded, and for this cookie the parse yielded the number 4 instead of a session object. cookiesHelper.js:16 then does cookies['shopifyTopLevelOAuth'] = 1 on that number — the file is 'use strict', so property creation on a primitive throws TypeError 'Cannot create property shopifyTopLevelOAuth on number 4'. Nothing in verifyToken catches it, so it reaches errorService.handleError with no ctx.state.user ('Unauthenticated') and the request 500s. Same defect family as fingerprints 1qodvk0 (BLOG api, 2026-08-17) and h9cev0 / 2t79bo (SEO apigen2).

Confidence: `medium`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — the throwing line: cookies[key] = value with cookies = 4, in a 'use strict' module
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns JSON.parse(...) unguarded, so any JSON scalar (4) is handed back as the session object
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — the caller in the stack: setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) on the active-token branch, no try/catch
- `packages/functions/src/handlers/api.js:88` — app mounts verifyEmbedRequest here for every /api/* request that has no ctx.state.user — the only app-owned point where a bad __session can be rejected before @avada/core touches it
- `packages/functions/src/routes/api.js:192` — GET /shopify/block, the endpoint named in the [unhandledError] line

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-17T21:24:51.802Z" AND timestamp<="2026-08-17T21:54:51.802Z" AND severity>=ERROR AND jsonPayload.message:"shopifyTopLevelOAuth"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-17T00:00:00Z" AND timestamp<="2026-08-18T00:00:00Z" AND jsonPayload.message:"Cannot create property"`
- 25 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-16T00:00:00Z" AND timestamp<="2026-08-18T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $4.37
- fix commit: `7c47727f53e0f00308ed40104ff198e3806e8402`
- tests: 388 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/api.js   | 2 ++
 packages/functions/src/handlers/apiV2.js | 2 ++
 2 files changed, 4 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
