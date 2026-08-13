fingerprint: 1oer5cs
service: api
message: NotFoundError: Your charge doesn't exist
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-12T19:36:26.532Z
status: inconclusive
attempt: 2

# IMG-OPT · api · 1oer5cs

**Outcome.** smoke gate new_failures

**Root cause.** Not an app-src defect: a request carrying charge_id=43806792180 — a literal that exists in no `charges` doc in app-plaza-image-optimizer and arrives byte-identical after four unrelated shops' upgrades — reaches @avada/core's charge lookup mounted at packages/functions/src/handlers/api.js:45; core answers HTTP 200, then ~1.08s later its un-awaited continuation calls ctx.throw(404) at subscriptionController.js:460, outside the app's Koa error middleware, so the runtime logs the raw stack at severity ERROR.

**Mechanism.** Execution gxhamb1wlipr: started 06:52:44.996Z, logged 'No charge found 43806792180' at 06:52:45.039Z, 'Function execution took 45 ms, finished with status code: 200' at 06:52:45.042Z — then the NotFoundError stack landed at 06:52:46.116Z, 1.077s AFTER the request had already completed 200, on the same execution_id and trace e197c3812baffbd97080c56e5d67df7f. No '[unhandledError]'/'[requestError]' line from packages/functions/src/middleware/errorHandler.js:15 exists for that execution, and the stack carries no leading shopID/shop prefix, so it did not pass through api.on('error') at packages/functions/src/handlers/api.js:67 either — it escaped the Koa chain entirely as an unhandled rejection. The merchant's upgrade succeeded: 4.2s earlier execution gxhak809anxp ran afterCharge {plan:'basic', shopId:'PmKA5dvidaTyL0h8maxf', chargeId:'24580390947', directUpgrade:'true'} and finished 302; Firestore now shows shops/PmKA5dvidaTyL0h8maxf (9uj01y-dc.myshopify.com) plan='basic', subscriptionDate=2026-08-12T06:52:39.854Z, and its only charges doc 9Zksp281xuewYbHMLTkw chargeId='24580390947' status='active'. The bogus id is not this shop's and not anyone's: a runQuery on collection `charges` for chargeId=='43806792180' returns 0 docs as both stringValue and integerValue. It is also not a stale per-merchant bookmark — 'No charge found 43806792180' occurs exactly 4× in 90 days (2026-07-22T05:01:50, 2026-07-30T18:34:45, 2026-08-02T15:14:33, 2026-08-12T06:52:45) and every one lands 3.0–7.0s after a successful 'status subscription upgrade' 302 for a DIFFERENT shop (mbNB2rhjMf7vbh4KhnF3 chargeId 39644594495, n4VtzXnbo50qwUBaoN4v, v6FnQeruizOw3NJey3qK chargeId 29857841340, PmKA5dvidaTyL0h8maxf chargeId 24580390947), with the same 1.07–1.11s throw delta each time. Four unrelated shops replaying one constant id means the id is fixed on the post-upgrade return path, not merchant-supplied; that path is inside @avada/core (/workspace/node_modules/@avada/core/build/controllers/subscriptionController.js:460), which is not in packages/functions/src, so the origin of the constant is not provable from this repo. Same fingerprint, same id, same mechanism as attempt 1 on 2026-08-02.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/api.js:45` — shopifyCharge from @avada/core is mounted here and owns the charge-lookup route whose handler throws at subscriptionController.js:460; no app-src route resolves a charge id.
- `packages/functions/src/middleware/errorHandler.js:15` — The catch-all that logs '[unhandledError]'/'[requestError]' for anything raised inside the middleware chain. Absent for execution gxhamb1wlipr — proof the throw escaped the chain instead of being an ordinary request error.
- `packages/functions/src/handlers/api.js:67` — api.on('error') prints `shopID, shop, err`; the ERROR entry begins with 'NotFoundError:' and no shopID/shop prefix, so the rejection also bypassed this handler and was logged raw by the Node runtime.
- `packages/functions/src/services/subscriptionService.js:101` — afterCharge only reads chargeId off ctx.state.charge, which core populates — the app never resolves or validates a charge id, so it cannot reject 43806792180.

## Evidence
- 1 matching entries: `"No charge found" AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z"`
- 4 matching entries: `resource.labels.function_name="api" AND labels."execution_id"="gxhamb1wlipr"`
- 20 matching entries: `resource.labels.function_name="api" AND labels."execution_id"="gxhak809anxp"`
- 4 matching entries: `"No charge found 43806792180" AND timestamp>="2026-07-20T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $6.07
- tests: 16 tests, 115 failing · baseline 114 failing · reproduce check did not pass

```
packages/functions/src/handlers/api.js | 5 +++++
 1 file changed, 5 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
