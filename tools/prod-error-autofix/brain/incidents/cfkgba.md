fingerprint: cfkgba
service: apigen2
message: HTTP 500 GET /api/referrals
app: SEO
repo: seo
date: 2026-08-18T20:22:19.729Z
status: mr_open
attempt: 1

# SEO · apigen2 · cfkgba

**Outcome.** MR opened: https://git.avada.net/avada/seo/-/merge_requests/2167

**Root cause.** The browser's `__session` cookie for this merchant decrypts to the primitive number `39`, and @avada/core 4.8.2's `setSession` assigns `session.shopifyTopLevelOAuth = ...` onto that value, so V8 throws `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '39'` inside `verifyEmbedRequest` before any route handler runs.

**Mechanism.** GET /api/referrals enters apigen2 → `createAuthMiddleware` (packages/functions/src/middleware/auth.js:33) delegates to `verifyEmbedRequest(verifyEmbedConfig)` (also mounted at packages/functions/src/handlers/api.js:59 via shopifyCharge's verifyMiddleware) → @avada/core `verifyToken.js:119` calls `setSession` → `cookiesHelper.js:16` writes a property onto whatever `decryptText('__session')` returned. For this request that value was the number `39`, and in strict/ESM-transpiled code assigning a property to a primitive throws. The throw escapes to Koa's error handler at 2026-08-18T20:13:15.373Z (`[unhandledError] GET /api/referrals 500` and `[api] undefined GET /api/referrals 500`, shopID `undefined` because `ctx.state.user` was never populated), which answers 500 — matching the single request log at 20:13:15.064111Z with latency 0.306777791s. `referralController.list` (packages/functions/src/controllers/referralController.js:148) can never produce this 500: its catch returns `ctx.body` with HTTP 200. Same defect family as fingerprints h9cev0 / 2t79bo / xy8ebm / jjeu1l; the guard commits (`03d8c9ef6b`, `509846c266`, `aa66d16bc5`, `1418e06202`) exist on branches only — `git merge-base --is-ancestor 03d8c9ef6b master` returns 1, and `git log master --grep=__session` is empty, so prod still runs unguarded. New detail vs prior records: the decrypted payload here is a *number* (`39`), not a string or undefined.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — Entry point that hands every /api/* request to @avada/core's verifyEmbedRequest, whose setSession throws; nothing here validates the decrypted __session payload first.
- `packages/functions/src/handlers/api.js:59` — Second mount of verifyEmbedRequest (as shopifyCharge's verifyMiddleware), so the same throw path is reachable before createAuthMiddleware runs.
- `packages/functions/src/handlers/api.js:79` — The api.on('error') handler that emitted the observed '[api] undefined GET /api/referrals 500 ...' line with shopID undefined — proves the throw happened before ctx.state.user was set.
- `packages/functions/src/controllers/referralController.js:148` — referralController.list catches everything and returns 200 with success:false, so it cannot be the source of a 500 — rules out the handler.

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-18T20:00:11.040Z" AND timestamp<="2026-08-18T20:30:11.040Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-18T20:00:11.040Z" AND timestamp<="2026-08-18T20:30:11.040Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $4.54
- branch: `fix/prod-seo-cfkgba`
- fix commit: `23ea68bb4b7af04e4e80634c4c2500594751e096`
- MR: https://git.avada.net/avada/seo/-/merge_requests/2167
- tests: 1128 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/handlers/api.js    | 10 ++++++-
 packages/functions/src/middleware/auth.js | 46 +++++++++++++++++++++++++++++++
 2 files changed, 55 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
