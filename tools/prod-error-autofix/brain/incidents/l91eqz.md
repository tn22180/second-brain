fingerprint: l91eqz
service: api
message: HTTP 500 GET /api/shopify/posts
app: BLOG
repo: blogs
date: 2026-10-08T04:23:03.599Z
status: fix_disabled
attempt: 1

# BLOG · api · l91eqz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 6k9sr7 (also re-fired as 1whfb1o and 1gpn40b) — same app, service, endpoint, the same 30-minute window and the same 8 requests: the prod revision api-00185-cal still runs the pre-db58a0392 getPostsGraphQL, which splices the raw ctx.query.search string into a double-quoted GraphQL argument literal, so any search containing a `"` closes the string early and Shopify's GraphQL parser rejects the document.

**Mechanism.** controllers/shopifyController.js:320 passes `ctx.query.search` verbatim as `searchQuery` into getPostsGraphQL. The deployed helper (git show db58a0392^:packages/functions/src/helpers/graphql/graphQLPosts.js) built the document as a template string whose line 2 is `      articles(first: ${first}, query: "${searchQuery}", sortKey: TITLE) {` — with first=20 the opening quote sits at column 34, user text starts at column 35. For the logged request `search=It+is+set+to+%22Post%22` the lexer closes the string at the user's `"` (col 48), reads `Post` (49-52) as the next argument name, demands a COLON and finds the STRING `""` at col 53 → `unexpected STRING (""), expecting COLON at [2, 53]`, character-exact against the old template. shopify-api-node surfaces it as RequestError, graphQLPosts.js:21 rethrows, shopifyController.js:335 converts it to ctx.throw(500). The only difference from 6k9sr7 is which of the 8 requests the sender happened to fingerprint — the alert fingerprint is derived from the error text, and the column number varies with the search string, so one cause produces several fingerprints. HEAD already carries the fix (search goes through the `$query` GraphQL variable via buildArticleSearchQuery, whose escapeTerm at articleSearchQuery.js:14 escapes quotes and backslashes); the window predates the deploy of db58a0392, so no code change is owed here — the fix needs to reach prod.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:320` — getPostsStore passes the raw `search` query param straight through as searchQuery — unchanged call site, present in the deployed revision
- `packages/functions/src/controllers/shopifyController.js:335` — ctx.throw(500, e.message) — the frame the stack names (/workspace/lib/controllers/shopifyController.js:451)
- `packages/functions/src/helpers/graphql/graphQLPosts.js:16` — the splice site; at HEAD already fixed to `query: buildArticleSearchQuery(searchQuery) || null` over the `$query` variable, the deployed revision still has `query: "${searchQuery}"` inline
- `packages/functions/src/helpers/utils/articleSearchQuery.js:14` — escapeTerm, the quote/backslash escape that landed with db58a0392 and makes this input harmless
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — same splice family still live at HEAD: merchant search text spliced into `query: "status:active ${querySearch}"` — recorded as fingerprint 1pphxpv, not fixed

## Evidence
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:23.244Z" AND timestamp<="2026-10-07T17:12:23.244Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/posts"`
- 24 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:23.244Z" AND timestamp<="2026-10-07T17:12:23.244Z" AND severity>=ERROR AND jsonPayload.message:"expecting COLON"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:23.244Z" AND timestamp<="2026-10-07T17:12:23.244Z" AND severity>=ERROR AND jsonPayload.tag="[getPostsGraphQL]"`

## Job
- analyze rounds: 1
- cost: $0.70

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
