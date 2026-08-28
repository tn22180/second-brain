fingerprint: nb3ce
service: apigen2
message: HTTP 500 POST /api/aiChat/faqs
app: SEO
repo: seo
date: 2026-08-28T02:15:06.781Z
status: fix_disabled
attempt: 4

# SEO · apigen2 · nb3ce

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getPromptCollection reads collection metafields over Shopify REST (shopify.metafield.list with metafield[owner_resource]=collection), which returns HTTP 404 {"errors":"Not Found"} on API 2026-07 for shops on Shopify's new collections model, so every FAQ generation for a collection throws before any AI call and surfaces as HTTP 500.

**Mechanism.** POST /api/aiChat/faqs (type=faqs) -> aiChatController.getMetaSuggestion dispatches getFaqs(request, shop) (aiChatController.js:79). getFaqs takes the collection branch and calls getPromptCollection (services/openAI/index.js:557). Its first outbound call is the REST metafield.list at helpers/openAI/metaData.js:190-192; Shopify answers 404 with body {"errors":"Not Found"} (got timings firstByte 98ms, total 101ms — a real HTTP round trip, not a client-side throw). getFaqs' catch logs '[openAI:getFaqs] SsVJt1tsaqSL7yM9DOOE HTTPError Response code 404 (Not Found) code=ERR_NON_2XX_3XX_RESPONSE status=404 body={"errors":"Not Found"}' at 04:19:29.769207Z and rethrows (index.js:570-571); getMetaSuggestion's catch logs at 04:19:29.770241Z and does ctx.throw(error.status || 500) (aiChatController.js:102) — got's HTTPError carries no .status (it lives on e.response.statusCode), so the 404 is remapped to 500; [unhandledError] POST /api/aiChat/faqs 500 lands at 04:19:29.773861Z, matching the request log start 04:19:29.283012Z + latency 0.492260687s. The same code path via /api/audit-agent/fix-issue (FAQS_ASSESSMENT) produced the third failure, logged as '[fixAuditIssue] ... Response code 404' at 04:19:04.895337Z. The client and token are healthy and the API version is fine: four GET /api/analysis/collection/407494344 requests for the same shop and the same collection returned 200 in the same 4-minute window, and that route reads the identical metafields through getAllMetafields (services/shopifyService.js:1568), which already routes 'product'/'collection' to GraphQL and keeps REST only for 'page'/'article' — with an in-repo comment naming this exact 404 (controllers/analysisController.js:807-810). The FAQ prompt builders never received that fix. Resource-type split over 48h confirms the scope: 90 of 90 FAQ calls from a /product/ referer returned 201, while the only 500s came from the /collection/ referer.

Confidence: `high`

## Code
- `packages/functions/src/helpers/openAI/metaData.js:190` — getPromptCollection's REST shopify.metafield.list for owner_resource='collection' — the call that returns 404 on API 2026-07 for new-collections-model shops
- `packages/functions/src/services/openAI/index.js:557` — getFaqs takes the collection branch and invokes getPromptCollection on this route
- `packages/functions/src/services/openAI/index.js:570` — the '[openAI:getFaqs] ... status=404 body={"errors":"Not Found"}' line logged at 04:19:29.769207Z
- `packages/functions/src/services/openAI/index.js:571` — getFaqs rethrows the 404 instead of degrading to an empty metafield list
- `packages/functions/src/controllers/aiChatController.js:79` — the faqs handler that calls getFaqs for POST /api/aiChat/faqs
- `packages/functions/src/controllers/aiChatController.js:102` — ctx.throw(error.status || 500) — got's HTTPError has no .status, so the Shopify 404 is reported to the merchant as HTTP 500
- `packages/functions/src/services/shopifyService.js:1568` — getAllMetafields already routes product/collection to GraphQL and REST only for page/article — the wrapper the FAQ prompt builder is missing
- `packages/functions/src/controllers/analysisController.js:807` — in-repo comment documenting that REST metafield.list 404s for collections on Shopify's new collections model (API 2026-07)

## Evidence
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-26T04:04:32.235Z" AND timestamp<="2026-08-26T04:34:32.235Z" AND textPayload:"[openAI:getFaqs]"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-26T04:04:32.235Z" AND timestamp<="2026-08-26T04:34:32.235Z" AND textPayload:"[fixAuditIssue]"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.requestUrl:"/api/aiChat/faqs" AND httpRequest.status=500`
- 90 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.requestUrl:"/api/aiChat/faqs" AND httpRequest.status=201 AND httpRequest.referer:"/product/"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-26T04:17:00Z" AND timestamp<="2026-08-26T04:21:00Z" AND httpRequest.requestUrl:"/api/analysis/collection/407494344" AND httpRequest.status=200`
- 15 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND textPayload:"Response code 404 (Not Found)"`

## Job
- analyze rounds: 3
- cost: $8.01

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
