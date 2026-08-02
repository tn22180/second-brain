fingerprint: luol15
service: apigen2
message: HTTP 500 GET /api/redirects/count
app: SEO
repo: seo
date: 2026-08-02T03:26:56.811Z
status: mr_open
attempt: 1

# SEO · apigen2 · luol15

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2104

**Root cause.** Duplicate of fingerprint h9cev0 (MR https://gitlab.com/avada/seo/-/merge_requests/2095 open, unmerged): the browser sent a `__session` cookie whose AES-decrypted payload JSON.parses to the bare number 7, so @avada/core's setSession does `cookies['shopifyTopLevelOAuth'] = 1` on a primitive and throws TypeError in strict mode before any route runs.

**Mechanism.** GET /api/redirects/count from the embedded admin (referer https://seo.apps.avada.io/embed/search-optimization/redirect-404, shop 56632a-80.myshopify.com) enters apigen2's Koa stack at packages/functions/src/handlers/api.js:65 → createAuthMiddleware (packages/functions/src/middleware/auth.js:33) → @avada/core verifyEmbedRequest. verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) once checkIfActiveAccessToken passes. setSession (node_modules/@avada/core/build/helpers/cookiesHelper.js:15-16) decrypts `__session` via decryptText, which returns whatever JSON.parse yields — here the scalar `7`, not an object — then assigns `cookies[key] = value` on that number. cookiesHelper.js is 'use strict', so property creation on a primitive throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '7'`. decryptText's own try/catch only covers malformed UTF-8, not a valid-but-non-object parse, so nothing catches it; the throw unwinds to createErrorHandler (packages/functions/src/middleware/errorHandler.js:12-17), which logs [unhandledError] and answers 500 with latency 0.205653726s — the redirect route at packages/functions/src/routes/api.js:275 is never reached. The fix already exists unmerged on branch fix/prod-seo-h9cev0 (commit aa66d16bc594, middleware/sessionCookieGuard.js); prod revision apigen2-00298-kul does not carry it, and the current worktree handlers/api.js has no sessionCookieGuard line.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — createAuthMiddleware hands the request to @avada/core verifyEmbedRequest — the middleware whose internal setSession throws
- `packages/functions/src/handlers/api.js:65` — api.use(createAuthMiddleware()) — runs before routing, so every /api/* request with this cookie 500s, not just /redirects/count
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` on the decryptText result; the exact frame named in the prod stack trace
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns raw JSON.parse output, so a scalar payload (7) escapes as a non-object with no guard
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — the call site in the stack
- `packages/functions/src/middleware/errorHandler.js:17` — logs [unhandledError] and returns 500 — the log line seen in stderr
- `packages/functions/src/routes/api.js:275` — the /redirects/count route that never executed

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-02T03:07:26.722Z" AND timestamp<="2026-08-02T03:37:26.722Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-02T03:07:26.722Z" AND timestamp<="2026-08-02T03:37:26.722Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-02T03:07:26.722Z" AND timestamp<="2026-08-02T03:37:26.722Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $2.90
- branch: `fix/prod-seo-luol15`
- fix commit: `509846c266e930206554c361a553c0b24c1afeb2`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2104
- tests: 778 tests, 9 failing · baseline 9 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/api.js   | 2 ++
 packages/functions/src/handlers/apiV2.js | 2 ++
 2 files changed, 4 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
