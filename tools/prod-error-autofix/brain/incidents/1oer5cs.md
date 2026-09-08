fingerprint: 1oer5cs
service: api
message: NotFoundError: Your charge doesn't exist
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-08T01:47:40.832Z
status: fix_disabled
attempt: 4

# IMG-OPT · api · 1oer5cs

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: ~3–6s after every successful plan upgrade, a follow-up call into @avada/core's shopifyCharge route looks up the constant Shopify charge id 43806792180 — an id that exists on no shop — so core logs "No charge found 43806792180" and ctx.throw(404) fires after the response was already sent with HTTP 200, printing a bare NotFoundError stack that Cloud Functions ingests at severity=ERROR.

**Mechanism.** Execution am56lx98qr5f (2026-09-05T17:16:18.452Z start) logs "No charge found 43806792180" at 17:16:18.620832Z and then "Function execution took 170 ms, finished with status code: 200" at 17:16:18.623Z — the request completed successfully. The NotFoundError stack lands 1.09s LATER at 17:16:19.715266Z, i.e. outside the koa middleware chain: createErrorHandler's try/catch only wraps `await next()` (packages/functions/src/middleware/errorHandler.js:11) and had already returned, and the payload carries no `shopID`/`shop` prefix so it was not emitted by the app's own error listener (packages/functions/src/handlers/api.js:75) either — it is an unhandled rejection from the ctx.throw at @avada/core/build/controllers/subscriptionController.js:460, reached through the shopifyCharge middleware registered at packages/functions/src/handlers/api.js:48. The charge id is a constant, not the shop's: the same execution window contains a real successful upgrade (execution am56gwjzwfma, "afterCharge {" at 17:16:13.697Z for shop op6EJcACUIXgJ2IY1AcB, HTTP 302). Every occurrence in 5 weeks follows the same shape with the SAME id 43806792180 but four DIFFERENT shops and four different real charge ids — 2026-08-12 (chargeId 24580390947), 2026-09-03 (QGeW5IFIJWiT3pEv0V9c, 65383661911), 2026-09-05 (op6EJcACUIXgJ2IY1AcB), 2026-09-06 (5ifkWIMbdezNuzJWqmij, 29447225516) — so 43806792180 cannot come from the merchant's session. The string appears nowhere under packages/ (grep), so it originates inside vendored @avada/core, which is a symlinked node_modules outside this worktree and could not be read. The app's own subscription routes do not touch Shopify charges (packages/functions/src/controllers/subscriptionController.js:18 reads Firestore only), so no code in packages/functions/src is on the throwing path.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/api.js:48` — shopifyCharge({...}) from @avada/core — the only middleware in this app that owns the charge route whose subscriptionController.js:460 threw
- `packages/functions/src/middleware/errorHandler.js:11` — the catch-all only wraps `await next()`; the throw landed 1.09s after the 200 response, so this handler had already returned and never saw it
- `packages/functions/src/handlers/api.js:75` — api.on('error') logs `console.error(shopID, JSON.stringify(shop), err)`; the alerted payload starts with the bare 'NotFoundError:' with no prefix, proving the error did not go through the koa error path
- `packages/functions/src/controllers/subscriptionController.js:18` — the repo's own getSubscription reads Firestore/plans only and never fetches a Shopify charge — rules out an app route as the source

## Evidence
- 4 matching entries: `resource.type="cloud_function" AND resource.labels.function_name="api" AND labels.execution_id="am56lx98qr5f" AND timestamp>="2026-09-05T17:01:34.534Z" AND timestamp<="2026-09-05T17:31:34.534Z"`
- 4 matching entries: `resource.type="cloud_function" AND resource.labels.function_name="api" AND textPayload:"No charge found" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-09-07T00:00:00Z"`
- 2 matching entries: `resource.type="cloud_function" AND resource.labels.function_name="api" AND textPayload:"afterCharge" AND timestamp>="2026-09-05T17:15:40Z" AND timestamp<="2026-09-05T17:16:40Z"`
- 4 matching entries: `resource.type="cloud_function" AND resource.labels.function_name="api" AND textPayload:"Your charge doesn" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-09-07T00:00:00Z"`

## Job
- analyze rounds: 2
- cost: $5.60

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
