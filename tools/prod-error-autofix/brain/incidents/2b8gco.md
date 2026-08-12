fingerprint: 2b8gco
service: api
message: [blockLoader] kozjvGcNBaGdLMGB7Pxq blockLoader error: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-12T07:24:01.590Z
status: mr_open
attempt: 1

# BLOG · api · 2b8gco

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/858

**Root cause.** Duplicate of fingerprint 11w4y7x (MR https://gitlab.com/avada/blogs/-/merge_requests/857 open, unmerged): this alert is the [blockLoader] re-log of the very same transient Shopify Admin 401 at 2026-08-05T08:20:52.839Z for shop kozjvGcNBaGdLMGB7Pxq — getPostsGraphQL logs the 401 at logger.error and rethrows, and blockLoader's catch logs it at logger.error a second time, so an upstream auth 4xx reaches the severity>=ERROR sink and pages.

**Mechanism.** GET /api/blockLoader for shop kozjvGcNBaGdLMGB7Pxq on revision api-00118-tej hit a ~130 ms Shopify Admin auth brownout. blockLoader (appBlockController.js:38) reached getMainThemeId (line 43) successfully — no [getMainThemeId] line exists anywhere in the window — then called getPostsGraphQL (line 44). shopify.graphql() threw a got HTTPError whose stack frame is got/dist/source/as-promise/index.js:118, matching the alert stack exactly, with response.statusCode 401. graphQLPosts.js:37 logs that unconditionally at logger.error and rethrows (line 38); blockLoader's catch (appBlockController.js:104) logs the same error again at logger.error. The two lines are 358 µs apart, 08:20:52.839089 (ERROR, tag [getPostsGraphQL]) and 08:20:52.839447 (ERROR, tag [blockLoader], the alerted line). The repo already carries the intended guard — helpers/api.js:151 isShopifyAuthError, whose comment (lines 147-148) says it exists so a 401/402/403 'doesn't page the prod-error-alerts sink' — and the same burst proves the split: [getProductsGraphQL] logged the identical 401 at 08:20:52.942849 at severity WARNING because graphQLProducts applies the guard, while [getPostsGraphQL] and [blockLoader] logged ERROR. The upstream 401 is transient, not a revoked token: exactly 4 lines containing '401 (Unauthorized)' exist in the entire 24 h of 2026-08-05 on service api and all 4 fall inside 113 ms; [blockLoader] has exactly 1 line in the whole day. The [getEnableBlocks] 401 at .951511 is a separate handler on the REST path in the same brownout, and the 400 Bad Request → GET /api/options 500 pair 553-693 ms later on the same revision is w6i1j5 (MR 856, unmerged), a different defect in errorHandler.js. MR 857 already edits both appBlockController.js and graphQLPosts.js; both files are unchanged on this branch, so the defect is still open only because that MR is unmerged.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appBlockController.js:104` — the exact line that emitted the alert — logger.error('[blockLoader]', ...) on every error including an upstream 401; unguarded on this branch, fixed only in open MR 857
- `packages/functions/src/controllers/appBlockController.js:44` — blockLoader's getPostsGraphQL call — the throw source, 358 µs before the alert line
- `packages/functions/src/helpers/graphql/graphQLPosts.js:37` — logs the 401 at logger.error and rethrows (line 38), producing the sibling [getPostsGraphQL] ERROR line at 08:20:52.839089
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError already exists for exactly this — its comment states 401/402/403 should log at warn so they don't page the sink; neither call site imports it
- `packages/functions/src/helpers/api.js:158` — shopifyRetryGraphQL's guarded catch — its line in this same burst (08:20:52.818087) is WARNING, corroborating that the guard is what keeps a 401 off the sink
- `packages/functions/src/controllers/appBlockController.js:43` — getMainThemeId call ahead of getPostsGraphQL — no [getMainThemeId] log in the window, so the REST path is excluded as this alert's source

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.tag="[blockLoader]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T08:20:52Z" AND timestamp<="2026-08-05T08:20:54Z" AND severity>=ERROR`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"kozjvGcNBaGdLMGB7Pxq"`

## Job
- analyze rounds: 1
- cost: $3.14
- branch: `fix/prod-blog-2b8gco`
- fix commit: `afffab3802c7cc7df9cf04fa58b7ee5d8b546f76`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/858
- tests: 361 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/appBlockController.js  | 15 +++++++++++++--
 .../__tests__/graphQLPosts.getBlogsGraphQL.test.js        |  2 ++
 packages/functions/src/helpers/graphql/graphQLPosts.js    |  7 ++++++-
 3 files changed, 21 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
