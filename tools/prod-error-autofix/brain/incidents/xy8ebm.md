fingerprint: xy8ebm
service: apigen2
message: HTTP 500 GET /api/tasks-completed
app: SEO
repo: seo
date: 2026-08-18T02:11:24.199Z
status: mr_open
attempt: 1

# SEO · apigen2 · xy8ebm

**Outcome.** duplicate of h9cev0 — MR https://gitlab.com/avada/seo/-/merge_requests/2095

**Root cause.** @avada/core 4.8.2's setSession does `cookies[key] = value` on whatever decryptText('__session') returns; for this request the cookie decrypted to the primitive number 3, so the strict-mode property assignment threw TypeError and the unhandled error became the 500 on GET /api/tasks-completed.

**Mechanism.** Shopify Mobile iOS webview (shop theboldbowtie.myshopify.com) sent GET /api/tasks-completed with a __session cookie. apigen2 mounts createAuthMiddleware (packages/functions/src/handlers/api.js:65), which calls verifyEmbedRequest(verifyEmbedConfig) (packages/functions/src/middleware/auth.js:33). Inside @avada/core, verifyToken.js:119 takes the active-access-token branch and calls setSession(ctx, 1, 'shopifyTopLevelOAuth'). setSession reads the cookie through decryptText (node_modules/@avada/core/build/helpers/hashHelper.js:26), which is `JSON.parse(bytes.toString(Utf8))` — it returns whatever JSON the decrypted bytes contain, with no object check, so a scalar payload yields the number 3. cookiesHelper.js:16 then assigns a property onto that number; the file is "use strict", so instead of a silent no-op it throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '3'`. Nothing in this repo guards or sanitises __session before verifyEmbedRequest (grep for `__session` over packages/functions/src returns zero matches), so the throw escapes to the Koa error handler and answers 500 at 1.75s. The stderr line carrying that exact stack is at 2026-08-18T01:52:07.583716Z on instance 001548f7296a513caebb5fe2… — the same instance and second as the alerted 500 request at 01:52:05.825662Z, revision apigen2-00334-jim.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:65` — apigen2 mounts createAuthMiddleware for every /api/* request, so /api/tasks-completed enters the failing auth path
- `packages/functions/src/middleware/auth.js:33` — calls verifyEmbedRequest(verifyEmbedConfig) with no prior validation or sanitisation of the __session cookie — this is the repo-side line the fix belongs on
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — the exact line named in the prod stack; throws when decryptText returned a primitive
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns bare JSON.parse output with no object check, so a scalar cookie payload becomes the number 3
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — the caller in the stack frame above cookiesHelper

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-18T01:38:59Z" AND timestamp<="2026-08-18T02:08:59Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-18T01:38:59Z" AND timestamp<="2026-08-18T02:08:59Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"/api/tasks-completed"`
- 4 matching entries: `resource.labels.service_name=~"apigen2|apiv2gen2|apisagen2" AND timestamp>="2026-08-17T02:00:00Z" AND timestamp<="2026-08-18T02:09:00Z" AND textPayload:"Cannot create property"`

## Job
- analyze rounds: 1
- cost: $2.41
- MR: https://gitlab.com/avada/seo/-/merge_requests/2095

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
