fingerprint: j5us9l
service: handlehooksubscribergen2
message: 'Memory limit of 2048 MiB exceeded with 2113 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-12T05:23:46.067Z
status: infra
attempt: 1

# SEO · handlehooksubscribergen2 · j5us9l

**Outcome.** infra class — reported, no MR

**Root cause.** handleHookSubscriberGen2 is declared memory: '2GiB' while one handleHook run on the `query getBulkOptimize` branch for Shopify Plus shop CWHlcutbBDemPvatv1Yu (apollo-optics.myshopify.com, doneProductLineNo 78404) pulls that shop's entire product+collection bulk JSONL into heap twice — once in hookCountImage, again in uploadCollectionAndProduct — so the container hit 2113 MiB and was OOM-killed at 2026-08-04T21:48:00.800Z.

**Mechanism.** Instance 001548f729e190acd5d9 logged '[handleHook] CWHlcutbBDemPvatv1Yu gid://shopify/BulkOperation/5962108960871 bulk_operations/finish' at 21:47:37.326Z and '[handleHook] bulkOp CWHlcutbBDemPvatv1Yu COMPLETED' at 21:47:37.645Z, then went silent for 23s and died at 21:48:00.800Z with 2113 MiB used against the declared 2GiB (pubsubFunctions.js:345). Which branch ran is proved by GCS, not inference: gs://avada-seo.appspot.com/collectionJsonl/CWHlcutbBDemPvatv1Yu/optimizeAt_2026-08-04T21:47:46.048Z.jsonl exists (65787 bytes, created 21:48:00Z) while gs://avada-seo.appspot.com/productJsonl/CWHlcutbBDemPvatv1Yu/ has zero objects — that path+timestamp is minted in hookOptimizeImage (bulkOperationHook.js:571-573), so the kill landed inside uploadCollectionAndProduct's Promise.all (backUpProductJson.js:79-82) after the collections buffer was saved and before the products one. The allocation: the getBulkOptimize branch (bulkOperationHook.js:181) runs hookCountImage first, which does largeDataApi(url) and holds the whole JSONL as one JS string to regex-count MediaImage/CollectionImage (:405-407); then hookOptimizeImage calls uploadCollectionAndProduct, which downloads the SAME url a second time (backUpProductJson.js:77), and parseJsonlString accumulates two more full-size strings (collections + products) before saveToStorage copies each into a Buffer (backUpProductJson.js:61). Peak is therefore ~3-4x the JSONL size, and the only size guard is largeDataApi's 512MB content-length check (helpers/api.js:200) — a file anywhere near that guarantees a kill at 2GiB. Shop context: startOptimizeImage fired from the FE at 21:41:38.021Z (apigen2), bulk op ran ~6 min, shop is shopify_plus with doneProductLineNo 78404. minInstances: 1 (pubsubFunctions.js:345) means this single warm instance also carried the residue of two wWoDyO4UXAdNm9LSx03c file-image runs at 21:36 and 21:42, but those JSONLs are only 738694 bytes each in GCS, so they are noise, not the cause. Rate: 2 kills in 7 days on this service (2397 MiB on 2026-07-29, 2113 MiB here) — both overshoots are 3-17% over the cap, i.e. the peak sits just above 2GiB for large-catalog shops, not far above it. hookCountFileImage already solved exactly this for the Files branch by preferring bulkOp.objectCount over downloading the result (bulkOperationHook.js:520-530); the product/collection branch never got that treatment.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — memory: '2GiB', minInstances: 1 — the cap the 2113 MiB run exceeded, on a permanently warm instance
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:181` — the `query getBulkOptimize` branch: hookCountImage then hookOptimizeImage, both against the same bulk result
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:405` — first full download — largeDataApi(url) held as one JS string for regex counting
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:571` — timestamp that produced optimizeAt_2026-08-04T21:47:46.048Z.jsonl — ties the GCS object to this code path
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:582` — uploadCollectionAndProduct call inside the Promise.all where the container died
- `packages/functions/src/services/backUpProductJson.js:77` — second full download of the same URL in the same request
- `packages/functions/src/services/backUpProductJson.js:108` — parseJsonlString accumulates two more full-size strings from the JSONL
- `packages/functions/src/services/backUpProductJson.js:61` — Buffer.from(data) — another full copy per saved file
- `packages/functions/src/helpers/api.js:200` — only size guard is 512MB content-length, ~4x too permissive for a 2GiB heap
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:526` — the Files branch already avoids the download by using bulkOp.objectCount — the pattern the product/collection branch lacks

## Evidence
- 1 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-08-04T00:00:00Z" AND timestamp<="2026-08-05T00:00:00Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 2 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-07-29T00:00:00Z" AND timestamp<="2026-08-05T00:00:00Z" AND textPayload:"Memory limit"`
- 7 matching entries: `timestamp>="2026-08-04T21:30:00Z" AND timestamp<="2026-08-04T22:10:00Z" AND textPayload:"CWHlcutbBDemPvatv1Yu"`
- 14 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-08-04T21:35:15.211Z" AND timestamp<="2026-08-04T22:05:15.211Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.25

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
