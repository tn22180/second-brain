fingerprint: te44sp
service: api
message: [processJSONMetafield] TypeError: Cannot read properties of null (reading 'socialMetafield')
app: BLOG
repo: blogs
date: 2026-07-31T06:04:36.175Z
status: inconclusive
attempt: 1

# BLOG · api · te44sp

**Outcome.** fix blocked at agent_failed

**Root cause.** Shopify's Admin GraphQL returns `data.article: null` for article gids that no longer resolve, and getShopifyArticleById feeds that null straight into processJSONMetafield with no null guard, so every such lookup from articleController.list throws a TypeError and logs it at ERROR.

**Mechanism.** articleController.list, getRecentPosts/ids branch, maps up to 5 gids through getShopifyArticleById (packages/functions/src/controllers/articleController.js:670). Inside, `const resp = await makeGraphQlApi({shop, graphqlQuery})` then `processJSONMetafield(resp.data?.article)` (shopifyGraphQlService.js:850) — no check that `resp.data.article` is non-null. When the gid does not resolve, Shopify answers `data: {article: null}` with no GraphQL error, so `articleObj` is null; `structuredClone(null)` is null, and the forEach body dereferences `article['socialMetafield']` (articlesHelper.js:130) → `TypeError: Cannot read properties of null (reading 'socialMetafield')`, logged by the catch at articlesHelper.js:139 and returned as the original null. The caller then continues with `data === null`; in the one case where control reached assignAuthorToArticle, `{...data.author}` (shopifyGraphQlService.js:878) threw the paired `Cannot read properties of null (reading 'author')`, caught at shopifyGraphQlService.js:870 which returns `{}`. list then drops it via `isEmpty(article)` at articleController.js:672, which is why requests=0 — no HTTP 500, the recent-post tile is silently missing and the only symptom is the ERROR log the sink pages on.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:850` — processJSONMetafield(resp.data?.article) — nullable article passed in with no guard; lib frame 945/928:59 in the stack
- `packages/functions/src/helpers/articlesHelper.js:130` — `const raw = article[field]?.value` inside the forEach — the throwing line; lib articlesHelper.js:112:44
- `packages/functions/src/helpers/articlesHelper.js:139` — catch logs at logger.error and returns articleObj (null) instead of failing closed — source of the alerted ERROR line
- `packages/functions/src/services/shopifyGraphQlService.js:878` — `author: {...data.author, ...}` in assignAuthorToArticle — second unguarded null deref, the paired 'author' TypeError
- `packages/functions/src/controllers/articleController.js:670` — the only caller in the 17 stacks: getRecentPosts/ids branch, Promise.all over articleIds.slice(0,5) — explains 'Promise.all (index 0..4)'
- `packages/functions/src/controllers/articleController.js:672` — isEmpty(article) drops the {} result, so the failure never becomes a 5xx — consistent with requests=0

## Evidence
- 17 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"[processJSONMetafield]"`
- 17 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"[processJSONMetafield]" AND jsonPayload.error.stack:"articleController.js"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"Cannot read properties of null (reading 'author')"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T05:25:43.628Z" AND timestamp<="2026-07-31T05:55:43.628Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.81

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
