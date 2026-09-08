fingerprint: 18rdy2b
service: sidekickgen2
message: HTTP 500 GET /sidekick/seo/health-score
app: SEO
repo: seo
date: 2026-09-08T02:54:51.111Z
status: fix_disabled
attempt: 1

# SEO · sidekickgen2 · 18rdy2b

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 1 instead of an object, and @avada/core 4.8.2's setSession does a bare `cookies[key] = value` on that result, so verifyEmbedRequest threw `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '1'` and the sidekick mount answered 500.

**Mechanism.** GET /sidekick/seo/health-score enters sidekick.js:37 → createAuthMiddleware() (middleware/auth.js:25), which has no `__session` guard and delegates straight to @avada/core's verifyEmbedRequest (auth.js:33). The token was valid, so verifyToken.js:119 called `setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME)`. cookiesHelper.js:15 does `decryptText(ctx.cookies.get('__session'))`; decryptText (hashHelper.js:23-30) JSON.parses the decrypted bytes and only falls back to `{error}` when it throws — a payload that parses to the primitive `1` is returned as-is. cookiesHelper.js:16 then executes `cookies['shopifyTopLevelOAuth'] = 1` on a Number in strict mode → TypeError. It propagates past createErrorHandler (errorHandler.js:18, which emitted the exact `[unhandledError] GET /sidekick/seo/health-score 500 ...` stderr line) to sidekick.js:44, whose `[sidekick] undefined ...` line has an undefined shopID because ctx.state.user was never populated. Same defect family already recorded on apigen2 (h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / 3l54x4 / jjeu1l / r6ig4i); this is its first occurrence on sidekickgen2, because sidekick.js mounts the same unguarded createAuthMiddleware. The guard commits (23ea68bb4b, 03d8c9ef6b, 509846c266, aa66d16bc5, 1418e06202) live only on fix/prod-seo-* branches — `git branch --contains` puts none of them on origin/master, and master's middleware/auth.js is 35 lines with no guard.

Confidence: `high`

## Code
- `packages/functions/src/handlers/sidekick.js:37` — sidekickgen2 mounts createAuthMiddleware() ahead of every /sidekick route, so the crash sits on the auth path of all 10 routes, not on health-score specifically
- `packages/functions/src/middleware/auth.js:33` — returns verifyEmbedRequest(verifyEmbedConfig)(ctx, next) with no validation of the decrypted __session payload — the entry point into the throwing @avada/core code
- `packages/functions/src/middleware/auth.js:25` — createAuthMiddleware body: 11 lines, only two early-outs (ctx.state.user, /api/docs); no non-object-cookie branch on master
- `packages/functions/src/middleware/errorHandler.js:18` — the logger.error('[unhandledError]', ctx.method, ctx.path, status, err.message, err) call that produced the observed stderr line verbatim
- `packages/functions/src/handlers/sidekick.js:44` — logger.error('[sidekick]', shopID, err.message) — explains the `[sidekick] undefined Cannot create property ...` line: ctx.state.user is unset because auth threw before assigning it

## Evidence
- 2 matching entries: `(resource.labels.service_name="sidekickgen2" OR resource.labels.function_name="sidekickgen2") AND timestamp>="2026-09-08T01:51:24.652Z" AND timestamp<="2026-09-08T02:21:24.652Z" AND logName:"stderr"`
- 1 matching entries: `(resource.labels.service_name="sidekickgen2" OR resource.labels.function_name="sidekickgen2") AND timestamp>="2026-09-08T01:51:24.652Z" AND timestamp<="2026-09-08T02:21:24.652Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.98

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
