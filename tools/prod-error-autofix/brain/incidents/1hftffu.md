fingerprint: 1hftffu
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: syntax error, unexpected INT ("1999"), expecting COLON at [2, 89]
app: BLOG
repo: blogs
date: 2026-10-10T05:27:49.270Z
status: fix_disabled
attempt: 1

# BLOG · api · 1hftffu

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getProductsGraphQL splices the raw `search` query param into a double-quoted GraphQL string literal, so a search term containing a `"` character closes the literal early and Shopify's parser rejects the whole document with a syntax error.

**Mechanism.** GET /api/shopify/products → shopifyController.getProductsStore reads `const {search = ''} = ctx.query` (shopifyController.js:258) and passes it unvalidated as `searchQuery` (shopifyController.js:261). getProductsGraphQL builds `title:*${searchQuery}*` (graphQLProducts.js:14) and interpolates it inside `query: "status:active ${querySearch}"` (graphQLProducts.js:19). Line 2 of the emitted document is `      products(first: 25, query: "status:active status:ACTIVE AND title:*<search>*", sortKey: TITLE) {`, where the search text begins at column 74 (verified by evaluating the template with searchQuery="X"). Both logged errors report column positions inside that user-controlled span: `[2, 89]` = 15 chars into the search term, `[2, 152]` = 78 chars in — i.e. the merchant's `"` sits at col 88 / col 151, terminating the string literal, and the parser then hits the text that followed it (`1999` as INT, `Hornet` as IDENTIFIER). shopify.graphql() (graphQLProducts.js:61) gets a 4xx GraphQL syntax error, got wraps it as RequestError/ERR_GOT_REQUEST_ERROR, isShopifyAuthError is false so it logs at logger.error (graphQLProducts.js:67) and rethrows; getProductsStore's catch answers HTTP 200 with {success:false} (shopifyController.js:269), which is why the requests read has 0 entries with status>=500 while the errors read has the two failures.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — Raw searchQuery interpolated inside the double-quoted GraphQL `query:` string literal — a `"` in the term closes the literal and breaks the document
- `packages/functions/src/helpers/graphql/graphQLProducts.js:14` — querySearch built as `title:*${searchQuery}*` with no escaping of `"` or `\`; also duplicates the status filter already hardcoded on line 19
- `packages/functions/src/controllers/shopifyController.js:258` — `search` taken straight from ctx.query with no validation or sanitization
- `packages/functions/src/controllers/shopifyController.js:261` — Passes the raw param as searchQuery into getProductsGraphQL — the only caller, matching the single logged tag
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — logger.error with tag [getProductsGraphQL] — the exact line that emitted both alert entries
- `packages/functions/src/controllers/shopifyController.js:269` — catch returns 200 {success:false}, explaining requests=0 despite 2 application errors
- `packages/functions/src/helpers/graphql/graphQLProducts.js:285` — getProductsGraphQLDefault has the identical unescaped interpolation — same defect, second entry point, fix both

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-10T05:02:14.356Z" AND timestamp<="2026-10-10T05:32:14.356Z" AND jsonPayload.tag="[getProductsGraphQL]"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-10T05:02:14.356Z" AND timestamp<="2026-10-10T05:32:14.356Z" AND jsonPayload.error.code="ERR_GOT_REQUEST_ERROR" AND jsonPayload.error.message:"expecting COLON"`
- 0 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-10T05:02:14.356Z" AND timestamp<="2026-10-10T05:32:14.356Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $0.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
