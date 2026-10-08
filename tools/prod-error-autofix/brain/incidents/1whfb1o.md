fingerprint: 1whfb1o
service: api
message: [unhandledError] GET /api/shopify/posts 500 syntax error, unexpected IDENTIFIER ("to"), expecting COLON at [2, 40] InternalServerError: syntax error, unexpected IDENTIFIER ("to"), expecting COLON at [2, 40]
app: BLOG
repo: blogs
date: 2026-10-08T04:17:21.862Z
status: fix_disabled
attempt: 1

# BLOG · api · 1whfb1o

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 6k9sr7 (same app, service, endpoint, 30-min window and the same 8 requests): prod revision api-00185-cal still runs the pre-db58a0392 getPostsGraphQL, which splices the raw ctx.query.search into a double-quoted GraphQL argument literal, so any search containing a `"` closes the string early and Shopify's GraphQL parser rejects the document — 8 of 8 GET /api/shopify/posts 500s in the window carried a double quote in `search`.

**Mechanism.** controllers/shopifyController.js:320 passes `ctx.query.search` verbatim as `searchQuery` into getPostsGraphQL. The deployed helper (git show db58a0392^:packages/functions/src/helpers/graphql/graphQLPosts.js) builds the document as a template string whose line 2 is `      articles(first: ${first}, query: "${searchQuery}", sortKey: TITLE) {` — with first=20 the opening quote sits at column 34, so user text starts at column 35. For the alert's `search="How to Prepare a Vehicle for a Full Wrap` the leading `"` at col 35 closes the literal immediately, `How` (36-38) is read as an argument name and the lexer hits `to` at col 40 → `unexpected IDENTIFIER ("to"), expecting COLON at [2, 40]`, character-exact. The other 6 requests in the window are `search=It is set to "Post"`, where the user's `"` closes the string at col 48, `Post` (49-52) becomes the next argument name and the parser finds the STRING `""` at col 53 → `unexpected STRING (""), expecting COLON at [2, 53]`, also exact. shopify-api-node surfaces it as RequestError, graphQLPosts.js:21 rethrows, shopifyController.js:335 turns it into ctx.throw(500). All 8 request logs carry revision_name=api-00185-cal, which predates the fix merged as 8c645df52; HEAD already routes search through the `$query` variable with buildArticleSearchQuery/escapeTerm, so no code change is outstanding on this path — only a deploy.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:320` — getPostsStore passes the raw `search` query param straight through as searchQuery, unvalidated — unchanged call site, present in the deployed revision
- `packages/functions/src/controllers/shopifyController.js:335` — ctx.throw(500, e.message) — the frame the stack names (/workspace/lib/controllers/shopifyController.js:451)
- `packages/functions/src/helpers/graphql/graphQLPosts.js:16` — the splice site; at HEAD already fixed (search goes through the `$query` GraphQL variable), deployed revision still has `query: "${searchQuery}"` inline
- `packages/functions/src/helpers/utils/articleSearchQuery.js:14` — escapeTerm, the quote/backslash escape landed with db58a0392 that makes this input harmless once deployed
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — same splice family still live at HEAD: merchant search text spliced into `query: "status:active ${querySearch}"` — recorded as fingerprint 1pphxpv, not fixed

## Evidence
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:22.798Z" AND timestamp<="2026-10-07T17:12:22.798Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/posts"`
- 24 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:22.798Z" AND timestamp<="2026-10-07T17:12:22.798Z" AND severity>=ERROR AND jsonPayload.message:"expecting COLON"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:42:22.798Z" AND timestamp<="2026-10-07T17:12:22.798Z" AND severity>=ERROR AND jsonPayload.tag="[getPostsGraphQL]"`

## Job
- analyze rounds: 1
- cost: $0.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
