fingerprint: 1flj6a
service: api
message: [fetchAllImagesFromShopify] PnKC4q13qtMCeY1BDfEz Error fetching images HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:11:11.090Z
status: fix_disabled
attempt: 1

# BLOG · api · 1flj6a

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin GraphQL brownouted HTTP 500 to api instance 00a41e8c1d6dd670 during 08:35–08:38Z, and fetchAllImagesFromShopify issues its files(first:250) page through a bare initShopify(shop).graphql() with no retry wrapper, then swallows the failure with logger.error + break — so GET /api/get-list-ai-image answered HTTP 200 success:true with a silently truncated (here empty) image list for shop PnKC4q13qtMCeY1BDfEz instead of failing or retrying.

**Mechanism.** The alerted line is imageGeneration.service.js:149, fired 3× (08:35:29.109685Z, 08:36:31.982258Z, 08:38:00.254475Z), all for shop PnKC4q13qtMCeY1BDfEz, all on one instance/revision (00a41e8c1d6dd670 / api-00166-zis — 44 of the window's 47 ERROR lines). The window is the recorded 2026-09-06 08:35–08:46Z Shopify Admin brownout family (fingerprints 4nac83 / 13fxio6 / a2foaq / gnx4is): the same got stack (got/as-promise/index.js:118) also hit [setupTemplates] 3×, [getMainThemeId] 4×, [getShopifyRecentBlogs] 1×, [getOne] 2×, [syncShopDataFromShopify] 4× in the same minutes. Chain: fetchAllImagesFromShopify builds its client at imageGeneration.service.js:93 via initShopify (shopifyService.js:23 — plain new Shopify({autoLimit:true}), no retry), issues the page at imageGeneration.service.js:141 as a bare shopify.graphql(), and its catch at 148-151 logs and `break`s the pagination loop, so line 154 returns whatever allImages held — [] when page 1 is the one that fails. getListImageAiGraphql then falls into its empty branch (imageGeneration.service.js:192-204) and genImageAIController.get sets ctx.status = 200 with success:true at genImageAIController.js:92. Proof it never became a request failure: all 3 request-log 500s in the window are GET /api/shops (08:35:21.378491Z, 08:46:24.108592Z, 08:46:25.188516Z — the syncShopDataFromShopify unhandled-rejection cause already recorded as a2foaq), none is /api/get-list-ai-image, and the errors read carries zero `[get]` lines, i.e. genImageAIController.js:98's catch never ran. Proof the failure was retryable and this call site simply opted out: helpers/api.js:145 lists 500 in RETRYABLE_STATUSES and the retry path logged 25 [shopifyRetryGraphQL] lines in the same window — but only for callers going through makeGraphQlApi (helpers/api.js:128). Second, narrower defect on the same line: helpers/api.js:165 tests `e.response?.status`, which got never sets (got carries e.response.statusCode — isShopifyAuthError at helpers/api.js:152 already handles both), so merely wrapping this shopify.graphql() call in shopifyRetryGraphQL would still not retry a got 500.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:141` — bare shopify.graphql() page fetch, no shopifyRetryGraphQL/makeGraphQlApi wrapper — where the Shopify 500 lands
- `packages/functions/src/services/imageGeneration.service.js:149` — emits the exact alerted line `[fetchAllImagesFromShopify] <shopId> Error fetching images`, 3× in window
- `packages/functions/src/services/imageGeneration.service.js:150` — `break` swallows the transport failure — turns a Shopify outage into a short/empty result set
- `packages/functions/src/services/imageGeneration.service.js:154` — returns the truncated allImages with no partial/error flag, so no caller can tell a real empty library from a failed sweep
- `packages/functions/src/services/imageGeneration.service.js:192` — empty branch of getListImageAiGraphql returns totalItems:0 pagination for the swallowed failure
- `packages/functions/src/controllers/genImageAIController.js:92` — ctx.status = 200 / success:true — merchant is told they have no AI images; no `[get]` error line in the window proves this branch, not the catch at :98, ran
- `packages/functions/src/services/shopifyService.js:23` — initShopify returns a plain shopify-api-node (got) client with no retry — the client used at imageGeneration.service.js:93
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES includes 500 — the brownout was retryable, which is why 25 [shopifyRetryGraphQL] lines exist while this call site logged one per attempt
- `packages/functions/src/helpers/api.js:165` — retryability read from e.response?.status only; got sets e.response.statusCode, so wrapping this call site alone would not retry — must read both, as isShopifyAuthError already does

## Evidence
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:30.081Z" AND timestamp<="2026-09-06T08:50:30.081Z" AND jsonPayload.tag="[fetchAllImagesFromShopify]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:30.081Z" AND timestamp<="2026-09-06T08:50:30.081Z" AND httpRequest.status=500`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:30.081Z" AND timestamp<="2026-09-06T08:50:30.081Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:30.081Z" AND timestamp<="2026-09-06T08:50:30.081Z" AND jsonPayload.tag="[getMainThemeId]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:30.081Z" AND timestamp<="2026-09-06T08:50:30.081Z" AND jsonPayload.tag="[setupTemplates]"`

## Job
- analyze rounds: 1
- cost: $1.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
