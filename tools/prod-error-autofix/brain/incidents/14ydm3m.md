fingerprint: 14ydm3m
service: proxy
message: HTTP 500 GET /proxy/seoOn-preview
app: BLOG
repo: blogs
date: 2026-07-31T04:08:21.203Z
status: deferred
attempt: 1

# BLOG · proxy · 14ydm3m

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's Admin GraphQL `article(id: "gid://shopify/Article/560458924077")` returns `data.article: null` for glacierfrostco.myshopify.com, and every layer between that response and the response body dereferences it without a null check, so `getPreview` throws on `article.isPublished` and answers 500 instead of 404.

**Mechanism.** getPreview passes id=560458924077 to getShopifyArticleById (appProxyController.js:123). makeGraphQlApi returns 200 with `data.article = null` (no `[shopifyRetryGraphQL]` line in the window, so the HTTP call itself succeeded). shopifyGraphQlService.js:832 hands that null to processJSONMetafield, where `structuredClone(null)` is null and `article['socialMetafield']` throws `Cannot read properties of null (reading 'socialMetafield')` — logged at articlesHelper.js:139, then articlesHelper.js:140 returns the original null. Back in getShopifyArticleById, `data?.authorMetafield?.value` is undefined so no author matches, isSkipCreateAuthor is false and no default author exists, so line 846 calls handleNewAuthor({data: null}); line 917 reads `data.id` and throws `Cannot read properties of null (reading 'id')`, caught at 922 and swallowed by `return data` (923) — which is still null. getShopifyArticleById's own catch never fires (0 `[getShopifyArticleById]` entries in 24h), so getPreview gets null and `article.isPublished` (appProxyController.js:128) throws, caught at 161 → `ctx.status = 500`. Three log lines per request, in that order, 14×14×14 over 24h.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:832` — `processJSONMetafield(resp.data?.article)` — null article enters the pipeline unchecked; no `if (!resp.data?.article) return null` guard
- `packages/functions/src/helpers/articlesHelper.js:130` — `article[field]?.value` on a null `article` — first throw, `reading 'socialMetafield'`, matches the logged stack frame articlesHelper.js:112 in lib
- `packages/functions/src/helpers/articlesHelper.js:140` — catch returns `articleObj` unchanged, i.e. null, so the failure propagates silently
- `packages/functions/src/services/shopifyGraphQlService.js:846` — `handleNewAuthor({originName, shop, data})` invoked with data === null
- `packages/functions/src/services/shopifyGraphQlService.js:917` — `id: data.id` — second throw, `reading 'id'`, matches logged frame handleNewAuthor lib:1038
- `packages/functions/src/services/shopifyGraphQlService.js:923` — catch returns null, hiding the failure from getShopifyArticleById's own catch — which is why zero `[getShopifyArticleById]` entries exist in 24h
- `packages/functions/src/controllers/appProxyController.js:128` — `if (article.isPublished)` on null — third throw, the one that produces the 500
- `packages/functions/src/controllers/appProxyController.js:112` — the existing missing-id guard returns 400; the equivalent article-not-found guard is absent
- `packages/functions/src/helpers/api.js:122` — makeGraphQlApi returns the raw body without inspecting `errors`, so an errors-only response is indistinguishable from a genuine null article

## Evidence
- 14 matching entries: `resource.labels.service_name="proxy" AND httpRequest.status>=500 AND httpRequest.requestUrl:"seoOn-preview" AND timestamp>="2026-07-30T04:14:00Z" AND timestamp<="2026-07-31T04:14:27Z"`
- 14 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getPreview]" AND timestamp>="2026-07-30T04:14:00Z" AND timestamp<="2026-07-31T04:14:27Z"`
- 14 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[handleNewAuthor]" AND timestamp>="2026-07-30T04:14:00Z" AND timestamp<="2026-07-31T04:14:27Z"`
- 14 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[processJSONMetafield]" AND timestamp>="2026-07-30T04:14:00Z" AND timestamp<="2026-07-31T04:14:27Z"`
- 219 matching entries: `resource.labels.service_name="proxy" AND severity>=ERROR AND timestamp>="2026-07-30T04:14:00Z" AND timestamp<="2026-07-31T04:14:27Z"`

## Job
- analyze rounds: 2
- cost: $1.90

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
