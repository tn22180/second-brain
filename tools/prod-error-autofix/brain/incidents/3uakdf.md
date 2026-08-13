fingerprint: 3uakdf
service: api
message: [update] oU1eLddMkUdpnYAYISPu articleId: 28967075951 shopify userErrors [{"field":["article"],"message":"Image upload failed. Image <https://cdn.shopify.com/s/files/1/0049/7644/3503/files/SEOon_used-coffee-grounds-hero_4.png?v=1786106163> failed to download. - timeout reached. Make sure file can be 
app: BLOG
repo: blogs
date: 2026-08-12T14:44:48.627Z
status: mr_open
attempt: 1

# BLOG · api · 3uakdf

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/870

**Root cause.** handleRetryOnError has no branch for Shopify's image-download-timeout userError, so it returns the same userErrors object without re-issuing anything, and articleController.update then logs that identical payload a second time at logger.error labelled 'after retry' — one transient Shopify-side image ingest timeout becomes two ERROR alerts per save attempt, and the merchant's save is reported as failed although the HTTP response is 200.

**Mechanism.** PUT /api/article/28967075951 (shop oU1eLddMkUdpnYAYISPu) sends image.url = https://cdn.shopify.com/s/files/1/0049/7644/3503/files/SEOon_used-coffee-grounds-hero_4.png on every autosave (articlesHelper.js:44,103). Three times in 81s Shopify's articleUpdate answered with userErrors [{field:['article'], message:'Image upload failed. Image ... failed to download. - timeout reached.'}]. articleController.js:601 sees userErrors.length>0 and logs at logger.error (:602). It then calls handleRetryOnError (:611). Inside articlesHelper.js:170, neither guard matches: the message is not 'Must reference an existing blog.' (:175) and field is ['article'] only, so ['article','handle'].every(...) is false (:190) — so it falls through to `return {userErrors}` (:206) having issued no Shopify call at all. Back at :619 updateRetry.userErrors is the same array, so :620 logs the identical payload a second time with the text 'after retry'. Proof no retry ran: the two ERROR lines of each pair are 76µs, 227µs and 432µs apart (12:36:20.719620/.720052, 12:36:58.681481/.681708, 12:37:41.699824/.699906) — no Shopify Admin round trip fits in 0.2ms. Response stays 200 with {success:false} (:628), which the request log confirms.

Confidence: `high`

## Code
- `packages/functions/src/helpers/articlesHelper.js:206` — handleRetryOnError falls through to `return {userErrors}` for every error class other than the two guarded ones — no retry is issued, yet the caller reports one
- `packages/functions/src/helpers/articlesHelper.js:190` — the only generic guard requires field to include BOTH 'article' and 'handle'; this userError carries field ['article'] only, so it is skipped
- `packages/functions/src/helpers/articlesHelper.js:175` — the other guard matches only message === 'Must reference an existing blog.'
- `packages/functions/src/controllers/articleController.js:602` — first logger.error — the '[update] ... shopify userErrors' line in the alert
- `packages/functions/src/controllers/articleController.js:620` — second logger.error labelled 'after retry', emitted unconditionally on the echoed-back userErrors, producing the duplicate ERROR 76-432µs later
- `packages/functions/src/controllers/articleController.js:611` — the call whose result is treated as a retry outcome even when handleRetryOnError performed no call
- `packages/functions/src/helpers/articlesHelper.js:103` — image is re-sent on every save, so each autosave asks Shopify to re-download the shop's own CDN asset — the operation that timed out

## Evidence
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:22.600Z" AND timestamp<="2026-08-07T12:51:22.600Z" AND jsonPayload.message:"shopify userErrors"`
- 40 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:22.600Z" AND timestamp<="2026-08-07T12:51:22.600Z" AND httpRequest.requestMethod="PUT" AND httpRequest.requestUrl:"/api/article/28967075951"`
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:21:22.600Z" AND timestamp<="2026-08-07T12:51:22.600Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.13
- branch: `fix/prod-blog-3uakdf`
- fix commit: `7ee13439ba82bb6bc2ecd705c9b56002499dd303`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/870
- tests: 358 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../functions/src/controllers/articleController.js    |  7 +++++--
 packages/functions/src/helpers/articlesHelper.js      | 19 +++++++++++--------
 2 files changed, 16 insertions(+), 10 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
