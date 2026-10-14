fingerprint: h8gdku
service: mcpgen2
message: HTTP 500 POST /mcp/s/levitatious.myshopify.com
app: SEO
repo: seo
date: 2026-10-14T04:52:26.938Z
status: fix_disabled
attempt: 1

# SEO · mcpgen2 · h8gdku

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The `analysis` docs for levitatious.myshopify.com's products store `faqs: null`, and `updateByType` only defaults `faqs` when it is `undefined`, so `faqs.isFAQsSet` throws a TypeError midway through the function — after the Shopify `productUpdate` promise has already been pushed into the un-awaited `handlers` array, leaving that promise's "Title can't be blank" rejection unhandled, which the functions framework turns into HTTP 500.

**Mechanism.** POST /mcp/s/levitatious.myshopify.com → audit_resource batch of 10 products → updateAnalysisResource → updateByType(shop, 'product', {...analysisData, ...data}). At analysisRepository.js:394 the destructuring default `faqs = {}` fires only for `undefined`; the stored value is `null`, and sanitizeFaqs(null) returns null unchanged (sanitizeFaqHtml.js:71, asserted by its own test sanitizeFaqHtml.test.js:118). Execution reaches analysisRepository.js:688 `faqs.isFAQsSet` and throws `TypeError: Cannot read properties of null (reading 'isFAQsSet')` — logged 21 times by the catch at updateByType and rethrown 21 times into auditResource.js:149, which swallows it and returns ok:false so the loop keeps going. But by line 476 the primary-locale branch had already *dispatched* `updateProductById(...)` and `upsertTranslationSubcollection(...)` into `handlers` with no `.catch` (unlike upsertMetafields at :719, which has one), and the only `await Promise.all([...handlers, ...])` sits at :827 — downstream of the throw. So those promises are orphaned: the logs show `[upsertTranslationSubcollection] success 9287357956331` at 04:47:43.036, 88ms AFTER updateByType already rethrew for that same id at 04:47:42.948. The orphaned productUpdate rejects with Shopify's userError `Title can't be blank` (thrown at updateProductById.js:21, because the stored analysis title is also null/blank). 19 of those 21 rejections land after the response and are logged `Exception from a finished function: Error: Title can't be blank`; the first one in each request lands in-flight and is logged bare — at 04:47:37.311570 and 04:47:43.193463, which equal requestStart+latency (36.254097+1.056883=37.310980; 42.428086+0.762732=43.190818) to within 0.6ms and 2.6ms. Both of the window's 2 requests 500 at exactly that instant. The loop then keeps running on the dead request and the MCP transport logs `ERR_HTTP_HEADERS_SENT` twice (04:47:40.645, 04:47:46.649), right after index 9 of each batch.

Confidence: `high`

## Code
- `packages/functions/src/repositories/analysisRepository.js:688` — `faqs.isFAQsSet` — the throw site; faqs is null here, producing the TypeError in all 42 matching log lines
- `packages/functions/src/repositories/analysisRepository.js:394` — `faqs = {}` destructuring default covers undefined only, not the stored null
- `packages/functions/src/helpers/faq/sanitizeFaqHtml.js:71` — sanitizeFaqs returns null unchanged, so the :403 sanitize pass does not normalize it
- `packages/functions/src/repositories/analysisRepository.js:476` — updateProductById is pushed into `handlers` with no .catch, before the throw site at :688
- `packages/functions/src/repositories/analysisRepository.js:827` — the only await of `handlers` sits after :688, so the throw orphans every already-dispatched promise
- `packages/functions/src/helpers/graphql/product/updateProductById.js:21` — throws `Title can't be blank` from productUpdate userErrors — the unhandled rejection that 500s the request
- `packages/functions/src/services/mcp/auditResource.js:149` — catch swallows the TypeError and the batch loop continues on an already-killed HTTP request

## Evidence
- 42 matching entries: `(resource.labels.service_name="mcpgen2") AND timestamp>="2026-10-14T04:32:48.925Z" AND timestamp<="2026-10-14T05:02:48.925Z" AND logName:"stderr" AND textPayload:"isFAQsSet"`
- 21 matching entries: `(resource.labels.service_name="mcpgen2") AND timestamp>="2026-10-14T04:32:48.925Z" AND timestamp<="2026-10-14T05:02:48.925Z" AND logName:"stderr" AND textPayload:"Title can't be blank"`
- 2 matching entries: `(resource.labels.service_name="mcpgen2") AND timestamp>="2026-10-14T04:32:48.925Z" AND timestamp<="2026-10-14T05:02:48.925Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="mcpgen2") AND timestamp>="2026-10-14T04:32:48.925Z" AND timestamp<="2026-10-14T05:02:48.925Z" AND logName:"stderr" AND textPayload:"ERR_HTTP_HEADERS_SENT"`
- 21 matching entries: `(resource.labels.service_name="mcpgen2") AND timestamp>="2026-10-14T04:32:48.925Z" AND timestamp<="2026-10-14T05:02:48.925Z" AND logName:"stderr" AND textPayload:"upsertTranslationSubcollection] success"`

## Job
- analyze rounds: 1
- cost: $1.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
