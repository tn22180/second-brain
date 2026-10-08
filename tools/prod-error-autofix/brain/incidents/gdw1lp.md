fingerprint: gdw1lp
service: api
message: [getPostsGraphQL] Error fetching posts: RequestError: syntax error, unexpected STRING (""), expecting COLON at [2, 53]
app: BLOG
repo: blogs
date: 2026-10-08T04:25:13.693Z
status: fix_disabled
attempt: 1

# BLOG · api · gdw1lp

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints 6k9sr7 / 1whfb1o / 1gpn40b — same app, service, endpoint, 30-minute window and the exact same 8 requests, only the `[2, 53]` column variant of the same failure: prod revision api-00185-cal still ran the pre-db58a0392 getPostsGraphQL, which spliced the raw ctx.query.search into a double-quoted GraphQL argument literal, so a search containing a `"` closed the string early and Shopify's GraphQL parser rejected the document.

**Mechanism.** controllers/shopifyController.js:320 passes `ctx.query.search` verbatim as searchQuery into getPostsGraphQL. The deployed helper (git show db58a0392^:packages/functions/src/helpers/graphql/graphQLPosts.js) built the document as a template string whose line 2 is `      articles(first: ${first}, query: "${searchQuery}", sortKey: TITLE) {` — with first=20 the opening quote sits at column 34, so user text starts at column 35. This alert's two requests carry `search=It is set to "Post"`: the user's `"` at col 48 closes the literal, `Post` (49-52) is read as the next argument name, and the user's trailing `"` at col 53 plus the template's own closing `"` at col 54 lex as an empty STRING → `unexpected STRING (""), expecting COLON at [2, 53]`, character-exact. shopify-api-node surfaces it as RequestError; graphQLPosts.js:20 logs the `[getPostsGraphQL]` line the alert quotes and :21 rethrows; shopifyController.js:335 turns it into ctx.throw(500). The 6 matched `[2, 53]` ERROR lines are 2 requests × 3 log lines (getPostsGraphQL / unhandledError / handleError) — so 6k9sr7, 1whfb1o, 1gpn40b and this fingerprint are the separate log lines of one cause, not four causes. All 8 request logs in the window carry revision_name=api-00185-cal (created 2026-10-07T07:29:57Z), which predates the fix merged as 8c645df52; the other 6 requests in the same window are the `[2, 40]` variant. HEAD routes search through the `$query` GraphQL variable via buildArticleSearchQuery/escapeTerm. The service now serves api-00187-vuy (created 2026-10-08T03:57:49Z, after api-00186-kab at 03:00:33Z) and zero `[getPostsGraphQL]` ERROR entries exist after 2026-10-07T17:15:00Z, so the outstanding deploy has landed and nothing is open on this path.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:320` — getPostsStore passes the raw `search` query param straight through as searchQuery — unchanged call site, present in the deployed revision
- `packages/functions/src/controllers/shopifyController.js:335` — ctx.throw(500, e.message) — the frame the stack names (/workspace/lib/controllers/shopifyController.js:451)
- `packages/functions/src/helpers/graphql/graphQLPosts.js:16` — the splice site; at HEAD already fixed (search goes through the `$query` GraphQL variable), deployed revision api-00185-cal still had `query: "${searchQuery}"` inline
- `packages/functions/src/helpers/graphql/graphQLPosts.js:20` — the exact log line and tag carried by this alert, then rethrown on :21
- `packages/functions/src/helpers/utils/articleSearchQuery.js:14` — escapeTerm — the quote/backslash escape landed with db58a0392 that makes `It is set to "Post"` harmless, now deployed
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — same splice family still live at HEAD: merchant search text spliced into `query: "status:active ${querySearch}"` — recorded as fingerprint 1pphxpv, not fixed

## Evidence
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.438Z" AND timestamp<="2026-10-07T17:15:24.438Z" AND severity>=ERROR AND jsonPayload.tag="[getPostsGraphQL]"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.438Z" AND timestamp<="2026-10-07T17:15:24.438Z" AND severity>=ERROR AND jsonPayload.message:"expecting COLON at [2, 53]"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.438Z" AND timestamp<="2026-10-07T17:15:24.438Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/posts"`

## Job
- analyze rounds: 1
- cost: $0.83

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
