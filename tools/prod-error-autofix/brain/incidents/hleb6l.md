fingerprint: hleb6l
service: proxy
message: [processJSONMetafield] TypeError: Cannot read properties of null (reading 'socialMetafield')
app: BLOG
repo: blogs
date: 2026-07-31T04:01:47.521Z
status: deferred
attempt: 1

# BLOG · proxy · hleb6l

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's GraphQL `article(id:)` returned `null` for article 560458924077 on glacierfrostco.myshopify.com, and getShopifyArticleById propagates that null instead of bailing out: processJSONMetafield(null) throws and returns the null back, handleNewAuthor then dereferences `data.id` and returns null, so getPreview reads `article.isPublished` off null and answers 500.

**Mechanism.** makeGraphQlApi resolves with `resp.data.article === null` (article deleted/not visible to the token). shopifyGraphQlService.js:832 passes that null into processJSONMetafield, whose `structuredClone(null)` is null, so `article['socialMetafield']` at articlesHelper.js:130 throws `Cannot read properties of null (reading 'socialMetafield')` — logged at 03:59:15.051905Z. Its catch returns `articleObj`, i.e. null. Back in getShopifyArticleById, `data?.authorMetafield?.value` is undefined, getAuthorByField finds nothing, the fullName lookup finds nothing, getAuthorDefault is empty, so line 846 calls handleNewAuthor with `data: null`; `{...null}` spreads harmlessly but `data.id` at shopifyGraphQlService.js:917 throws `Cannot read properties of null (reading 'id')` — logged at 03:59:15.283669Z. handleNewAuthor's catch returns `data` (null), which getShopifyArticleById returns verbatim at line 846 — note it never logged `[getShopifyArticleById]`, proving the null came out of the handleNewAuthor return path, not the outer catch (which returns `{}`). getPreview then evaluates `article.isPublished` at appProxyController.js:128 → `Cannot read properties of null (reading 'isPublished')` at 03:59:15.283929Z → catch sets ctx.status = 500.

Confidence: `high`

## Code
- `packages/functions/src/helpers/articlesHelper.js:121` — structuredClone(null) returns null; no null guard on articleObj
- `packages/functions/src/helpers/articlesHelper.js:130` — `article[field]?.value` on a null `article` — exact throw site (lib:112:44)
- `packages/functions/src/helpers/articlesHelper.js:140` — catch returns the original null instead of failing, hiding the bad value
- `packages/functions/src/services/shopifyGraphQlService.js:832` — `processJSONMetafield(resp.data?.article)` — null article enters here unchecked
- `packages/functions/src/services/shopifyGraphQlService.js:846` — returns handleNewAuthor's result, which is the null `data` on failure
- `packages/functions/src/services/shopifyGraphQlService.js:917` — `id: data.id` on null data — second throw (lib:1038:16)
- `packages/functions/src/services/shopifyGraphQlService.js:923` — catch returns `data` (null), so the caller gets null, not `{}`
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on null → the 500

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:44:27.145Z" AND timestamp<="2026-07-31T04:14:27.145Z" AND jsonPayload.error.message="Cannot read properties of null (reading 'socialMetafield')"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:44:27.145Z" AND timestamp<="2026-07-31T04:14:27.145Z" AND jsonPayload.message:"Error fetching the resource: Cannot read properties of null (reading 'isPublished')"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:44:27.145Z" AND timestamp<="2026-07-31T04:14:27.145Z" AND httpRequest.status>=500`
- 30 matching entries: `timestamp>="2026-07-30T04:00:00Z" AND timestamp<="2026-07-31T04:20:00Z" AND jsonPayload.error.message="Cannot read properties of null (reading 'socialMetafield')"`

## Job
- analyze rounds: 1
- cost: $0.84

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
