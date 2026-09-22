fingerprint: ucdb8c
service: api
message: [upsertTrashArticle] xyc3oRZkHw8jzKBFzip0 <gid://shopify/Article/668046393581> 3 INVALID_ARGUMENT: Request payload size exceeds the limit: 11534336 bytes.
app: BLOG
repo: blogs
date: 2026-09-21T20:41:09.386Z
status: fix_disabled
attempt: 1

# BLOG · api · ucdb8c

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** One PUT /api/article/668046393581 from shop xyc3oRZkHw8jzKBFzip0 carried an article payload larger than 10 MB, and articleController.update writes that same unbounded payload to two sinks with no size guard — the Shopify Admin GraphQL POST (rejected by follow-redirects' 10 MB maxBodyLength, ERR_FR_MAX_BODY_LENGTH_EXCEEDED) and a full-body Firestore trashArticles snapshot (rejected by the Firestore gRPC 11534336-byte request cap, 3 INVALID_ARGUMENT).

**Mechanism.** update() builds `preparedData` from the request body and fires one Promise.all (articleController.js:644) whose first two legs both carry the whole article body. Leg 1: updateShopifyArticle -> updateArticlePrimary -> makeGraphQlApi -> api() -> the shared axios 0.27.2 client (helpers/api.js:28), which sets no maxBodyLength, so follow-redirects@1.16.0 applies its 10485760-byte default and throws ERR_FR_MAX_BODY_LENGTH_EXCEEDED at index.js:171 before a byte reaches Shopify — logged three times at 20:32:09.2064/.2068/.2069Z by [shopifyRetryGraphQL], [updateShopifyArticle] and [update]; shopifyRetryGraphQL does not retry it because 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' is not in RETRYABLE_CODES and there is no e.response.status, so it throws on the first attempt (one log line, not five). Leg 2: upsertTrashArticle(shop.id, gid, payload) (articleController.js:651) stores the same full payload as a trashArticles document even though nothing was deleted; docRef.update (trashArticleRepository.js:27) exceeds the Firestore Commit gRPC limit of 11534336 bytes and the repo's own catch swallows it into the alerted line at 20:32:09.841Z (trashArticleRepository.js:41). Both legs lost, so the save was a total data loss for the merchant; requests=0 in the window because update() answers HTTP 200 with {success:false} by design.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:644` — the Promise.all that fans the same oversized payload into the Shopify write and the Firestore trash write
- `packages/functions/src/controllers/articleController.js:651` — upsertTrashArticle(shop.id, gid, payload) — writes the entire article body to trashArticles on every ordinary save; this is the call that produced the alerted line
- `packages/functions/src/repositories/trashArticleRepository.js:27` — docRef.update({...data}) with no size check — the Firestore Commit that exceeded 11534336 bytes
- `packages/functions/src/repositories/trashArticleRepository.js:41` — the catch that turns the failed trash write into a logger.error and returns undefined, so update() never learns the snapshot was lost
- `packages/functions/src/helpers/api.js:28` — the shared axios client used for every Shopify GraphQL POST; no maxBodyLength/maxContentLength is set anywhere in the repo, so follow-redirects' 10 MB default applies
- `packages/functions/src/helpers/api.js:154` — shopifyRetryGraphQL classifies retryability by e.code/e.response.status only; ERR_FR_MAX_BODY_LENGTH_EXCEEDED matches neither, so it is logged at error and rethrown on attempt 0
- `packages/functions/src/services/shopifyGraphQlService.js:1189` — updateArticlePrimary is the path taken (locale was null), and its wrapper logged [updateShopifyArticle] xyc3oRZkHw8jzKBFzip0 668046393581 with the same error

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.543Z" AND timestamp<="2026-09-21T20:47:13.543Z" AND jsonPayload.tag="[upsertTrashArticle]"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.543Z" AND timestamp<="2026-09-21T20:47:13.543Z" AND jsonPayload.error.code="ERR_FR_MAX_BODY_LENGTH_EXCEEDED"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:13.543Z" AND timestamp<="2026-09-21T20:47:13.543Z" AND severity>=ERROR`

## Job
- analyze rounds: 3
- cost: $4.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
