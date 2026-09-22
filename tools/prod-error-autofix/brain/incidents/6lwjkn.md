fingerprint: 6lwjkn
service: api
message: [shopifyRetryGraphQL] Error [ERR_FR_MAX_BODY_LENGTH_EXCEEDED]: Request body larger than maxBodyLength limit
app: BLOG
repo: blogs
date: 2026-09-21T20:43:23.532Z
status: fix_disabled
attempt: 1

# BLOG · api · 6lwjkn

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint ucdb8c (same app/service/shop/article/second, no fix on master): one PUT /api/article/668046393581 from shop xyc3oRZkHw8jzKBFzip0 carried an article payload over 10 MB, and articleController.update fans that unbounded payload into two sinks with no size guard — the Shopify Admin GraphQL POST, rejected by follow-redirects' 10485760-byte default maxBodyLength (ERR_FR_MAX_BODY_LENGTH_EXCEEDED, the alerted line), and a full-body Firestore trashArticles snapshot, rejected by the 11534336-byte gRPC request cap.

**Mechanism.** update() builds preparedData from the request body and fires one Promise.all (articleController.js:644) whose first two legs each carry the whole article body. Leg 1 (locale null → primary path): updateShopifyArticle → updateArticlePrimary → makeGraphQlApi → api() → the shared axios 0.27.2 client at helpers/api.js:28, which sets no maxBodyLength; axios http adapter only forwards maxBodyLength when config.maxBodyLength > -1 (node_modules/axios/lib/adapters/http.js:253), so follow-redirects applies its own 10 * 1024 * 1024 default (node_modules/follow-redirects/index.js:517) and throws at RedirectableRequest.write (index.js:171) before a byte reaches Shopify. shopifyRetryGraphQL logs it at logger.error and does not retry — 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' is not in RETRYABLE_CODES and there is no e.response.status (helpers/api.js:165) — so it rethrows on attempt 0, producing exactly the three logged lines at 20:32:09.206440Z [shopifyRetryGraphQL] (the alerted one), .206862Z [updateShopifyArticle] (shopifyGraphQlService.js:1191) and .206963Z [update] (articleController.js:733). Leg 2: upsertTrashArticle(shop.id, gid, payload) (articleController.js:651) writes the same full payload into trashArticles even though nothing was deleted; docRef.update (trashArticleRepository.js:27) exceeds the Firestore Commit limit and its own catch (trashArticleRepository.js:41) swallows it into the 20:32:09.841487Z line '3 INVALID_ARGUMENT: Request payload size exceeds the limit: 11534336 bytes.' — same shop, same gid, 0.635s later. Both legs lost, so the merchant's save was total data loss; requests=0 in the window because update() answers HTTP 200 with {success:false} by design (articleController.js:734-737). Only the sink's fingerprint differs from ucdb8c: it matched the [shopifyRetryGraphQL] line this time instead of [upsertTrashArticle].

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:644` — the Promise.all that fans the same oversized payload into both the Shopify write and the Firestore trash write
- `packages/functions/src/controllers/articleController.js:651` — upsertTrashArticle(shop.id, gid, payload) — whole article body written to trashArticles on every ordinary save
- `packages/functions/src/controllers/articleController.js:733` — the catch that logged [update] xyc3oRZkHw8jzKBFzip0 articleId: 668046393581 update error with the same ERR_FR stack
- `packages/functions/src/helpers/api.js:28` — shared axios client used for every Shopify GraphQL POST; no maxBodyLength/maxContentLength set anywhere in the repo, so follow-redirects' 10 MB default applies
- `packages/functions/src/helpers/api.js:165` — retryability decided by e.code ∈ RETRYABLE_CODES or e.response.status — ERR_FR_MAX_BODY_LENGTH_EXCEEDED matches neither, so one log line, not five
- `packages/functions/src/services/shopifyGraphQlService.js:1249` — updateArticlePrimary posts the full article as GraphQL variables through makeGraphQlApi — the request whose body exceeded 10 MB
- `packages/functions/src/services/shopifyGraphQlService.js:1191` — [updateShopifyArticle] logger.error that emitted the middle of the three ERR_FR lines
- `packages/functions/src/repositories/trashArticleRepository.js:27` — docRef.update({...data}) with no size check — the Firestore Commit that exceeded 11534336 bytes
- `packages/functions/src/repositories/trashArticleRepository.js:41` — catch swallows the failed trash write into a logger.error and returns undefined, so update() never learns the snapshot was lost

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.968Z" AND timestamp<="2026-09-21T20:47:13.968Z" AND jsonPayload.error.code="ERR_FR_MAX_BODY_LENGTH_EXCEEDED"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.968Z" AND timestamp<="2026-09-21T20:47:13.968Z" AND jsonPayload.tag="[upsertTrashArticle]"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.968Z" AND timestamp<="2026-09-21T20:47:13.968Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $2.12

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
