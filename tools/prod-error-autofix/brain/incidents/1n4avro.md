fingerprint: 1n4avro
service: authgen2
message: HTTP 504 POST /auth/webhook/shop/update
app: SEO
repo: seo
date: 2026-08-12T15:21:55.145Z
status: inconclusive
attempt: 2

# SEO · authgen2 · 1n4avro

**Outcome.** smoke gate reproduce_not_failing

**Root cause.** 0.12% of Shopify shop/update webhook deliveries (6 of 5103 in 32 min) stall past authGen2's 60s Cloud Run request timeout inside @avada/core's onShopUpdate, which runs three unbounded Firestore RPCs with no application-level deadline; Cloud Run returns 504 while the RPC is still pending, so nothing in the process ever logs an error.

**Mechanism.** authGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:81 with no timeoutSeconds override, so firebase-functions v2 leaves the Cloud Run default of 60s. packages/functions/src/handlers/auth.js:76 mounts shopifyAuth().routes() from @avada/core, which registers POST /webhook/shop/update -> verifyWebhook -> onShopUpdate (node_modules/@avada/core/build/auth.js:96). verifyWebhook is pure HMAC, synchronous, no I/O (node_modules/@avada/core/build/middleware/verifyWebhook.js:56-61). onShopUpdate's first statement is console.log('Handling the shop update webhook', domain, plan_name) at node_modules/@avada/core/build/controllers/webhookController.js:298; every statement after it is Firestore I/O (getShopByShopifyDomain :299, updateShop :305, updateOrCreateShopInfo :313). All 6 of the 504 requests were matched by spanId (request-log spanId in hex == stdout spanId in decimal) to exactly one stdout line each — that first console.log, emitted 3.8-5.2ms after request start — and then produced no further log for the remaining 59.995s. So the request entered the handler, cleared HMAC, and hung somewhere in those three Firestore calls. None of the 6 shops had plan_name in closedPlans ['frozen','cancelled','fraudulent'], so the cancel/reopen branches (:322, :346) never ran; the hang is in the unconditional read+2-write prefix. The stall is transient and not shop-specific: each of the 6 shops had other deliveries in the same window that completed at ~0.1s (lamartinamilano 66 deliveries / 1 stall, 72c95c-57 60/1, quasarbiotech 57/1, j-j-pet-club 14/1, vxdi5q-ek 5/1, 701ba8 3/1). Nothing on the path carries a deadline, so the pending RPC outlives the request and Cloud Run answers Shopify-Captain-Hook with 504 at the 60s mark.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:81` — authGen2 onRequest declares memory/region/vpc but no timeoutSeconds, so the Cloud Run limit is the 60s default that every one of the 6 failures hit to within 1.1ms
- `packages/functions/src/handlers/auth.js:76` — the only mount of shopifyAuth().routes() — the sole place /auth/webhook/shop/update is served, and the only point in this repo's src/ where a deadline/ack middleware can be inserted ahead of the vendored handler
- `node_modules/@avada/core/build/controllers/webhookController.js:298` — the console.log that is the last thing all 6 stuck requests emitted; everything after it (:299 getShopByShopifyDomain, :305 updateShop, :313 updateOrCreateShopInfo) is Firestore I/O with no timeout
- `node_modules/@avada/core/build/middleware/verifyWebhook.js:56` — verifyWebhook is synchronous HMAC over ctx.req.rawBody with no I/O and logs 'Error verify webhook' on mismatch — no such log exists for the 6, so the stall is downstream of auth, not in it

## Evidence
- 5000 matching entries: `(resource.labels.service_name="authgen2" OR resource.labels.function_name="authgen2") AND timestamp>="2026-08-07T13:52:00Z" AND timestamp<="2026-08-07T14:25:00Z" AND logName:"requests"`
- 6 matching entries: `(resource.labels.service_name="authgen2" OR resource.labels.function_name="authgen2" OR resource.labels.job_name="authgen2") AND timestamp>="2026-08-07T13:52:57.462Z" AND timestamp<="2026-08-07T14:22:57.462Z" AND severity>=ERROR`
- 5103 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T13:52:00Z" AND timestamp<="2026-08-07T14:25:00Z" AND logName:"stdout"`
- 47 matching entries: `timestamp>="2026-08-07T14:00:00Z" AND timestamp<="2026-08-07T14:08:00Z" AND severity>=ERROR AND resource.labels.service_name!="authgen2"`

## Job
- analyze rounds: 1
- cost: $4.78
- tests: 927 tests, 6 failing · baseline 6 failing · reproduce check did not pass

```
packages/functions/src/handlers/auth.js | 38 +++++++++++++++++++++++++++++++++
 1 file changed, 38 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
