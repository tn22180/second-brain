fingerprint: 1yxrius
service: api
message: [updateShopifyArticle] xyc3oRZkHw8jzKBFzip0 668046393581 Error [ERR_FR_MAX_BODY_LENGTH_EXCEEDED]: Request body larger than maxBodyLength limit
app: BLOG
repo: blogs
date: 2026-09-21T20:46:07.309Z
status: fix_disabled
attempt: 1

# BLOG · api · 1yxrius

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** One PUT /api/article/668046393581 from shop xyc3oRZkHw8jzKBFzip0 carried an article payload over 10 MB, and articleController.update fans that unbounded payload into two sinks that each have a hard size cap and no guard — the Shopify Admin GraphQL POST (rejected client-side by follow-redirects' 10485760-byte default maxBodyLength, the alerted ERR_FR_MAX_BODY_LENGTH_EXCEEDED) and a full-body Firestore trashArticles write (rejected by the 11534336-byte gRPC Commit cap) — so the merchant's save was lost on both legs.

**Mechanism.** update() builds preparedData from the request body and fires one Promise.all at articleController.js:644 whose first two legs each carry the whole article body. Leg 1 (locale null → primary path): updateShopifyArticle → updateArticlePrimary puts the whole article into GraphQL `variables.article` (shopifyGraphQlService.js:1249) → makeGraphQlApi (helpers/api.js:126) → api() → the shared axios 0.27 client created at helpers/api.js:9 with no maxBodyLength/maxContentLength. axios' http adapter only forwards maxBodyLength when config.maxBodyLength > -1, so follow-redirects applies its own 10 * 1024 * 1024 default and throws at RedirectableRequest.write (the exact top frame in the alert stack) before a byte reaches Shopify. shopifyRetryGraphQL logs it at logger.error (helpers/api.js:161) and does NOT retry — 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' is not in RETRYABLE_CODES and there is no e.response.status, so the isRetryError test at helpers/api.js:165 is false and it rethrows on attempt 0. That is exactly the three logged lines 0.5 ms apart: 20:32:09.206440Z [shopifyRetryGraphQL] (the alerted one), .206862Z [updateShopifyArticle] (shopifyGraphQlService.js:1191), .206963Z [update] (articleController.js:733) — one attempt, not five, confirming the no-retry branch. Leg 2: upsertTrashArticle(shop.id, gid, payload) at articleController.js:651 writes the same full payload into trashArticles even though nothing was deleted; docRef.update (trashArticleRepository.js:27) exceeds the Firestore Commit limit and its own catch (trashArticleRepository.js:41) swallows it into the 20:32:09.841487Z line '3 INVALID_ARGUMENT: Request payload size exceeds the limit: 11534336 bytes.' — same shop, same gid, 0.635 s later. requests=0 in the window because update() answers HTTP 200 with {success:false} by design (articleController.js:734-737), so no 5xx request log exists; the alert is the application ERROR line, not a failed request.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:644` — the Promise.all that fans the same oversized payload into both the Shopify write and the Firestore trash write
- `packages/functions/src/controllers/articleController.js:651` — upsertTrashArticle(shop.id, gid, payload) — the whole article body written to trashArticles on every ordinary save
- `packages/functions/src/controllers/articleController.js:733` — the catch that emitted '[update] xyc3oRZkHw8jzKBFzip0 articleId: 668046393581 update error' with the same ERR_FR stack
- `packages/functions/src/helpers/api.js:9` — const client = axios.create() — no maxBodyLength/maxContentLength anywhere, so follow-redirects' 10 MB default applies to every Shopify GraphQL POST
- `packages/functions/src/helpers/api.js:126` — makeGraphQlApi's handler posts graphqlQuery through that unbounded client
- `packages/functions/src/helpers/api.js:161` — logger.error('[shopifyRetryGraphQL]', e) — the exact alerted log line
- `packages/functions/src/helpers/api.js:165` — retryability decided by RETRYABLE_CODES.includes(e.code) || RETRYABLE_STATUSES.includes(e.response?.status); ERR_FR_MAX_BODY_LENGTH_EXCEEDED matches neither, so it rethrows after one attempt
- `packages/functions/src/services/shopifyGraphQlService.js:1249` — updateArticlePrimary posts the full article as GraphQL variables — the request whose body exceeded 10 MB
- `packages/functions/src/services/shopifyGraphQlService.js:1191` — [updateShopifyArticle] logger.error that emitted the middle of the three ERR_FR lines
- `packages/functions/src/repositories/trashArticleRepository.js:27` — docRef.update({...data}) with no size check — the Firestore Commit that exceeded 11534336 bytes
- `packages/functions/src/repositories/trashArticleRepository.js:41` — catch swallows the failed trash write into a logger.error and returns undefined, so update() never learns the snapshot was lost

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.094Z" AND timestamp<="2026-09-21T20:47:14.094Z" AND jsonPayload.error.code="ERR_FR_MAX_BODY_LENGTH_EXCEEDED"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.094Z" AND timestamp<="2026-09-21T20:47:14.094Z" AND jsonPayload.tag="[upsertTrashArticle]"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.094Z" AND timestamp<="2026-09-21T20:47:14.094Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.16

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
