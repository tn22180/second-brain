fingerprint: 1n79ojv
service: proxy
message: [getPreview] storefront non-200, retrying <http://33aa22.myshopify.com|33aa22.myshopify.com> articleId=629710291208 status=404 attempt=1/3
app: BLOG
repo: blogs
date: 2026-08-12T08:34:14.031Z
status: mr_open
attempt: 1

# BLOG · proxy · 1n79ojv

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/862

**Root cause.** Shopify's storefront does not serve a just-published article immediately, and fetchRenderedArticleHtml's retry window (3 attempts, fixed 1s delay, ~3.6s total) is shorter than that propagation delay — so each 404 attempt is logged at logger.error even though the request itself answers HTTP 200.

**Mechanism.** getPreview publishes the draft article (appProxyController.js:135 updateShopifyArticle isPublished:true), then fetchRenderedArticleHtml GETs https://<shop>/blogs/<blog>/<handle>?noCache=<uuid> (appProxyController.js:64) with validateStatus: status < 500, so a storefront 404 is not thrown but falls to the non-200 branch and is logged at logger.error (appProxyController.js:78) — that line is the exact alert text. PREVIEW_FETCH_MAX_ATTEMPTS=3 with a flat PREVIEW_REVERT_RETRY_DELAY_MS=1000 (appProxyController.js:16,18) gives 3 tries in 3.65s (15:17:04.146 → 15:17:07.795). All three 404'd, fetchRenderedArticleHtml returned null, and getPreview answered 200 with the 'Preview is being generated' page (appProxyController.js:152-158) — the requests read with httpRequest.status>=500 is empty and the matching request log is 200 / 5.82s. A repeat request for the same articleId 12.0s later (15:17:14.216, 3.07s) returned 200 with no non-200 line, i.e. the article did render once propagation caught up. Across 2026-08-01→08-12 there are 6 such lines / 4 events on 4 shops; 3 of the 4 events logged only attempt=1/3 and recovered on attempt 2.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/appProxyController.js:78` — logger.error emitting the exact alert text on a retry the code goes on to handle — attempts 1..n-1 are not failures
- `packages/functions/src/controllers/appProxyController.js:64` — the storefront GET whose 404 is being logged; validateStatus: status < 500 makes 404 a normal return
- `packages/functions/src/controllers/appProxyController.js:18` — PREVIEW_FETCH_MAX_ATTEMPTS = 3
- `packages/functions/src/controllers/appProxyController.js:16` — PREVIEW_REVERT_RETRY_DELAY_MS = 1000, reused as the fetch retry delay — flat, no backoff, 3.65s total window
- `packages/functions/src/controllers/appProxyController.js:152` — html === null path answers HTTP 200 with the 'Preview is being generated' page, which is why no 5xx request log exists
- `packages/functions/src/controllers/appProxyController.js:135` — the publish that precedes the fetch; the 404 is the storefront not yet reflecting it

## Evidence
- 3 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-06T15:17:00Z" AND timestamp<="2026-08-06T15:17:10Z" AND textPayload:"storefront non-200"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-01T00:00:00Z" AND textPayload:"storefront non-200"`
- 10 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-06T15:10:00Z" AND timestamp<="2026-08-06T15:25:00Z" AND httpRequest.requestUrl:"seoOn-preview"`

## Job
- analyze rounds: 1
- cost: $2.80
- branch: `fix/prod-blog-1n79ojv`
- fix commit: `3bd42d491fe4c31a42601e0ed77c4e4bec51ce34`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/862
- tests: 360 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/controllers/appProxyController.js          | 29 +++++++++++++++-------
 1 file changed, 20 insertions(+), 9 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
