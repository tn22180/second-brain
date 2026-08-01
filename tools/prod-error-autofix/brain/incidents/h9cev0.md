fingerprint: h9cev0
service: apigen2
message: HTTP 500 POST /api/track-event
app: SEO
repo: seo
date: 2026-07-31T23:13:39.618Z
status: mr_open
attempt: 1

# SEO · apigen2 · h9cev0

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2095

**Root cause.** The browser sent a `__session` cookie that is not a valid Avada-encrypted session, and @avada/core's decryptText returned a bare number (6) instead of an object, so setSession's `cookies[key] = value` threw TypeError in strict mode and the request 500'd before routing.

**Mechanism.** apigen2 mounts shopifyCharge with verifyMiddleware: verifyEmbedRequest(verifyEmbedConfig) (packages/functions/src/handlers/api.js:59; same middleware again at packages/functions/src/middleware/auth.js:33), so every /api/* request runs @avada/core verifyToken before the router. verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) once checkIfActiveAccessToken succeeds. setSession (cookiesHelper.js:15) does `var cookies = decryptText(ctx.cookies.get('__session'), 'avada-session-identifier')` then `cookies[key] = value` at :16. decryptText (hashHelper.js:23-31) is `JSON.parse(AES.decrypt(...).toString(enc.Utf8))` with a catch that returns `{error}` — it only guards a *throw*, not a successful parse of a non-object. When the ciphertext is stale/foreign/garbage, the AES output occasionally decodes to valid UTF-8 that JSON.parses to a bare small integer; `cookies` is then the number 6, cookiesHelper.js is "use strict", and assigning a property on a primitive throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '6'`. The throw escapes to createErrorHandler (packages/functions/src/middleware/errorHandler.js:16), which logs [unhandledError] and answers 500. I reproduced the primitive-return locally: feeding 200,000 random base64 values through the exact decryptText logic yielded a non-object 31 times, all bare integers, the top values being 3, 4, 8, 1, 7, 2, 6 — the same single-digit values prod shows (6, 4, 4, 8). /api/track-event is incidental: the four occurrences in the last 7 days are on four different endpoints (POST /api/track-event, PUT /api/analysis-bulk/products, GET /api/shopify/domains, GET /api/subscription), so this is not route-specific.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — apigen2 mounts verifyEmbedRequest(verifyEmbedConfig) as shopifyCharge's verifyMiddleware, ahead of the router — this is why a cookie fault 500s an unrelated endpoint
- `packages/functions/src/middleware/auth.js:33` — the second call site of the same verifyEmbedRequest middleware in this repo; the repo-owned seam where a __session sanitizer would go
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — the throwing line named in the stack; cookies is the number 6
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — the caller frame in the stack
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — JSON.parse of the decrypted text; returns a bare number for garbage ciphertext and the catch below only covers a throw, not a non-object result
- `packages/functions/src/middleware/errorHandler.js:16` — logs [unhandledError] at status>=500 and converts the TypeError into the alerted HTTP 500

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-07-31T22:50:26.121Z" AND timestamp<="2026-07-31T23:20:26.121Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 4 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-07-25T00:00:00Z" AND textPayload:"Cannot create property" AND textPayload:"[unhandledError]"`
- 18 matching entries: `resource.type="cloud_run_revision" AND resource.labels.project_id="avada-seo" AND timestamp>="2026-07-25T00:00:00Z" AND textPayload:"Cannot create property"`
- 1 matching entries: `timestamp>="2026-07-31T22:50:26.121Z" AND timestamp<="2026-07-31T23:20:26.121Z" AND httpRequest.requestUrl:"/api/track-event" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.63
- branch: `fix/prod-seo-h9cev0`
- fix commit: `1418e06202e4995dc88f5f634ca21754223fb7aa`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2095
- tests: 779 tests, 9 failing · baseline 9 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/api.js     | 2 ++
 packages/functions/src/handlers/apiSa.js   | 2 ++
 packages/functions/src/handlers/apiSaV2.js | 2 ++
 packages/functions/src/handlers/apiV2.js   | 2 ++
 4 files changed, 8 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
