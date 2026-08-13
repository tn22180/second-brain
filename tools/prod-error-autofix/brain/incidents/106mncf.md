fingerprint: 106mncf
service: api
message: [update] oU1eLddMkUdpnYAYISPu articleId: 28967075951 shopify userErrors after retry [{"field":["article"],"message":"Image upload failed. Image <https://cdn.shopify.com/s/files/1/0049/7644/3503/files/SEOon_used-coffee-grounds-hero_4.png?v=1786106163> failed to download. - timeout reached. Make sure 
app: BLOG
repo: blogs
date: 2026-08-12T14:47:09.404Z
status: mr_open
attempt: 1

# BLOG · api · 106mncf

**Outcome.** duplicate of 3uakdf — MR https://gitlab.com/avada/blogs/-/merge_requests/870

**Root cause.** Duplicate of fingerprint 3uakdf (MR https://gitlab.com/avada/blogs/-/merge_requests/870 open, unmerged — master at ac891de05 still has the defect): handleRetryOnError has no branch for Shopify's image-download-timeout userError, so it returns the same userErrors object without issuing any Shopify call, and articleController.update then logs that identical payload a second time at logger.error labelled 'after retry', turning one transient Shopify-side image ingest timeout into two ERROR alerts per save attempt.

**Mechanism.** PUT /api/article/28967075951 (shop oU1eLddMkUdpnYAYISPu) re-sends image.url = https://cdn.shopify.com/s/files/1/0049/7644/3503/files/SEOon_used-coffee-grounds-hero_4.png on every autosave, because prepareGraphQLArticleData passes `image` straight through whenever image.url is set (articlesHelper.js:44 → :103), so each save asks Shopify to re-download the shop's own CDN asset. Three times in 81s Shopify's articleUpdate answered with userErrors [{field:['article'], message:'Image upload failed. Image ... failed to download. - timeout reached.'}]. articleController.js:601 sees userErrors.length>0 and logs at :602. It calls handleRetryOnError at :611. Inside articlesHelper.js:170 neither guard matches — the message is not 'Must reference an existing blog.' (:175), and field is ['article'] only so ['article','handle'].every(...) is false (:190) — so it falls through to `return {userErrors}` (:206) having issued no Shopify call. Back at :619 updateRetry.userErrors is the same array, so :620 logs the identical payload again with the text 'after retry'. Proof no retry ran: the two ERROR lines of each pair are 82µs, 227µs and 432µs apart (12:36:20.719620/.720052, 12:36:58.681481/.681708, 12:37:41.699824/.699906) — no Shopify Admin round trip fits in 0.5ms. The response stays 200 with {success:false} (:628), which is why the requests read (httpRequest.status>=500) returned 0 entries.

Confidence: `high`

## Code
- `packages/functions/src/helpers/articlesHelper.js:206` — handleRetryOnError falls through to `return {userErrors}` for every error class other than the two guarded ones — no retry issued, yet the caller reports one
- `packages/functions/src/helpers/articlesHelper.js:190` — the only generic guard requires field to include BOTH 'article' and 'handle'; this userError carries field ['article'] only, so it is skipped
- `packages/functions/src/helpers/articlesHelper.js:175` — the other guard matches only message === 'Must reference an existing blog.'
- `packages/functions/src/helpers/articlesHelper.js:44` — image is forwarded whenever image.url is truthy, so a cdn.shopify.com URL already hosted by the shop is re-sent for server-side re-download on every save
- `packages/functions/src/helpers/articlesHelper.js:103` — the forwarded imageUpdate lands in the ArticleUpdateInput — the operation that timed out
- `packages/functions/src/controllers/articleController.js:602` — first logger.error — the '[update] ... shopify userErrors' line
- `packages/functions/src/controllers/articleController.js:611` — the call whose result is treated as a retry outcome even when handleRetryOnError performed no call
- `packages/functions/src/controllers/articleController.js:620` — second logger.error labelled 'after retry', emitted unconditionally on the echoed-back userErrors — the alert in this job, 82-432µs after the first
- `packages/functions/src/controllers/articleController.js:628` — returns 200 {success:false}, so this failure never appears in the httpRequest.status>=500 read

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:23.000Z" AND timestamp<="2026-08-07T12:51:23.000Z" AND jsonPayload.message:"shopify userErrors after retry"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:23.000Z" AND timestamp<="2026-08-07T12:51:23.000Z" AND jsonPayload.message:"shopify userErrors"`
- 40 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:23.000Z" AND timestamp<="2026-08-07T12:51:23.000Z" AND httpRequest.requestMethod="PUT" AND httpRequest.requestUrl:"/api/article/28967075951"`

## Job
- analyze rounds: 1
- cost: $1.33
- MR: https://gitlab.com/avada/blogs/-/merge_requests/870

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
