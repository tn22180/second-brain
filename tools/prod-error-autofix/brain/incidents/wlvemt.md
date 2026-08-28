fingerprint: wlvemt
service: proxy
message: [getPreview] <http://nv7zc0-uv.myshopify.com|nv7zc0-uv.myshopify.com> Error fetching the resource: Request failed with status code 503
app: BLOG
repo: blogs
date: 2026-08-28T02:53:55.436Z
status: fix_disabled
attempt: 1

# BLOG · proxy · wlvemt

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** fetchRenderedArticleHtml's storefront axios.get uses `validateStatus: status => status < 500`, so nv7zc0-uv.myshopify.com's transient HTTP 503 rejects on attempt 1 instead of entering the non-200 retry branch; the rejection escapes into getPreview's catch, which answers HTTP 500.

**Mechanism.** Both alerted 500s (07:59:35.017Z lat 1.296s, 07:59:36.552Z lat 0.973s) are the same GET /proxy/seoOn-preview?id=637744382015&shop=nv7zc0-uv.myshopify.com, and each is paired 1:1 with one stderr line `[getPreview] nv7zc0-uv.myshopify.com Error fetching the resource: Request failed with status code 503`. That string is axios's own error-message format, not shopify-api-node/got's `Response code 503 (Service Unavailable)`, so the thrower is an axios call. A full dump of every proxy log line in the 30-minute window shows exactly 2 tagged application entries — both the above. No `[shopifyRetryGraphQL]` line, and shopifyRetryGraphQL logs on every single failure before deciding retryability (api.js:161), so no makeGraphQlApi call threw; 503 is in its RETRYABLE_STATUSES and would have retried with 1-6s backoff anyway, which does not fit a 0.97s request. No `[updateShopifyArticle]` line (shopifyGraphQlService.js:1191 logs-and-rethrows), so the publish at appProxyController.js:136 and the revert in `finally` both succeeded. No `[getShopifyArticleById]` line, so the article resolved with `blog.handle`. That leaves one reachable axios call on the path: `axios.get(url)` on `https://nv7zc0-uv.myshopify.com/blogs/<blog>/<handle>?noCache=…` at appProxyController.js:65. Its `validateStatus: status => status < 500` (line 74) admits 4xx into the `storefront non-200, retrying` branch (line 79) — the 404/410 'storefront has not served the just-published article yet' case — but a 5xx is outside the predicate, so axios rejects on attempt 1. Confirming that: there is no `storefront non-200, retrying` line in the window, so attempts 2-3 never ran, the soft `Preview is being generated` degrade at line 153 was never reached, and the catch at line 171 emitted the alert text and set ctx.status = 500.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appProxyController.js:74` — `validateStatus: status => status < 500` — a storefront 503 rejects instead of being handled as a retryable non-200. This is the defect.
- `packages/functions/src/controllers/appProxyController.js:65` — the axios.get whose rejection message is exactly `Request failed with status code 503`; the only axios call reachable on the getPreview path
- `packages/functions/src/controllers/appProxyController.js:79` — the retry branch unreachable for 5xx — its `storefront non-200, retrying` line is absent from the window, proving attempts 2/3 never ran
- `packages/functions/src/controllers/appProxyController.js:153` — the soft `Preview is being generated, please refresh in a moment.` response a transient storefront 5xx should degrade to instead of a 500
- `packages/functions/src/controllers/appProxyController.js:171` — the catch that emitted the alert text and set ctx.status = 500
- `packages/functions/src/helpers/api.js:161` — shopifyRetryGraphQL logs `[shopifyRetryGraphQL]` on every failure before retrying — its absence in the window rules out every makeGraphQlApi call as the thrower
- `packages/functions/src/services/shopifyGraphQlService.js:1191` — updateShopifyArticle logs `[updateShopifyArticle]` and rethrows — absent, so the publish at line 136 succeeded and execution reached the storefront fetch

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-27T07:44:51.511Z" AND timestamp<="2026-08-27T08:14:51.511Z" AND logName:"stderr"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-27T07:44:51.511Z" AND timestamp<="2026-08-27T08:14:51.511Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-28T00:00:00Z" AND jsonPayload.tag="[getPreview]" AND jsonPayload.message:"status code 503"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
