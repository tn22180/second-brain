fingerprint: rs8tvy
service: api
message: [getShopifyArticleById] wf6yTLlwXYhJuTwSOElz <gid://shopify/Article/563125878861> TypeError: Cannot read properties of null (reading 'author')
app: BLOG
repo: blogs
date: 2026-07-31T06:12:45.372Z
status: mr_open
attempt: 1

# BLOG · api · rs8tvy

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/797

**Root cause.** Shopify's Admin GraphQL answers `data.article: null` for gid://shopify/Article/563125878861 on shop wf6yTLlwXYhJuTwSOElz, and getShopifyArticleById passes that null through processJSONMetafield (which swallows its own throw and returns the null) into assignAuthorToArticle, where `{...data.author}` dereferences null and throws.

**Mechanism.** articleController.list, getRecentPosts branch, maps articleIds.slice(0,5) through getShopifyArticleById (articleController.js:670) — the stack's `Promise.all (index 4)` is the 5th id. Inside, `const resp = await makeGraphQlApi(...)` then `processJSONMetafield(resp.data?.article)` (shopifyGraphQlService.js:850) with no null check. Shopify returned `article: null` (no GraphQL error), so `structuredClone(null)` is null and the forEach body reads `article['socialMetafield']` (articlesHelper.js:130) → `TypeError: Cannot read properties of null (reading 'socialMetafield')` at 05:40:28.647354Z. The message says *null*, not *undefined*, which pins it to `data.article === null` rather than a missing field. That catch (articlesHelper.js:139) logs at ERROR and returns articleObj — still null. Back in getShopifyArticleById, `data` is null: `data?.authorMetafield?.value` is undefined, getAuthorByField returns empty, fullName lookup on `data?.author?.name` (undefined) returns empty, isSkipCreateAuthor is false, getAuthorDefault(shop.id) is non-empty → `assignAuthorToArticle({shop, data: null, author: defaultAuthor})` (shopifyGraphQlService.js:862) → `author: {...data.author, ...}` (shopifyGraphQlService.js:878) throws `Cannot read properties of null (reading 'author')` 93ms later at 05:40:28.740811Z — the alerted line. The outer catch (shopifyGraphQlService.js:870) logs it and returns `{}`, which list drops via `isEmpty(article)` (articleController.js:672). That is why requests=0 in the window: no HTTP 5xx is produced at all; the merchant silently loses one recent-post tile and the only symptom is the ERROR the sink pages on.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:850` — processJSONMetafield(resp.data?.article) — nullable article enters with no guard; lib frame shopifyGraphQlService.js:945:59 in the paired stack
- `packages/functions/src/helpers/articlesHelper.js:130` — `const raw = article[field]?.value` — the throwing line for the socialMetafield TypeError; lib articlesHelper.js:112:44
- `packages/functions/src/helpers/articlesHelper.js:139` — catch logs at ERROR and returns articleObj (null) instead of failing closed — lets null propagate
- `packages/functions/src/services/shopifyGraphQlService.js:862` — assignAuthorToArticle({shop, data, author: defaultAuthor}) — the branch reached when data is null and a default author exists
- `packages/functions/src/services/shopifyGraphQlService.js:878` — `author: {...data.author, name: author.fullName}` — the alerted throw; lib shopifyGraphQlService.js:986:50
- `packages/functions/src/services/shopifyGraphQlService.js:870` — outer catch logs '[getShopifyArticleById]' with shop id + gid and returns {} — matches the alert text exactly
- `packages/functions/src/controllers/articleController.js:670` — the only caller in both stacks: getRecentPosts branch, Promise.all over articleIds.slice(0,5) — explains 'Promise.all (index 4)'
- `packages/functions/src/controllers/articleController.js:672` — isEmpty(article) drops the {} result, so no 5xx ever surfaces — consistent with requests=0
- `packages/functions/src/services/shopifyGraphQlService.js:897` — handleNewAuthor's `data?.author?.name` is already null-safe, so shops without a default author log only the metafield error — explains 18 metafield errors vs 1 author error

## Evidence
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"[getShopifyArticleById]" AND jsonPayload.message:"reading 'author'"`
- 18 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"[processJSONMetafield]" AND jsonPayload.message:"reading 'socialMetafield'"`
- 18 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"[processJSONMetafield]" AND jsonPayload.error.stack:"articleController.js"`
- 18 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T05:40:20Z" AND timestamp<="2026-07-31T05:40:40Z"`

## Job
- analyze rounds: 2
- cost: $2.67
- branch: `fix/prod-blog-rs8tvy`
- fix commit: `3c7d1e030482de6ee044c45d4f2721ed528982dd`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/797
- tests: 213 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/articlesHelper.js         | 1 +
 packages/functions/src/services/shopifyGraphQlService.js | 5 +++++
 2 files changed, 6 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
