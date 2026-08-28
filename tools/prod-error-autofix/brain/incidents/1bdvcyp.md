fingerprint: 1bdvcyp
service: proxy
message: [updateArticlePrimary] aDzmkG8VhlzTJqE6koko <gid://shopify/Article/567418159273> resp.errors [{"message":"Throttled","extensions":{"code":"THROTTLED","documentation":"<https://shopify.dev/api/usage/rate-limits>"}}]
app: BLOG
repo: blogs
date: 2026-08-28T07:36:15.775Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1bdvcyp

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop aDzmkG8VhlzTJqE6koko's Shopify Admin GraphQL cost bucket was exhausted (THROTTLED) for ~6 minutes, and because makeGraphQlApi/shopifyRetryGraphQL never inspects the in-band `errors[].extensions.code === 'THROTTLED'` on an HTTP-200 GraphQL response, getShopifyArticleById saw `resp.data.article === undefined`, threw its own 'Article not found', swallowed it and returned `{}` — so getPreview dereferenced `article.blog.handle` on an empty object and returned 500.

**Mechanism.** 07:27:07→07:32:57Z, five `[fetchAllImagesFromShopify] aDzmkG8VhlzTJqE6koko ... RequestError: Throttled` lines on service `api` bracket the window: the shop's Admin GraphQL bucket was drained by the files(first:250) sweep. Inside that window, two GET /proxy/seoOn-preview?id=567418159273 requests ran. In execution cmw6i8e8oqf3: (1) 07:32:25.367 `[getShopifyArticleById] aDzmkG8VhlzTJqE6koko 567418159273 Error: Article not found` — makeGraphQlApi returned `{errors:[{code:THROTTLED}]}` with no `data.article`, so `processJSONMetafield(resp.data?.article)` at shopifyGraphQlService.js:866 yielded falsy and line 868 threw; the catch at :889 logged and returned `{}`. (2) getPreview then read `article.isPublished` (undefined → falsy) and called updateShopifyArticle, whose articleUpdate came back THROTTLED too — 07:32:25.495 `[updateArticlePrimary] ... resp.errors [{"message":"Throttled"...}]`, the alerted line, non-fatal (returns `{userErrors}`, does not throw). (3) 0.5 ms later, `blogHandle: article.blog.handle` (appProxyController.js:143) on `{}` threw `Cannot read properties of undefined (reading 'handle')`, logged at :171 → ctx.status 500. Execution cmw7awo8514e repeated steps (1) and (3) 0.9 s later with no throttle log on the update, giving 2 of 2 proxy 500s in the window. Retry cannot save it: shopifyRetryGraphQL only retries on transport codes / HTTP statuses (helpers/api.js:164-165); a Shopify cost throttle arrives as HTTP 200 with in-band errors and is invisible to that check.

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:866` — `processJSONMetafield(resp.data?.article)` — a THROTTLED response has no data.article, so data is falsy
- `packages/functions/src/services/shopifyGraphQlService.js:868` — `throw new Error('Article not found')` — the exact message and stack frame in the log
- `packages/functions/src/services/shopifyGraphQlService.js:890` — catch returns `{}`, converting a throttle into a fake empty article the caller cannot distinguish from a real one
- `packages/functions/src/controllers/appProxyController.js:143` — `blogHandle: article.blog.handle` on `{}` — the TypeError that produced the 500
- `packages/functions/src/controllers/appProxyController.js:171` — catch logs `[getPreview] ... Error fetching the resource:` and sets 500
- `packages/functions/src/helpers/api.js:165` — retry predicate keys on e.code / e.response.status only — an HTTP-200 in-band THROTTLED never retries or backs off
- `packages/functions/src/services/shopifyGraphQlService.js:1252` — the alerted log line; it returns `{userErrors: resp.errors}` and never throws, so the throttle is silently ignored by the publish step too

## Evidence
- 5 matching entries: `jsonPayload.tag="[fetchAllImagesFromShopify]" AND timestamp>="2026-08-28T06:30:00Z" AND timestamp<="2026-08-28T08:30:00Z"`
- 1 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[updateArticlePrimary]" AND timestamp>="2026-08-28T07:17:27Z" AND timestamp<="2026-08-28T07:47:28Z"`
- 2 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getShopifyArticleById]" AND timestamp>="2026-08-28T07:17:27Z" AND timestamp<="2026-08-28T07:47:28Z"`
- 2 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getPreview]" AND timestamp>="2026-08-28T07:17:27Z" AND timestamp<="2026-08-28T07:47:28Z"`

## Job
- analyze rounds: 1
- cost: $2.08

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
