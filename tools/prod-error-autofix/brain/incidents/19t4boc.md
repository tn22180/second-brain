fingerprint: 19t4boc
service: apigen2
message: HTTP 500 POST /api/regenerateBulkItem
app: SEO
repo: seo
date: 2026-08-03T03:19:59.081Z
status: inconclusive
attempt: 2

# SEO · apigen2 · 19t4boc

**Outcome.** smoke gate jest_failed

**Root cause.** Shopify REST `GET /admin/api/2026-07/metafields.json?metafield[owner_resource]=collection` returns 404 under the new collections model, and getResourceFactsForMeta still reads collection metafields over REST, so every meta-title/description generation for a collection throws HTTPError 404 and POST /api/regenerateBulkItem answers 500.

**Mechanism.** generateAgain (generateBulkController.js:304) -> generateMetaContent (openAI/index.js:337 call site, :615) -> buildResourceContext (openAI/index.js:584) -> getResourceFactsForMeta (metaData.js:463). For typeContext 'collection' the first await is `shopify.metafield.list({metafield: {owner_resource: 'collection', owner_id: id}})` (metaData.js:475), a shopify-api-node REST call over `got`. Shopify answers 404 `{"errors":"Not Found"}` in ~111ms; got raises HTTPError 'Response code 404 (Not Found)'. generateMetaContent logs and rethrows (openAI/index.js:671-672), generateAgain's catch sets ctx.status = 500 (generateBulkController.js:386-388). The repo already knows this: getAllMetafields routes product/collection to GraphQL and keeps REST only for page/article (shopifyService.js:1516-1522), documented at analysisController.js:794-798 — getResourceFactsForMeta and getPromptCollection were never migrated. Firestore proves the resource type: generateBulk/8CGBH5gK2MPaVjTonizf (shop e78IigJgq1uR8HLYOXXm, section meta-title, totalCount 6, errorCount 1) has exactly one failing item, 346571243693, `type: 'collection'`, `resourceGid: gid://shopify/Collection/346571243693`, `errorMessage: 'HTTPError Response code 404 (Not Found) code=ERR_NON_2XX_3XX_RESPONSE status=404 body={"errors":"Not Found"}'`; the other 5 items (2 page, 1 article, 2 product) all completed in the same job with the same token.

Confidence: `high`

## Code
- `packages/functions/src/helpers/openAI/metaData.js:475` — REST metafield.list with owner_resource 'collection' — the call that 404s; first await on the collection branch of getResourceFactsForMeta
- `packages/functions/src/helpers/openAI/metaData.js:168` — same defect on the FAQ path (getPromptCollection) — explains the 3 faq bulk-generator 500s on 2026-07-31
- `packages/functions/src/services/openAI/index.js:615` — generateMetaContent's first await is buildResourceContext, so the 404 escapes before any OpenRouter call — matches the 464ms request latency with no completion log
- `packages/functions/src/services/openAI/index.js:672` — rethrows after logging '[openAI:generateMetaContent] title Response code 404 (Not Found)'
- `packages/functions/src/controllers/generateBulkController.js:337` — generateAgain calls generateMetaContent for isMeta sections (section 'meta-title')
- `packages/functions/src/controllers/generateBulkController.js:387` — catch sets ctx.status = 500 — the alert's HTTP 500
- `packages/functions/src/services/shopifyService.js:1516` — the already-migrated read path: product/collection metafields over GraphQL, REST kept only for page/article
- `packages/functions/src/controllers/analysisController.js:794` — in-repo comment documenting that REST metafield.list 404s for collections on API 2026-07
- `packages/functions/src/services/shopifyService.js:42` — API_VERSION_PRODUCTION = '2026-07' — the version whose collections model breaks REST metafields

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-03T02:49:41.998Z" AND timestamp<="2026-08-03T03:19:41.998Z" AND httpRequest.requestUrl:"regenerateBulkItem" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-03T02:49:41.998Z" AND timestamp<="2026-08-03T03:19:41.998Z" AND logName:"stderr" AND textPayload:"generateAgain"`
- 13 matching entries: `resource.labels.service_name=~"gen2" AND timestamp>="2026-07-28T00:00:00Z" AND logName:"stderr" AND textPayload:"generateMetaContent"`
- 22 matching entries: `resource.labels.service_name="handlegenfaqsgen2" AND timestamp>="2026-08-03T02:34:30Z" AND timestamp<="2026-08-03T03:03:10Z" AND logName:"stderr"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-28T00:00:00Z" AND httpRequest.requestUrl:"regenerateBulkItem" AND httpRequest.status>=400`

## Job
- analyze rounds: 1
- cost: $5.92
- tests: jest did not run · baseline 9 failing · reproduce check did not pass

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
