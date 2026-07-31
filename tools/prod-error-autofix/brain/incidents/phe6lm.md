fingerprint: phe6lm
service: api
message: [handleNewAuthor] W6AUCLaUM6jqKPYP5S7j TypeError: Cannot read properties of null (reading 'id')
app: BLOG
repo: blogs
date: 2026-07-31T06:21:15.974Z
status: mr_open
attempt: 1

# BLOG · api · phe6lm

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Shopify Admin GraphQL answers `data.article: null` for stale article gids, processJSONMetafield swallows the resulting TypeError and returns that null unchanged, and getShopifyArticleById then routes it into handleNewAuthor, where `id: data.id` (shopifyGraphQlService.js:935) dereferences null and throws.

**Mechanism.** articleController.list, getRecentPosts branch, maps articleIds.slice(0,5) through getShopifyArticleById (articleController.js:670) inside Promise.all — the stack's `Promise.all (index 3)` is the 4th id. Inside, `const data = processJSONMetafield(resp.data?.article)` (shopifyGraphQlService.js:850) receives null with no guard. `structuredClone(null)` is null, so the forEach body reads `article['socialMetafield']` (articlesHelper.js:130) and throws `Cannot read properties of null (reading 'socialMetafield')` — logged at 06:00:30.200022Z. The message says *null*, not *undefined*, which pins it to `data.article === null` rather than a missing field. That catch (articlesHelper.js:139) logs at ERROR and returns articleObj — still null. Back in getShopifyArticleById `data` is null: `data?.authorMetafield?.value` is undefined, getAuthorByField returns empty, the fullName lookup on `data?.author?.name` (undefined) also returns empty, isSkipCreateAuthor is false, and getAuthorDefault(shop.id) is **empty** for this shop (shopifyGraphQlService.js:860) — so control falls to `handleNewAuthor({originName, shop, data})` (shopifyGraphQlService.js:864). There, `data?.author?.name || 'anonymous'` is null-safe and `{...data}` on line 930 spreads null harmlessly, but line 935 `updateShopifyArticle({shop, id: data.id, data: preparedData})` is a bare deref: `Cannot read properties of null (reading 'id')`, thrown 406ms later at 06:00:30.606921Z — the alerted line, column 16 matching `id: data.id`. The catch at shopifyGraphQlService.js:940 logs '[handleNewAuthor]' with shop?.id, matching the alert text exactly, and returns data (null); the caller's isEmpty check drops it. That is why requests=0: no HTTP 5xx is produced at all — the merchant silently loses one recent-post tile and the only symptom is the ERROR the sink pages on. This is the same null-article family as rs8tvy, on the branch taken by shops with **no** default author: 18 handleNewAuthor throws vs 1 assignAuthorToArticle `reading 'author'` throw in 24h.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:850` — processJSONMetafield(resp.data?.article) — nullable article enters with no guard; lib frame shopifyGraphQlService.js:945:59 in the paired stack
- `packages/functions/src/helpers/articlesHelper.js:130` — `const raw = article[field]?.value` — the throwing line for the paired socialMetafield TypeError; lib articlesHelper.js:112:44
- `packages/functions/src/helpers/articlesHelper.js:139` — catch logs at ERROR and returns articleObj (null) instead of failing closed — lets null propagate downstream
- `packages/functions/src/services/shopifyGraphQlService.js:860` — getAuthorDefault(shop.id) empty for these shops, so the assignAuthorToArticle shortcut is skipped and handleNewAuthor is reached — explains 18 handleNewAuthor vs 1 'reading author' in 24h
- `packages/functions/src/services/shopifyGraphQlService.js:864` — return await handleNewAuthor({originName, shop, data}) with data === null — the branch in the alerted stack (lib :967:16)
- `packages/functions/src/services/shopifyGraphQlService.js:935` — `updateShopifyArticle({shop, id: data.id, data: preparedData})` — the only non-optional data deref reached before line 938; this is the alerted throw at lib shopifyGraphQlService.js:1055:16
- `packages/functions/src/services/shopifyGraphQlService.js:940` — catch logs '[handleNewAuthor]' with shop?.id — produces the exact alert message and returns null to the caller
- `packages/functions/src/controllers/articleController.js:670` — the only caller in the stack: getRecentPosts branch, Promise.all over articleIds.slice(0,5) — explains 'Promise.all (index 3)'

## Evidence
- 18 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:15:00Z" AND jsonPayload.message:"[handleNewAuthor]" AND jsonPayload.message:"reading 'id'"`
- 18 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:15:00Z" AND jsonPayload.error.stack:"handleNewAuthor" AND jsonPayload.error.stack:"articleController.js"`
- 19 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T06:15:00Z" AND jsonPayload.message:"[processJSONMetafield]" AND jsonPayload.message:"reading 'socialMetafield'"`
- 16 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T06:00:29Z" AND timestamp<="2026-07-31T06:00:32Z"`

## Job
- analyze rounds: 2
- cost: $3.03
- branch: `fix/prod-blog-phe6lm`
- fix commit: `9b48821c370c5b4bf70af9d8a6df220453a95496`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798
- tests: 212 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/articlesHelper.js         | 1 +
 packages/functions/src/services/shopifyGraphQlService.js | 3 +++
 2 files changed, 4 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
