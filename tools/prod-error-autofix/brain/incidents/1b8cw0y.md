fingerprint: 1b8cw0y
service: handlesyncurlredirectsbatchgen2
message: Uncaught signal: 6, pid=1, tid=1, fault_addr=0.
app: SEO
repo: seo
date: 2026-10-05T02:11:02.828Z
status: fix_disabled
attempt: 1

# SEO · handlesyncurlredirectsbatchgen2 · 1b8cw0y

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** handleSyncUrlRedirectsBatchGen2 re-downloads and fully parses the same 74,919-line Shopify bulk JSONL on every 1000-URL batch message, and the function declares no `concurrency`, so Cloud Run runs up to 80 of those parses inside one 1024 MiB container — V8 hits its heap limit and aborts with SIGABRT (signal 6).

**Mechanism.** subscribeSyncUrlRedirects.js:102 loops over the shop's broken-URL list in BATCH_SIZE=1000 slices and publishes one `syncUrlRedirectsBatch` message per slice (:161), passing the same bulk-result `url` to every one. Observed indexes 371000 and 541000 ⇒ ≥542 messages for shop u5dI4OcR0XcMgPWFbk15. Each message's handler then calls `largeDataApi(url)` (subscribeSyncUrlRedirectsBatch.js:404), which buffers the whole file into one JS string (helpers/api.js:216, HEAD guard allows up to 512 MB), does `rawContent.split('\n')` (:405) into a 74,919-element array, then JSON.parses every line (:33) and builds two Maps of 60,525 + 28,764 entries (:411). handleSyncUrlRedirectsBatchGen2 (handlers/exports/pubsubFunctions.js:213) sets only `memory: '1GiB'`, no `concurrency`, so the deployed Cloud Run revision handlesyncurlredirectsbatchgen2-00390-zum runs containerConcurrency=80 (verified via `gcloud run services describe`) — 80 simultaneous copies of that string + array + Maps in 1024 MiB. 36 `Processing 74919 lines` entries across 40 distinct execution_ids landed in 11.3 s (09:23:38.417→09:23:49.758), 99 in the 30-min window. Three executions died with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` at 803–818 MB old-space, and the failing native frame is the exact allocation each code line makes: `v8::internal::Runtime_StringSplit` twice (= `rawContent.split('\n')`, :405) and `JsonParser<unsigned char>::MakeString` / `Builtin_JsonParse` once (= `JSON.parse`, :33). V8's post-OOM abort() raises SIGABRT, which the Cloud Run supervisor reports as `Uncaught signal: 6, pid=1, tid=1, fault_addr=0.` — 3 of those at 09:23:47.148/47.430/49.334, each 0.3–1.9 s after a heap-limit dump, alongside 9 `Memory limit of 1024 MiB exceeded with 1032–1131 MiB used`. A sibling export in the same file (pubsubFunctions.js:262) already pins `concurrency: 1` for exactly this reason, so the omission here is the defect, not the provisioning.

Confidence: `high`

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:213` — handleSyncUrlRedirectsBatchGen2 declares memory 1GiB and no concurrency → deployed Cloud Run containerConcurrency=80, cpu=1, memory=1024Mi (confirmed on revision -00390-zum)
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirectsBatch.js:404` — largeDataApi(url) buffers the entire bulk JSONL into one in-heap string, once per batch message instead of once per run
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirectsBatch.js:405` — rawContent.split('\n') — the allocation in the two OOM stacks whose failing frame is v8::internal::Runtime_StringSplit
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirectsBatch.js:33` — JSON.parse per line — the allocation in the third OOM stack (JsonParser<unsigned char>::MakeString / Builtin_JsonParse)
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirectsBatch.js:411` — parseBulkOperationData builds the 60,525-entry shopifyRedirectPaths and 28,764-entry activeResourcePaths Maps, rebuilt identically for every batch
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirects.js:102` — BATCH_SIZE=1000 fan-out loop; observed index 541000 ⇒ ≥542 batch messages per run for this shop
- `packages/functions/src/handlers/pubsub/subscribeSyncUrlRedirects.js:161` — dispatchWork publishes the same bulk-result `url` into every batch payload, which is what makes each consumer re-fetch the whole file
- `packages/functions/src/helpers/api.js:216` — axios.request with no responseType stream — whole body materialized as a JS string; the 512 MB HEAD guard at :200 is the only bound
- `packages/functions/src/handlers/exports/pubsubFunctions.js:262` — sibling Pub/Sub export in the same file sets concurrency: 1 with a comment explaining memory pressure — the precedent this export is missing

## Evidence
- 9 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND textPayload:"Memory limit of 1024 MiB exceeded"`
- 3 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND textPayload:"Reached heap limit"`
- 2 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND textPayload:"Runtime_StringSplit"`
- 99 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND textPayload:"Processing 74919 lines from Shopify bulk data"`
- 3 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND severity>=ERROR AND textPayload:"Uncaught signal: 6"`
- 2 matching entries: `resource.labels.service_name="handlesyncurlredirectsbatchgen2" AND timestamp>="2026-10-04T09:08:49Z" AND timestamp<="2026-10-04T09:38:49Z" AND textPayload:"URLs to check"`

## Job
- analyze rounds: 1
- cost: $2.19

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
