fingerprint: cc6ylg
service: apisagen2
message: HTTP 500 POST /apiSa/optimize/start
app: SEO
repo: seo
date: 2026-09-09T02:46:01.805Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · cc6ylg

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /apiSa/optimize/start returned 500 for shop I3yH6dXvmClplCf6eEvU because Shopify Admin GraphQL answered one of checkIsStoreFullStorage's three bare, unretried `shopify.graphql()` calls with an in-band error body (`extensions.code: 'BAD_GATEWAY'`, message "There was a problem loading this website. Please try again."), and neither the helper nor startOptimize catches it.

**Mechanism.** Request started 2026-09-09T02:41:39.301477Z. At 3.541s in (got timings.start=1788921702842 = 02:41:42.842) a shopify-api-node `.graphql()` POST was issued; Shopify answered HTTP 200 after firstByte 4242ms with a body carrying an `errors` array, so shopify-api-node's `maybeError` (node_modules/shopify-api-node/index.js:299) threw `RequestError: There was a problem loading this website. Please try again.` decorated with `extensions: {code: 'BAD_GATEWAY'}`. 3.541s + 4.246s = 7.787s, matching the request's 7.785526125s latency exactly — this call was the last thing the request did. The only shopify-api-node `.graphql()` calls reachable before that point are the three unguarded ones in checkIsStoreFullStorage (fileCreate :7, fileUpdate :35, fileDelete :60); getProductCount goes over axios/makeGraphQlApi and swallows every error (`return 0`, productCount.js:16-18), and checkOtmDevZone only writes Firestore. The 3.541s offset lines up with the hard-coded `await delay(3000)` at checkIsStoreFullStorage.js:34 plus a sub-second fileCreate, pointing at the fileUpdate call. The helper has no try/catch and seoController.startOptimize:758 awaits it bare, so the throw unwound through the controller into errorHandler ('[unhandledError] POST /apiSa/optimize/start 500', errorHandler.js:18). Proof the failure is upstream of the optimize run itself: `logger.warn` is visible in prod (logger.js:19 sets level 'warn' for production) and `[startOptimizeImage] CALLED_BY_FE` (startOptimizeImage.js:24) matched exactly once in the whole 30-minute window — at 02:42:13.295670Z, the merchant's successful manual retry 34s later — and not at 02:41:4x. Note shopifyRetryGraphQL would not have saved this either: an HTTP-200 in-band error carries no statusCode, `isThrownGraphqlThrottle` is false for BAD_GATEWAY, so `isRetryError` at shopifyService.js:608 evaluates false and it rethrows on attempt 0.

Confidence: `high`

## Code
- `packages/functions/src/helpers/optimize/checkIsStoreFullStorage.js:35` — Second bare `shopify.graphql()` (fileUpdate), issued immediately after the delay(3000) on the preceding line — matches the 3.541s offset of the failing got request.
- `packages/functions/src/helpers/optimize/checkIsStoreFullStorage.js:34` — `await delay(3000)` — the hard-coded 3s that accounts for the gap between request start and the failing Shopify call.
- `packages/functions/src/helpers/optimize/checkIsStoreFullStorage.js:7` — First bare `shopify.graphql()` (fileCreate); the whole helper has no try/catch, so any of its three calls throwing takes down the request.
- `packages/functions/src/controllers/seoController.js:758` — `if (!shop.skipStorageCheck && (await checkIsStoreFullStorage(shop)))` — awaited bare inside startOptimize, which has no try/catch, so the throw becomes a 500 instead of a `{success:false}` body.
- `packages/functions/src/helpers/graphql/product/productCount.js:16` — getProductCount's catch returns 0 for every failure, ruling it out as the source of an escaping throw on the same code path.
- `packages/functions/src/services/optimize/startOptimizeImage.js:24` — The CALLED_BY_FE logger.warn whose absence at 02:41:4x proves the 500 happened before startOptimizeImage was entered.
- `packages/functions/src/helpers/logger.js:19` — defaultLevel = 'warn' in production — so that missing CALLED_BY_FE line is real absence, not level filtering.
- `packages/functions/src/services/shopifyService.js:608` — isRetryError only covers statusCode 429/502/503/520; an HTTP-200 in-band BAD_GATEWAY has no statusCode, so simply wrapping the calls in shopifyRetryGraphQL would still rethrow on attempt 0.

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-09T02:41:39Z" AND timestamp<="2026-09-09T02:41:48Z" AND logName:"stderr" AND textPayload:"ERR_GOT_REQUEST_ERROR"`
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-09T02:27:02Z" AND timestamp<="2026-09-09T02:57:02Z" AND logName:"stderr" AND textPayload:"startOptimizeImage] CALLED_BY_FE"`
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-09T02:27:02.739Z" AND timestamp<="2026-09-09T02:57:02.739Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.42

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
