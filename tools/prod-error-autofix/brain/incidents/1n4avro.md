fingerprint: 1n4avro
service: authgen2
message: HTTP 504 POST /auth/webhook/shop/update
app: SEO
repo: seo
date: 2026-08-14T02:27:49.573Z
status: mr_open
attempt: 3

# SEO · authgen2 · 1n4avro

**Outcome.** duplicate of ujwpw9 — MR https://gitlab.com/avada/seo/-/merge_requests/2175

**Root cause.** During 2026-08-13T16:24–16:31Z the single authgen2 instance (001548f7293cac2d1f94…) hit a Firestore write-commit latency spike; `shopRepository.updateShop`'s `DocumentReference.update` inside @avada/core's onShopUpdate has no application-level deadline, so 27 of 2597 shop/update deliveries (1.04%) sat on the pending commit until Cloud Run's undeclared-and-therefore-default 60s request timeout fired and answered Shopify-Captain-Hook with 504.

**Mechanism.** authGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:82 with memory/region/vpcSettings but no `timeoutSeconds`, so firebase-functions v2 leaves the Cloud Run 60s default — every one of the 27 failures has latency 59.9996–60.018s. packages/functions/src/handlers/auth.js:76 is the only mount of `shopifyAuth().routes()`, which serves POST /webhook/shop/update -> onShopUpdate (node_modules/@avada/core/build/controllers/webhookController.js:289). onShopUpdate runs its Firestore prefix inline and unbounded: getShopByShopifyDomain (:299), updateShop (:305), updateOrCreateShopInfo (:313). 3 of the 27 requests got a stderr line out before the container cut them, and each stack resolves the same way: `4 DEADLINE_EXCEEDED: Deadline exceeded after 60.000s` -> google-gax -> WriteBatch.commit -> DocumentReference.update -> node_modules/@avada/core/build/repositories/shopRepository.js:162 — i.e. `shopDoc.ref.update(updateData)` in updateShop. The read that precedes it in the same function (lookupRawShop, :158) resolved, so the stall is on the write commit, not the read or auth. Firestore's gax default deadline is also 60s, so the RPC and the Cloud Run request expire at the same instant — the catch at webhookController.js:382 fires too late to change the response, which is why 24 of 27 produced no application log at all. Three checks rule out the alternatives: it is not document contention (27 failures span 24 distinct shop domains; the busiest shop in the window, thunghiemstore747.myshopify.com with 161 deliveries, failed exactly once), it is not a project-wide Firestore brownout (a DEADLINE_EXCEEDED sweep across all of avada-seo for 16:15–16:40Z returns 3 entries, all authgen2), and it is not VPC egress (packages/functions/src/config/vpcSettings.js:15 is PRIVATE_RANGES_ONLY, so Firestore never crosses the connector). The instance stayed healthy throughout — 2570 of 2597 requests returned 200 at a 0.10s median — but the write path grew a fat tail during the failure window (successes at 43.5s, 42.6s, 52.5s, 28.2s, 26.6s against a 0.10s baseline), so slow commits were completing just under the line and 27 crossed it.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:82` — authGen2 onRequest declares memory/region/vpcSettings but no timeoutSeconds, leaving the Cloud Run 60s default that all 27 failures hit to within 18ms
- `packages/functions/src/handlers/auth.js:76` — the only mount of shopifyAuth().routes() — the sole point in this repo's src/ where a deadline or queue-and-ACK can be inserted ahead of the vendored onShopUpdate
- `node_modules/@avada/core/build/repositories/shopRepository.js:162` — shopDoc.ref.update(updateData) — the exact frame the 3 captured DEADLINE_EXCEEDED stacks bottom out on, with no timeout passed to the Firestore call
- `node_modules/@avada/core/build/controllers/webhookController.js:305` — onShopUpdate's unconditional inline call to updateShop, second of three sequential unbounded Firestore RPCs on the webhook request path
- `node_modules/@avada/core/build/controllers/webhookController.js:382` — the catch that logs 'Error processing shop update hook' — it runs only after the 60s gax deadline, i.e. after Cloud Run already answered 504, which is why 24 of 27 left no application log
- `packages/functions/src/config/vpcSettings.js:15` — vpcConnectorEgressSettings PRIVATE_RANGES_ONLY — Firestore traffic does not traverse the VPC connector, ruling out connector throughput as the stall

## Evidence
- 27 matching entries: `(resource.labels.service_name="authgen2" OR resource.labels.function_name="authgen2" OR resource.labels.job_name="authgen2") AND timestamp>="2026-08-13T16:11:22.422Z" AND timestamp<="2026-08-13T16:41:22.422Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="authgen2" OR resource.labels.function_name="authgen2" OR resource.labels.job_name="authgen2") AND timestamp>="2026-08-13T16:11:22.422Z" AND timestamp<="2026-08-13T16:41:22.422Z" AND logName:"stderr"`
- 2597 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-13T16:20:00Z" AND timestamp<="2026-08-13T16:35:00Z" AND logName:"requests"`
- 2589 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-13T16:20:00Z" AND timestamp<="2026-08-13T16:35:00Z" AND logName:"stdout"`
- 3 matching entries: `timestamp>="2026-08-13T16:15:00Z" AND timestamp<="2026-08-13T16:40:00Z" AND resource.labels.project_id="avada-seo" AND ("DEADLINE_EXCEEDED" OR "Deadline exceeded")`

## Job
- analyze rounds: 1
- cost: $2.20
- MR: https://gitlab.com/avada/seo/-/merge_requests/2175

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
