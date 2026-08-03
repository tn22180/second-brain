fingerprint: 1oer5cs
service: api
message: NotFoundError: Your charge doesn't exist
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-02T15:25:22.034Z
status: inconclusive
attempt: 1

# IMG-OPT · api · 1oer5cs

**Outcome.** smoke gate new_failures

**Root cause.** A second request in shop mgux0j-0w.myshopify.com's Expert upgrade flow carried charge_id=43806792180 — an id that exists in no `charges` doc in app-plaza-image-optimizer — so @avada/core's charge lookup threw NotFoundError('Your charge doesn't exist') from a code path outside the app's Koa error handler; it is not an app-src defect and the upgrade itself succeeded.

**Mechanism.** 15:13:51 exec 56pbkjz8yb44 created AppSubscription gid://shopify/AppSubscription/29857841340 (Expert, $99, PENDING) for shop v6FnQeruizOw3NJey3qK via shopifyCharge mounted at packages/functions/src/handlers/api.js:45. 15:14:26 exec 56pbaz19f9qo ran afterCharge with chargeId 29857841340, oldPlanId pro, and redirected 302 — Firestore now shows shops/v6FnQeruizOw3NJey3qK.plan='expert', subscriptionDate=2026-08-02T15:14:26.429Z and charges/KsfEgVO6aRFgB6CQetJe chargeId=29857841340 status='active'. 7s later, 15:14:33 exec 56pbmyokgjml logged 'No charge found 43806792180' and returned 200 in 60ms; a Firestore runQuery on collection `charges` where chargeId=='43806792180' returns 0 documents project-wide (this shop's only charge ids are 29723885756, 29723918524, 29723951292, 29857841340). The 404 raised at @avada/core/build/controllers/subscriptionController.js:460 surfaced 1.07s AFTER that execution reported status 200 and produced no '[requestError]' line from packages/functions/src/middleware/errorHandler.js:15 — so it escaped the Koa chain as an unhandled rejection and was logged raw by the runtime at severity ERROR (the only ERROR-severity entry in the window; the app logger is bare console per P7). No app source references charge_id: grep over packages/assets/src finds nothing, and packages/functions/src only reads ctx.state.charge.chargeId, which core populates.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/api.js:45` — shopifyCharge from @avada/core is mounted here; it owns the /api/subscription/shopify/* route whose handler throws at subscriptionController.js:460. No app-src route handles charge lookup.
- `packages/functions/src/middleware/errorHandler.js:15` — The app's catch-all logs '[unhandledError]'/'[requestError]' for anything raised inside the middleware chain. No such line exists for execution 56pbmyokgjml, proving the throw escaped the chain rather than being an ordinary request error.
- `packages/functions/src/services/subscriptionService.js:93` — afterCharge reads chargeId from ctx.state.charge, which core sets — the app never resolves a charge id itself, so it cannot validate or reject the bogus 43806792180.
- `packages/functions/src/featureReq/featureReq.repository.js:339` — Separate confirmed defect in the same trace: this query orders createdAt 'asc' and is only backed by a DESCENDING index, so it fails FAILED_PRECONDITION on every Expert upgrade.
- `firestore.indexes.json:1175` — The only shopId+featureType+createdAt composite index ships createdAt DESCENDING — direction mismatch with the 'asc' orderBy at featureReq.repository.js:339.

## Evidence
- 1 matching entries: `resource.labels.function_name="api" AND timestamp>="2026-08-02T15:14:20Z" AND timestamp<="2026-08-02T15:14:40Z" AND severity>=ERROR`
- 1 matching entries: `"No charge found" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-02T16:00:00Z"`
- 60 matching entries: `resource.labels.function_name="api" AND timestamp>="2026-08-02T15:13:00Z" AND timestamp<="2026-08-02T15:16:00Z"`
- 1 matching entries: `resource.labels.function_name="api" AND timestamp>="2026-08-02T15:14:27Z" AND timestamp<="2026-08-02T15:14:28Z" AND "prioritizeShopSpeedRequest"`

## Job
- analyze rounds: 1
- cost: $4.33
- tests: 16 tests, 74 failing · baseline 73 failing · reproduce check did not pass

```
packages/functions/src/featureReq/featureReq.repository.js | 6 ++++--
 1 file changed, 4 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
