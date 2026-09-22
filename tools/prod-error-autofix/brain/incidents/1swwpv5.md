fingerprint: 1swwpv5
service: api
message: [update] xyc3oRZkHw8jzKBFzip0 articleId: 668046393581 update error Error [ERR_FR_MAX_BODY_LENGTH_EXCEEDED]: Request body larger than maxBodyLength limit
app: BLOG
repo: blogs
date: 2026-09-21T20:47:36.988Z
status: fix_disabled
attempt: 1

# BLOG · api · 1swwpv5

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1yxrius / ucdb8c / 6lwjkn (same app, service, shop, article and second; still unfixed on master): one PUT /api/article/668046393581 from shop xyc3oRZkHw8jzKBFzip0 carried an article payload over 10 MB, and articleController.update fans that unbounded payload into two sinks that each have a hard size cap and no guard — the Shopify Admin GraphQL POST (rejected client-side by follow-redirects' 10485760-byte default maxBodyLength, the alerted ERR_FR_MAX_BODY_LENGTH_EXCEEDED) and a full-body Firestore trashArticles write (rejected by the 11534336-byte gRPC Commit cap) — so the merchant's save was lost on both legs.

**Mechanism.** update() builds preparedData from the request body and fires one Promise.all at articleController.js:644 whose first two legs each carry the whole article body. Leg 1 (locale null → primary path): updateShopifyArticle → updateArticlePrimary puts the whole article into GraphQL variables.article (shopifyGraphQlService.js:1245) → makeGraphQlApi's handler (helpers/api.js:126) → api() → the shared axios client created at helpers/api.js:9 with no maxBodyLength/maxContentLength. axios' http adapter only forwards maxBodyLength when config.maxBodyLength > -1, so follow-redirects applies its own 10 * 1024 * 1024 default and throws at RedirectableRequest.write — the exact top frame in the alert stack, whose bottom frames are `at api (/workspace/lib/helpers/api.js:37:17)` and `at handler (/workspace/lib/helpers/api.js:133:25)`, i.e. src/helpers/api.js:126 after babel line shift. shopifyRetryGraphQL logs it at logger.error (helpers/api.js:161) and does NOT retry: 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' is not in RETRYABLE_CODES and there is no e.response.status, so isRetryError at helpers/api.js:165 is false and it rethrows on attempt 0. That is exactly the three logged lines 0.5 ms apart — 20:32:09.206440Z [shopifyRetryGraphQL], .206862Z [updateShopifyArticle] (shopifyGraphQlService.js:1191), .206963Z [update] (articleController.js:733) — one attempt, not five, confirming the no-retry branch. Leg 2: upsertTrashArticle(shop.id, gid, payload) at articleController.js:651 writes the same full payload into trashArticles even though nothing was deleted; docRef.update (trashArticleRepository.js:27) exceeds the Firestore Commit limit and its own catch (trashArticleRepository.js:41) swallows it into the 20:32:09.841487Z line '3 INVALID_ARGUMENT: Request payload size exceeds the limit: 11534336 bytes.' — same shop, same gid, 0.635 s later. requests=0 in the window because update() answers HTTP 200 with {success:false} by design (articleController.js:733-737), so no 5xx request log exists; the alert is the application ERROR line, not a failed request. Still unfixed: `grep -rn 'maxBodyLength|maxContentLength' packages/functions/src/` returns zero hits on this worktree.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:644` — the Promise.all that fans the same oversized payload into both the Shopify write and the Firestore trash write
- `packages/functions/src/controllers/articleController.js:651` — upsertTrashArticle(shop.id, gid, payload) — whole article body written to trashArticles on every ordinary save
- `packages/functions/src/controllers/articleController.js:733` — the catch that emitted the alerted '[update] xyc3oRZkHw8jzKBFzip0 articleId: 668046393581 update error' line
- `packages/functions/src/helpers/api.js:9` — const client = axios.create() — no maxBodyLength/maxContentLength, so follow-redirects' 10 MB default governs every Shopify GraphQL POST
- `packages/functions/src/helpers/api.js:126` — makeGraphQlApi's handler — the frame the prod stack names as lib/helpers/api.js:133
- `packages/functions/src/helpers/api.js:161` — logger.error('[shopifyRetryGraphQL]', e) — the first of the three 20:32:09.20xZ lines
- `packages/functions/src/helpers/api.js:165` — retryability from RETRYABLE_CODES/e.response.status; ERR_FR matches neither, so one attempt then rethrow
- `packages/functions/src/services/shopifyGraphQlService.js:1245` — updateArticlePrimary posts the full article as GraphQL variables.article — the >10 MB body
- `packages/functions/src/services/shopifyGraphQlService.js:1191` — [updateShopifyArticle] logger.error — the middle of the three ERR_FR lines
- `packages/functions/src/repositories/trashArticleRepository.js:27` — docRef.update({...data}) with no size check — the Commit that exceeded 11534336 bytes
- `packages/functions/src/repositories/trashArticleRepository.js:41` — catch swallows the failed trash write into a logger.error, so update() never learns the snapshot was lost

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.101Z" AND timestamp<="2026-09-21T20:47:14.101Z" AND jsonPayload.error.code="ERR_FR_MAX_BODY_LENGTH_EXCEEDED"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.101Z" AND timestamp<="2026-09-21T20:47:14.101Z" AND jsonPayload.tag="[upsertTrashArticle]"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T20:17:14.101Z" AND timestamp<="2026-09-21T20:47:14.101Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.52

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
