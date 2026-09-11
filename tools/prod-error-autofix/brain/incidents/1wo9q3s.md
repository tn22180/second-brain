fingerprint: 1wo9q3s
service: api
message: [getProductByCollections] EhMrwQNznWdKn3qRXupC undefined RequestError: Invalid global id 'undefined'
app: BLOG
repo: blogs
date: 2026-09-10T16:56:21.318Z
status: fix_disabled
attempt: 1

# BLOG · api · 1wo9q3s

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /api/shopify/productByCollections was called with the literal query string collectionId=undefined (SettingSelectProduct.js passes a possibly-undefined dynamicProductSetting.idCollection into a template-string URL), the controller has no gid validation, so the string "undefined" is interpolated into node(id: "undefined") and Shopify Admin rejects it with RequestError: Invalid global id 'undefined' — which the catch logs at severity ERROR even though the request itself answers HTTP 200.

**Mechanism.** Request log at 2026-09-10T15:30:54.304409Z: GET .../api/shopify/productByCollections?collectionId=undefined&isShowCollectionType=false → status 200, latency 0.382811483s. That query string comes from packages/assets/src/pages/Blog/BlogSettingLeft/TabProductDynamic/SettingSelectProduct.js:215, which interpolates `collectionId` into the URL with no guard; its caller at line 181 passes dynamicProductSetting.idCollection, which is undefined when no collection is saved — the in-code comment at line 183 states the missing/invalid/deleted id case is expected and handled by falling through to the /dev_zone resync. Server side, shopifyController.js:361 destructures `const {collectionId = ''} = ctx.query`; the default never fires because the key is present with the string "undefined". collectionId is passed unvalidated to getProductByCollectionsGraphQL (shopifyController.js:364), which splices it raw into `node(id: "${collectionId}")` at graphQLProducts.js:161. shopify.graphql (graphQLProducts.js:206) gets Shopify's 400 `Invalid global id 'undefined'` (ERR_GOT_REQUEST_ERROR), logs and rethrows at graphQLProducts.js:212, and the controller catch logs `[getProductByCollections] EhMrwQNznWdKn3qRXupC undefined <err>` at shopifyController.js:385 then returns 200 `{success:false}` at line 386. Both alerted ERROR lines carry the same execution_id voplgl8yz8so at 15:30:54.688Z — one request, two log lines, no 5xx.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:361` — `const {collectionId = ''} = ctx.query` — the default only covers a missing key, so the literal string "undefined" passes through unvalidated; no gid:// shape check anywhere before the Shopify call
- `packages/functions/src/controllers/shopifyController.js:364` — passes the unvalidated collectionId straight to getProductByCollectionsGraphQL
- `packages/functions/src/controllers/shopifyController.js:385` — logger.error that produced the alerted line; fires for pure caller-side bad input while the response is still HTTP 200 {success:false} on the next line
- `packages/functions/src/helpers/graphql/graphQLProducts.js:161` — `node(id: "${collectionId}")` — raw interpolation of the caller-supplied value into the GraphQL document; produces node(id: "undefined") and Shopify's `Invalid global id 'undefined'`
- `packages/functions/src/helpers/graphql/graphQLProducts.js:212` — the second alerted log line, [getProductByCollectionsGraphQL], logged at ERROR then rethrown — one fault logged twice
- `packages/assets/src/pages/Blog/BlogSettingLeft/TabProductDynamic/SettingSelectProduct.js:215` — builds the URL by interpolating collectionId with no guard, so an undefined value becomes the literal string "undefined" in the query
- `packages/assets/src/pages/Blog/BlogSettingLeft/TabProductDynamic/SettingSelectProduct.js:181` — calls fetchProductByCollections(dynamicProductSetting.idCollection) unconditionally; the comment on line 183 shows the missing-id outcome is an expected, handled path on the client

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-10T15:30:40Z" AND timestamp<="2026-09-10T15:31:10Z" AND httpRequest.requestUrl:"productByCollections"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-10T15:16:09.083Z" AND timestamp<="2026-09-10T15:46:09.083Z" AND severity>=ERROR`
- 36 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-10T15:16:09.083Z" AND timestamp<="2026-09-10T15:46:09.083Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.48

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
