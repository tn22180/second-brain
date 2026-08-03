fingerprint: 1ag0h4n
service: apigen2
message: HTTP 500 GET /api/analysis/collection
app: SEO
repo: seo
date: 2026-08-03T11:04:00.784Z
status: mr_open
attempt: 1

# SEO · apigen2 · 1ag0h4n

**Outcome.** duplicate of h9cev0 — MR https://gitlab.com/avada/seo/-/merge_requests/2095

**Root cause.** Duplicate of fingerprint h9cev0 (MR https://gitlab.com/avada/seo/-/merge_requests/2095 open, unmerged): the browser sent a `__session` cookie whose AES payload JSON.parsed to the bare number 7 instead of an object, so @avada/core's setSession assigned a property on a primitive and threw TypeError in strict mode before the router ever ran.

**Mechanism.** Every /api/* request on apigen2 runs @avada/core verifyEmbedRequest ahead of the router (packages/functions/src/handlers/api.js:59 mounts it as shopifyCharge's verifyMiddleware; packages/functions/src/middleware/auth.js:33 is the second call site). Once checkIfActiveAccessToken succeeds, verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME). setSession does `var cookies = decryptText(ctx.cookies.get('__session'), 'avada-session-identifier')` then `cookies[key] = value` (cookiesHelper.js:16). decryptText (hashHelper.js:23-31) is `JSON.parse(AES.decrypt(...).toString(enc.Utf8))` with a catch that only guards a *throw*, not a successful parse of a non-object — for a stale/foreign/garbage ciphertext the decoded UTF-8 occasionally parses to a bare single-digit integer. Here it was 7, cookiesHelper.js is "use strict", so `cookies['shopifyTopLevelOAuth'] = 1` throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '7'`. The throw escapes to createErrorHandler (packages/functions/src/middleware/errorHandler.js:16), which logs [unhandledError] and answers HTTP 500 — 0.313s latency, no controller code reached. The endpoint is incidental: 9 occurrences in 7 days span 8 distinct endpoints and the integer varies (1, 3, 3, 4, 4, 6, 7, 7, 8). No sanitizer is present on master in this worktree (grep of api.js/auth.js finds only the bare verifyEmbedRequest calls), i.e. MR 2095 is still unmerged.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — apigen2 mounts verifyEmbedRequest(verifyEmbedConfig) ahead of the router — why a cookie fault 500s an unrelated endpoint; still no __session sanitizer here (MR 2095 unmerged)
- `packages/functions/src/middleware/auth.js:33` — second call site of the same verifyEmbedRequest middleware — the repo-owned seam where the sanitizer belongs
- `packages/functions/src/middleware/errorHandler.js:16` — status>=500 branch that logs [unhandledError] and turns the TypeError into the alerted HTTP 500
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — the throwing frame in the stack; cookies is the number 7
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — caller frame in the stack
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — JSON.parse of the decrypted cookie; returns a bare number for garbage ciphertext and the catch below covers only a throw, not a non-object result

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-03T10:46:45.097Z" AND timestamp<="2026-08-03T11:16:45.097Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 18 matching entries: `resource.type="cloud_run_revision" AND resource.labels.project_id="avada-seo" AND timestamp>="2026-07-27T00:00:00Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-03T10:46:45.097Z" AND timestamp<="2026-08-03T11:16:45.097Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.48
- MR: https://gitlab.com/avada/seo/-/merge_requests/2095

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
