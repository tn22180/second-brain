fingerprint: 2exedr
service: apigen2
message: HTTP 500 GET /api/shopify/seaAccessibilityBlocks
app: SEO
repo: seo
date: 2026-09-14T20:56:18.001Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 2exedr

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded @avada/core setSession family (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / jjeu1l / mne0rk / 18rdy2b): the browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number `0` instead of an object, and @avada/core 4.8.2's setSession does `cookies['shopifyTopLevelOAuth'] = 1` on that primitive under strict mode, throwing `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '0'` inside verifyEmbedRequest before shopifyController.getSeaAccessibilityBlocks ever runs.

**Mechanism.** GET /api/shopify/seaAccessibilityBlocks (Safari 26.6.2, referer https://seo.apps.avada.io/, 0.20s latency, revision apigen2-00376-jup) enters the api handler chain where shopifyCharge is wired with `verifyMiddleware: verifyEmbedRequest(verifyEmbedConfig)` (packages/functions/src/handlers/api.js:59); the same middleware is re-applied by createAuthMiddleware (packages/functions/src/middleware/auth.js:33). verifyToken's active-token branch calls `setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME)` (prod stack frame verifyToken.js:119:56); setSession decrypts `__session` via decryptText → bare JSON.parse with no shape check, then assigns `cookies[key] = value` (prod stack frame cookiesHelper.js:16:18). The decrypted plaintext is the JSON token `0`, so `cookies` is the primitive Number 0 and strict-mode property creation throws. The throw reaches createErrorHandler, which logs `[unhandledError] GET /api/shopify/seaAccessibilityBlocks 500` at 20:53:46.318172Z (packages/functions/src/middleware/errorHandler.js:18) and re-emits to the api 'error' listener (packages/functions/src/handlers/api.js:79, logged with `undefined` shopID because ctx.state.user was never set), answering HTTP 500. Not endpoint-specific: 2 hits on apigen2 in the prior 24h (this one with number '0'; POST /api/track-event at 04:53:00Z with number '3'). Route packages/functions/src/routes/api.js:336 and the controller are never reached. The worktree has no node_modules, so @avada/core frames are cited from the prod stack, not disk. Fix for this family already exists as unmerged MR https://gitlab.com/avada/seo/-/merge_requests/2095 (fingerprint h9cev0); master still ships @avada/core 4.8.2 (packages/functions/package.json:33).

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — verifyEmbedRequest(verifyEmbedConfig) wired as shopifyCharge's verifyMiddleware — entry point of the failing chain for every /api/* request, runs before any controller
- `packages/functions/src/middleware/auth.js:33` — second application of verifyEmbedRequest(verifyEmbedConfig) for requests that did not set ctx.state.user — same @avada/core setSession path
- `packages/functions/src/middleware/errorHandler.js:18` — emits the alerted `[unhandledError] GET /api/shopify/seaAccessibilityBlocks 500` line and lets the 500 through
- `packages/functions/src/handlers/api.js:79` — the `[api] undefined GET ... 500` companion line — shopID is undefined because the throw happened before auth populated ctx.state.user
- `packages/functions/src/routes/api.js:336` — the route the alert names; never reached in this request
- `packages/functions/package.json:33` — @avada/core pinned at 4.8.2 — the version whose setSession has no object guard on the decrypted cookie

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-14T20:39:08.073Z" AND timestamp<="2026-09-14T21:09:08.073Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-14T20:39:08.073Z" AND timestamp<="2026-09-14T21:09:08.073Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-13T21:00:00Z" AND timestamp<="2026-09-14T21:09:08Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth" AND textPayload:"[unhandledError]"`

## Job
- analyze rounds: 1
- cost: $2.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
