fingerprint: 1d04pkl
service: api
message: [update] lGFvPaSOKCGOsGrvYOXi articleId: 630075982111 shopify userErrors after retry [{"field":["article","metafields","5","key"],"message":"Key must be unique within this namespace on this resource"}]
app: BLOG
repo: blogs
date: 2026-08-17T07:22:14.342Z
status: mr_open
attempt: 2

# BLOG · api · 1d04pkl

**Outcome.** duplicate of blfh15 — MR https://gitlab.com/avada/blogs/-/merge_requests/881

**Root cause.** The Blog editor fires several concurrent PUT /api/article/:id saves for the same article, and because prepareGraphQLArticleData emits every metafield with no `id`, the articleUpdate mutations must CREATE the metafield that does not exist yet — concurrent creates collide on Shopify's unique (ownerId, namespace, key) index, so all but one articleUpdate is rejected wholesale with "Key must be unique within this namespace on this resource" and that merchant's edit is dropped.

**Mechanism.** 07:17:34.479–34.508Z: 4 PUT /api/article/630075982111?locale=&primary=en land within 29 ms on service `api`. Each runs articleController.update → prepareGraphQLArticleData (articlesHelper.js:55-78), which builds `metafields` as 9 fixed distinct keys and deliberately omits Shopify's metafield `id` (the comment at articlesHelper.js:49-54 assumes namespace+key addressing). The array cannot contain an intra-payload duplicate, so the collision is against the resource: for metafields[5] no metafield existed yet on article 630075982111, so all 4 mutations attempted an insert; one won, and Shopify rejected the other 3 with field ["article","metafields","5","key"]. handleRetryOnError has branches only for 'Must reference an existing blog.' and for a userError whose field contains both 'article' and 'handle' (articlesHelper.js:187-190) — this field contains neither, so it falls to `return {userErrors}` (articlesHelper.js:206) with no Shopify call at all: the "after retry" log lines land 1.19 ms / 0.09 ms / 0.06 ms after the first log, against a 1.6–1.9 s request latency. articleController.js:628-631 then answers HTTP 200 with {success:false}, so the save silently fails in the admin UI and no 5xx is recorded (requests read = 0). Confirmation of the race: a second burst of 4 concurrent PUTs on the same article at 07:19:46.39–47.03Z produced ZERO userErrors — by then metafields[5] existed, so upsert-by-key matched for all 4.

Confidence: `high`

## Code
- `packages/functions/src/helpers/articlesHelper.js:55` — processMetafield returns {key, namespace, value, type} with no `id`, so articleUpdate has to create an absent metafield instead of upserting a known one
- `packages/functions/src/helpers/articlesHelper.js:68` — the metafields array — 9 fixed distinct keys, so a duplicate key cannot come from the payload itself; the collision is against the metafield already on / concurrently created on the article
- `packages/functions/src/helpers/articlesHelper.js:187` — handleRetryOnError's only update-path branch requires the userError field to contain both 'article' and 'handle'; this error's field is [article, metafields, 5, key]
- `packages/functions/src/helpers/articlesHelper.js:206` — falls through to returning the same userErrors with no Shopify round trip — this is why the 'after retry' line is byte-identical and 0.06–1.19 ms later
- `packages/functions/src/controllers/articleController.js:611` — update calls handleRetryOnError with the uniqueness userError, then logs 'shopify userErrors after retry' at line 625 — the alerted line
- `packages/functions/src/controllers/articleController.js:628` — returns 200 {success:false}: the merchant's article edit is lost with no 5xx, which is why the requests read is empty
- `packages/functions/src/services/shopifyGraphQlService.js:1237` — updateArticlePrimary passes the id-less metafields array straight into articleUpdate(article: $article)
- `packages/functions/src/services/shopifyGraphQlService.js:1162` — the focus-keyword metafield already goes through updateDisplayAppBlock/metafieldsSet — the race-safe upsert path the other 8 keys should use

## Evidence
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-16T07:00:00Z" AND timestamp<="2026-08-17T08:00:00Z" AND jsonPayload.message:"Key must be unique"`
- 9 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-17T07:14:00Z" AND timestamp<="2026-08-17T07:20:00Z" AND httpRequest.requestUrl:"630075982111"`

## Job
- analyze rounds: 1
- cost: $2.21
- MR: https://gitlab.com/avada/blogs/-/merge_requests/881

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
