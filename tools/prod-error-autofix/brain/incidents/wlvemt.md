fingerprint: wlvemt
service: proxy
message: [getPreview] <http://thehumanspirit.myshopify.com|thehumanspirit.myshopify.com> Error fetching the resource: Request failed with status code 503
app: BLOG
repo: blogs
date: 2026-08-12T17:33:34.192Z
status: deferred
attempt: 1

# BLOG · proxy · wlvemt

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** The storefront HTML fetch inside getPreview's retry loop is configured with `validateStatus: status => status < 500`, so a transient HTTP 503 from thehumanspirit.myshopify.com's storefront rejects immediately instead of entering the retry branch, propagating out of fetchRenderedArticleHtml into getPreview's catch, which answers HTTP 500.

**Mechanism.** The single stderr line in the window is `[getPreview] thehumanspirit.myshopify.com Error fetching the resource: Request failed with status code 503` — that string is axios's own error message format, so the throwing call is an axios call, not shopify-api-node/got (which formats `Response code 503 (Service Unavailable)`). Every makeGraphQlApi path is wrapped by shopifyRetryGraphQL, which logs `[shopifyRetryGraphQL]` on any failure and retries 503 up to 5× with 1–6s backoff; there is no such line in the window and the request latency is 1.389186160s, far under that backoff, so no Admin GraphQL call threw. `[updateShopifyArticle]` logs-and-rethrows and is absent, so both the publish (appProxyController.js:135) and the revert in finally succeeded; `[getShopifyArticleById]` is absent, so the article resolved with `blog.handle`. That leaves exactly one axios call reachable on this path: `axios.get(url)` on `https://thehumanspirit.myshopify.com/blogs/<blog>/<handle>?noCache=…` at appProxyController.js:64. Its `validateStatus: status => status < 500` (line 73) is what makes 4xx fall through to the `storefront non-200, retrying` branch (line 78) — the 404/410 'storefront has not served the just-published article yet' case. A 5xx is outside that predicate, so axios rejects on attempt 1, the loop never runs attempts 2–3, the `return null` soft path at line 152 (which renders 'Preview is being generated, please refresh in a moment.') is never reached, and the catch at line 162 logs and sets 500.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appProxyController.js:73` — `validateStatus: status => status < 500` — a storefront 503 rejects instead of being handled as a retryable non-200; this is the defect
- `packages/functions/src/controllers/appProxyController.js:64` — the axios.get whose rejection message is exactly `Request failed with status code 503`; only axios call on the getPreview path
- `packages/functions/src/controllers/appProxyController.js:78` — the retry branch that is unreachable for 5xx, so attempts 2/3 never run — no `storefront non-200, retrying` line in the window
- `packages/functions/src/controllers/appProxyController.js:152` — the soft `Preview is being generated` response a transient storefront 5xx should degrade to instead of a 500
- `packages/functions/src/controllers/appProxyController.js:162` — the catch that emitted the alert text and set ctx.status = 500
- `packages/functions/src/helpers/api.js:155` — shopifyRetryGraphQL logs `[shopifyRetryGraphQL]` on every failure and retries 503 — its absence in the window rules out all makeGraphQlApi calls as the source
- `packages/functions/src/services/shopifyGraphQlService.js:1186` — updateShopifyArticle logs `[updateShopifyArticle]` and rethrows — absent, so publish and revert both succeeded and execution reached the storefront fetch

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-10T20:44:00Z" AND timestamp<="2026-08-10T20:47:30Z" AND logName:"stderr"`
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-10T20:30:54.878Z" AND timestamp<="2026-08-10T21:00:54.878Z" AND httpRequest.status>=500`
- 19 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-08T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND jsonPayload.tag="[getPreview]"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
