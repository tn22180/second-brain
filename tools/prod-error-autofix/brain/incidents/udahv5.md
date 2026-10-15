fingerprint: udahv5
service: api
message: [blockLoader] 8qwlNQ0FEn8G7zHTWzzq blockLoader error: RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-14T17:22:48.676Z
status: fix_disabled
attempt: 1

# BLOG · api · udahv5

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A burst of Shopify-side TLS socket resets at 17:13:14 hit nine concurrent `api` executions on revision api-00190-lub; blockLoader's `getPostsGraphQL` call issues `shopify.graphql` through shopify-api-node's got client with no retry wrapper at all, so a single `read ECONNRESET` on that socket aborts the whole handler and logs the alerted severity=ERROR line.

**Mechanism.** appBlockController.blockLoader awaits getPostsGraphQL({shopify}) (appBlockController.js:44) → getPostsGraphQL calls shopify.graphql(searchArticles, ...) bare, with no retry and no connection-error handling (graphQLPosts.js:14). Shopify's edge reset the keep-alive TLS socket mid-read, so got threw RequestError{code:'ECONNRESET'}; the stack in the log confirms the entry frame is got's core/index.js:970 with NO shopifyRetryApi frame, i.e. the call was never wrapped. getPostsGraphQL logs `[getPostsGraphQL] Error fetching posts` at 17:13:14.599162 and rethrows (graphQLPosts.js:20-21); 118µs later blockLoader's catch logs `[blockLoader] 8qwlNQ0FEn8G7zHTWzzq blockLoader error:` at severity ERROR (appBlockController.js:104) — same execution_id 8dc5jjfq48qu, which is the alert — then answers HTTP 200 with `{data: [], error}` (appBlockController.js:105), so the merchant's app-blocks panel renders empty and the requests read shows no 500 for this endpoint. The reset was not specific to this handler: inside 17:13:14.597–17:13:35.579 nine distinct execution_ids on the same revision failed with the same `read ECONNRESET`, each through a different unprotected Shopify path — the window's only HTTP 500, GET /api/options (0.891757508s, so it ended at 17:13:14.647 and is the line logged at 17:13:14.650), came from articleController.getOptions → getShopifyBlogPostThemes' bare `shopify.asset.list(theme.id)` (shopifyService.js:94), whose stack is likewise got-rooted with no retry frame; and getEnableBlocks → getAppBlockByType → getAppBlocks failed through shopifyRetryApi (shopifyService.js:748) because shopifyRetryError classifies retryability only by HTTP status codes found in error.message (shopifyService.js:167) — a socket reset carries no status and no retry-after, so it returns 0 and shopifyRetryApi throws on attempt 0 without spending any of maxRetry=10 (shopifyService.js:147). That is recorded fingerprint 1q9n03/16cmdy4, still unfixed, and it is a sibling symptom here rather than this alert's path. The correct behaviour already exists one file over: shopifyRetryGraphQL classifies by e.code against RETRYABLE_CODES which includes 'ECONNRESET' (helpers/api.js:165), which is why the three `[shopifyRetryGraphQL]` ERROR lines in the same burst retried and their requests survived. Scale over 24h on `api`: 115 ECONNRESET lines in 41 bursts across 105 distinct executions, and 99 of the 115 (86%) are bare `Exception from a finished function: Error: read ECONNRESET` with no other log line in their execution — connection resets escaping every try/catch as unhandled rejections.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appBlockController.js:44` — the failing call in the alert's execution: getPostsGraphQL awaited with no retry wrapper, before getAppBlocks on line 50
- `packages/functions/src/helpers/graphql/graphQLPosts.js:14` — shopify.graphql called bare through shopify-api-node's got client — no retry, no ECONNRESET handling; explains the got-rooted stack with no shopifyRetryApi frame
- `packages/functions/src/helpers/graphql/graphQLPosts.js:21` — rethrows the RequestError after logging it, so the same socket reset is logged twice at severity ERROR in one execution
- `packages/functions/src/controllers/appBlockController.js:104` — logger.error on a transient network blip is the line that fired this alert
- `packages/functions/src/controllers/appBlockController.js:105` — answers 200 with {data: [], error} — why no blockLoader 500 appears in the requests read and the panel silently renders empty
- `packages/functions/src/services/shopifyService.js:94` — getShopifyBlogPostThemes' shopify.asset.list is unwrapped; this is the throw behind the window's only HTTP 500, GET /api/options
- `packages/functions/src/controllers/articleController.js:422` — getOptions awaits getShopifyBlogPostThemes inside Promise.all; getShopifyBlogs swallows to [] (shopifyService.js:63-65) so the asset.list path is the only one that can reach the 500 at line 438
- `packages/functions/src/services/shopifyService.js:167` — shopifyRetryError matches only HTTP status codes inside error.message; a socket-level ECONNRESET has no status and no retry-after header, so it is classified non-retryable
- `packages/functions/src/services/shopifyService.js:147` — throw new Error(e) fires on attempt 0 for the getEnableBlocks sibling symptom, spending none of maxRetry=10 and destroying e.code
- `packages/functions/src/helpers/api.js:165` — the in-repo correct behaviour: retries on e.code in RETRYABLE_CODES, which contains 'ECONNRESET' — the three shopifyRetryGraphQL lines in the same burst survived

## Evidence
- 115 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z" AND "ECONNRESET"`
- 99 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z" AND textPayload:"Exception from a finished function: Error: read ECONNRESET"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z" AND jsonPayload.tag="[blockLoader]" AND jsonPayload.error.code="ECONNRESET"`
- 16 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T16:58:56.254Z" AND timestamp<="2026-10-14T17:28:56.254Z" AND "ECONNRESET"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T17:13:00Z" AND timestamp<="2026-10-14T17:14:00Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.69

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
