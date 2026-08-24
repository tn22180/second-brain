fingerprint: 19t4boc
service: apigen2
message: HTTP 500 POST /api/regenerateBulkItem
app: SEO
repo: seo
date: 2026-08-22T04:26:08.766Z
status: fix_disabled
attempt: 3

# SEO · apigen2 · 19t4boc

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The Bulk Generator's "generate again" button fires one POST /api/regenerateBulkItem per selected row with no concurrency cap, so 31 simultaneous requests each issued a bare, unretried Shopify REST `shopify.metafield.list` from a freshly-built per-request client; the shop's REST bucket answered 429 to 14 of them and generateAgain turned each into a 500.

**Mechanism.** ListGenX.jsx:245 does `selectedResources.forEach(id => mutationRegenerateItem.mutate(...))` — one HTTP call per row, unbounded. Cloud Run logged exactly 31 POST /api/regenerateBulkItem inside 61 ms (09:16:05.506–09:16:05.567), all with referer .../bulk-generator/meta-title/version/dEVVzL4URxK05tR0xLxb; Firestore generateBulk/dEVVzL4URxK05tR0xLxb has shopId cjQiwVgNcaSLRsu7R4jO, section 'meta-title', tab 'collection', totalCount 31 — the request count equals the job's item count. Each request runs generateAgain → generateMetaContent (generateBulkController.js:358) → buildResourceContext (openAI/index.js:746, :714) → getResourceFactsForMeta, whose collection branch's first await is `shopify.metafield.list({metafield:{owner_resource:'collection', owner_id:id}})` (metaData.js:504) over shopify-api-node/got. initShopify (shopifyService.js:61-79) builds a NEW client per request with maxRetries: 0, and its `autoLimit` pacing state is per-client — 31 clients spread over 9 Cloud Run instances share no bucket knowledge — so all 31 REST calls hit Shopify at once. Shopify answered 429 to 14; got raised HTTPError 'Response code 429 (Too Many Requests)'; generateMetaContent logged and rethrew (openAI/index.js:802), generateAgain's catch logged '[generateAgain] Response code 429' and set ctx.status = 500 (generateBulkController.js:413-414). Timing confirms the throw is upstream of the model call: the 14 failures ran 0.63–1.08 s while the 17 survivors ran 4.99–24.51 s, and no [ollama:generateOllamaStructuredText] or [incrementAIUsage] line exists for the failed 14 — the first ollama meta_title line for this shop is 09:16:10.352, after the failures. The fix exists in-repo and is unused on this path: shopifyRetryApi (shopifyService.js:485) with shopifyRetryError (shopifyService.js:465), whose retry codes already include 429 and which honours retry-after. The same shop's bare REST calls 429 again minutes later in publishbulkfaqsgen2 ([getCollection] cjQiwVgNcaSLRsu7R4jO ×12, 09:20–09:23), confirming the shop's REST bucket — not a Shopify outage — is what was throttling.

Confidence: `high`

## Code
- `packages/assets/src/pages/BulkGenerator/ListGenX.jsx:245` — handleRegenerateBulk fans out one mutate() per selected row with no concurrency limit — the source of the 31-in-61ms burst
- `packages/functions/src/helpers/openAI/metaData.js:504` — the bare REST shopify.metafield.list on the collection branch — first Shopify call in the request, the one that 429s
- `packages/functions/src/helpers/openAI/metaData.js:510` — the collection GraphQL call right after it — second unretried Shopify call on the same hot path
- `packages/functions/src/services/openAI/index.js:714` — buildResourceContext builds a fresh client via initShopify(shop) per request, so autoLimit state is never shared
- `packages/functions/src/services/openAI/index.js:746` — generateMetaContent's first await is buildResourceContext — explains the 0.63–1.08s failure with no model call
- `packages/functions/src/services/openAI/index.js:802` — logs '[openAI:generateMetaContent] title Response code 429 (Too Many Requests)' then rethrows — 14 matches
- `packages/functions/src/controllers/generateBulkController.js:358` — generateAgain calls generateMetaContent for the meta-title section of this job
- `packages/functions/src/controllers/generateBulkController.js:413` — catch logs '[generateAgain] Response code 429 (Too Many Requests)' — 14 matches, paired 1:1 with the line above
- `packages/functions/src/controllers/generateBulkController.js:414` — ctx.status = 500 — the alert's HTTP 500 POST /api/regenerateBulkItem
- `packages/functions/src/services/shopifyService.js:77` — autoLimit is per-Shopify-instance and maxRetries defaults to 0, so a per-request client cannot pace or retry a 429
- `packages/functions/src/services/shopifyService.js:465` — shopifyRetryError already treats 429 as retryable and reads retry-after — the guard this path skips
- `packages/functions/src/services/shopifyService.js:485` — shopifyRetryApi is the in-repo REST retry wrapper; nothing under helpers/openAI/ uses it

## Evidence
- 31 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-20T09:13:00Z" AND timestamp<="2026-08-20T09:20:00Z" AND httpRequest.requestUrl:"regenerateBulkItem"`
- 14 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-20T09:13:00Z" AND timestamp<="2026-08-20T09:20:00Z" AND httpRequest.requestUrl:"regenerateBulkItem" AND httpRequest.status>=500`
- 14 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-20T09:13:00Z" AND timestamp<="2026-08-20T09:20:00Z" AND logName:"stderr" AND textPayload:"[openAI:generateMetaContent] title Response code 429"`
- 63 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-20T09:14:00Z" AND timestamp<="2026-08-20T09:16:20Z" AND logName:"stderr"`
- 77 matching entries: `timestamp>="2026-08-20T09:01:08Z" AND timestamp<="2026-08-20T09:31:08Z" AND logName:"stderr" AND textPayload:"429 (Too Many Requests)"`
- 12 matching entries: `resource.labels.service_name="publishbulkfaqsgen2" AND timestamp>="2026-08-20T09:01:08Z" AND timestamp<="2026-08-20T09:31:08Z" AND logName:"stderr" AND textPayload:"[getCollection] cjQiwVgNcaSLRsu7R4jO"`

## Job
- analyze rounds: 1
- cost: $3.63

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
