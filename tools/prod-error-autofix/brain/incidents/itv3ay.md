fingerprint: itv3ay
service: api
message: [getProductByCollectionsGraphQL] Error fetching products from collection: RequestError: Invalid global id 'undefined'
app: BLOG
repo: blogs
date: 2026-09-10T16:54:25.370Z
status: fix_disabled
attempt: 1

# BLOG · api · itv3ay

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /api/shopify/productByCollections was called with the literal query string collectionId=undefined, and getProductByCollectionsGraphQL splices that raw value straight into a GraphQL string literal (node(id: "undefined")), so Shopify Admin rejected the document with RequestError: Invalid global id 'undefined'.

**Mechanism.** The alerted entry logs `[getProductByCollections] EhMrwQNznWdKn3qRXupC undefined RequestError: Invalid global id 'undefined'` — the third positional arg is `collectionId`, and shopifyController.js:361 destructures it with a `= ''` default, so an absent param would print an empty string and Shopify would answer `Invalid global id ''`. It printed `undefined` and Shopify quoted `'undefined'`, so the param arrived as the string "undefined". graphQLProducts.js:161 interpolates it unvalidated into `node(id: "${collectionId}")`; shopify-api-node's got wrapper turns Shopify's rejection into the RequestError in the stack (shopify-api-node/index.js:299). The only caller of that endpoint is SettingSelectProduct.js:215, which template-interpolates `collectionId` into the URL, itself derived from `dynamicProductSetting.idCollection` (SettingSelectProduct.js:181); `idCollection` is written in exactly one place (ListProducts.js:44, when the merchant picks a collection), so a dynamic-product block whose typeSearch is `collection` but which carries no saved idCollection yields JS undefined → the string "undefined" in the URL. No 5xx request log exists (requests read = 0) because the controller catch answers HTTP 200 with `{success:false}`; the same failure is logged twice — once by the helper before rethrowing (graphQLProducts.js:212) and once by the controller catch (shopifyController.js:385) — which is why one user action produced both ERROR entries in the window.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:161` — raw `node(id: "${collectionId}")` interpolation — the value Shopify quotes back in the error
- `packages/functions/src/helpers/graphql/graphQLProducts.js:212` — helper logs the error then rethrows, producing the first of the two ERROR entries
- `packages/functions/src/controllers/shopifyController.js:361` — collectionId defaulted to '' but never validated as a Shopify gid before the Admin call
- `packages/functions/src/controllers/shopifyController.js:385` — second log of the same error; also answers 200 {success:false}, so no 5xx request log exists
- `packages/assets/src/pages/Blog/BlogSettingLeft/TabProductDynamic/SettingSelectProduct.js:215` — sole caller — template-interpolates collectionId into the URL, turning undefined into the string "undefined"
- `packages/assets/src/pages/Blog/BlogSettingLeft/TabProductDynamic/SettingSelectProduct.js:181` — passes dynamicProductSetting.idCollection, unset for any collection-type block that never had a collection saved

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-10T15:16:08.854Z" AND timestamp<="2026-09-10T15:46:08.854Z" AND severity>=ERROR AND jsonPayload.message:"Invalid global id"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-03T00:00:00Z" AND severity>=ERROR AND jsonPayload.tag="[getProductByCollections]"`

## Job
- analyze rounds: 1
- cost: $1.69

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
