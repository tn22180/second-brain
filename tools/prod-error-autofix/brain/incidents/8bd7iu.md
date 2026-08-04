fingerprint: 8bd7iu
service: apisa
message: [handleFetchPdfFiles] ZeyGA7UaqrZBTQ1cgDW2 Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-04T11:08:22.495Z
status: mr_open
attempt: 1

# BLOG · apisa · 8bd7iu

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/844

**Root cause.** Duplicate of fingerprint 1izzel4 (MR https://gitlab.com/avada/blogs/-/merge_requests/843 open, unmerged): the same 23-line burst from uninstalled shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com, accessToken blanked at 2026-08-04T06:10:24Z) — handleFetchPdfFiles' catch logs the expected 401 at logger.error (pdfFileService.js:84), and MR 843 already patches that exact line to logger.warn via isShopifyAuthError.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and 'Cancelling subscription' at 06:10:24.433Z; uninstallApp wrote {accessToken: '', uninstalledAt} onto the shop doc (services/uninstallationService.js:31) but left the doc and the merchant's apiSa session cookie alive. /apiSa/*'s only gate is @avada/core verifyRequest() (handlers/apiSa.js:39), a session-cookie check that knows nothing about install state, so at 09:53:58Z the merchant's still-open standalone tab replayed a full dashboard load: 16 GET/POST /apiSa/* in 1.2s, all HTTP 200 (requests read at status>=500 returned 0 entries). Every handler resolved the same shop doc and called initShopify (services/shopifyService.js:23), which destructures accessToken with no guard on empty string, so every Admin call went out with a blank X-Shopify-Access-Token and Shopify answered 401 — 23 ERROR lines in one burst: getShopifyArticleById×5, shopifyRetryGraphQL×8, getMainThemeId×3, and one each of getShopifyArticles, getShopLocales, getProductsGraphQL, handleFetchPdfFiles, getEnableBlocks, blockLoader, getOne. The alerted line is GET /apiSa/shopify/pdf-files (routes/api.js:175 mounted at /apiSa by handlers/apiSa.js:40) → shopifyController.getPdfFiles:649 → handleFetchPdfFiles (pdfFileService.js:31); makeGraphQlApi threw the AxiosError 401, and handleFetchPdfFiles' catch logged it at logger.error (pdfFileService.js:84) before returning empty data — insertId 6a71b6b6000e97396d29ee44 at 09:53:59Z, revision apisa-00114-ces, the exact entry the sink matched. This is the seventh fingerprint cut from this one burst (16sagxr, 1pckik6, ve6kl7, 12v7fbr, ksxs3b, 1izzel4). Branch fix/prod-blog-1izzel4 (MR 843) already changes pdfFileService.js:84 to `if (isShopifyAuthError(e)) logger.warn(...) else logger.error(...)` — verified by `git diff master..fix/prod-blog-1izzel4 -- packages/functions/src/services/pdfFileService.js`. Nothing further to write: master lacks the fix only because MR 843 is unmerged. Not user-facing — the catch returns {data: [], pagination:{hasNext:false}} and the request answered 200.

Confidence: `high`

## Code
- `packages/functions/src/services/pdfFileService.js:84` — the exact alerting line — logger.error on the expected uninstalled-shop 401; already patched to warn on branch fix/prod-blog-1izzel4 (MR 843)
- `packages/functions/src/controllers/shopifyController.js:649` — getPdfFiles calls handleFetchPdfFiles — the caller in the alerted request
- `packages/functions/src/routes/api.js:175` — GET /shopify/pdf-files route, mounted at /apiSa
- `packages/functions/src/handlers/apiSa.js:39` — verifyRequest() is the only gate on /apiSa/* — session cookie only, no uninstalledAt check, which is why a post-uninstall tab still reaches these handlers
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError already exists and exported — the predicate MR 843 applies at pdfFileService.js:84
- `packages/functions/src/helpers/api.js:156` — shopifyRetryGraphQL already downgrades 401 to warn (df79f2e73), so only per-caller catches like this one still page
- `packages/functions/src/services/shopifyService.js:23` — initShopify destructures accessToken with no empty-string guard — every Admin call goes out unauthenticated after uninstall
- `packages/functions/src/services/uninstallationService.js:31` — uninstall writes {accessToken: '', uninstalledAt} and leaves shop doc and sessions alive

## Evidence
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND jsonPayload.tag="[handleFetchPdfFiles]"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND severity>=ERROR`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND httpRequest.requestMethod!=""`

## Job
- analyze rounds: 1
- cost: $1.76
- branch: `fix/prod-blog-8bd7iu`
- fix commit: `7cf74eb94707de66f252c087b2f17ca66f38c2b5`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/844
- tests: 297 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/services/pdfFileService.js | 8 ++++++--
 1 file changed, 6 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
