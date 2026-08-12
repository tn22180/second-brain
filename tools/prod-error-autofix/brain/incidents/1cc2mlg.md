fingerprint: 1cc2mlg
service: api
message: [handleFetchPdfFiles] kozjvGcNBaGdLMGB7Pxq Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-12T07:26:46.515Z
status: mr_open
attempt: 1

# BLOG · api · 1cc2mlg

**Outcome.** duplicate of 8bd7iu — MR https://gitlab.com/avada/blogs/-/merge_requests/844

**Root cause.** handleFetchPdfFiles' catch logs an upstream Shopify Admin 401 at logger.error (pdfFileService.js:84), so a transient ~133 ms auth failure on shop kozjvGcNBaGdLMGB7Pxq paged the prod-error-alerts sink even though GET /api/shopify/pdf-files answered HTTP 200.

**Mechanism.** At 2026-08-05T08:20:52.3Z one merchant's embedded dashboard loaded 16 /api/* calls in 5.5s on api instance 001548f729da…; GET /api/shopify/pdf-files?limit=50&sort=CREATED_AT+true (routes/api.js:175 → shopifyController.getPdfFiles:664) called handleFetchPdfFiles → makeGraphQlApi (helpers/api.js:118), which POSTs the Admin GraphQL endpoint over axios. Shopify answered 401 for ~700 ms across that one instance/shop: shopifyRetryGraphQL already classified it correctly and logged `[shopifyRetryGraphQL] Request failed with status code 401` at WARNING (52.818087Z, helpers/api.js:158 via isShopifyAuthError at :151), then rethrew because 401 is not in RETRYABLE_STATUSES. 224 µs later handleFetchPdfFiles' own catch re-logged the identical AxiosError at logger.error (52.818322Z) — the exact entry the sink matched — before returning {data: [], pagination:{hasNext:false}}, so the HTTP response was 200/0.49s (request log confirms; the requests read at status>=500 returned 0 entries). The 401 is not a revoked token: the whole 24h of 2026-08-05 on service api contains exactly 3 lines naming kozjvGcNBaGdLMGB7Pxq — [handleFetchPdfFiles] 52.818322, [blockLoader] 52.839447, [getEnableBlocks] 52.951511 — all inside 133 ms on one instance, nothing before or after, and no uninstall/auth event for that shop anywhere in avada-blog-app over 2026-08-04..06. Same burst already recorded as fingerprint w6i1j5 (MR 856, errorHandler status mapping) — that MR fixes the /api/options 500 sibling, not this line. The alerting line itself is the same defect already patched on branch fix/prod-blog-1izzel4 (MR 843, open/unmerged): pdfFileService.js:84 → logger.warn when isShopifyAuthError(e). master still has the bare logger.error, and master's isShopifyAuthError (helpers/api.js:151) already reads e.response.status, so it matches this axios 401. Two peer call sites on the same burst also still log auth 401s at error — [blockLoader] and [getEnableBlocks] — so the pdf line alone does not silence this family.

Confidence: `high`

## Code
- `packages/functions/src/services/pdfFileService.js:84` — the exact alerting line — logger.error on an upstream Shopify auth 401 already logged at warn one frame up; already patched on branch fix/prod-blog-1izzel4 (MR 843, unmerged)
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError on master reads e?.response?.status — matches this axios AxiosError 401; the predicate the fix applies
- `packages/functions/src/helpers/api.js:158` — shopifyRetryGraphQL already downgrades the same error to logger.warn (the WARNING line at 52.818087Z), then rethrows because 401 is not retryable
- `packages/functions/src/helpers/api.js:118` — makeGraphQlApi — the axios call that produced 'Request failed with status code 401'
- `packages/functions/src/controllers/shopifyController.js:664` — getPdfFiles calls handleFetchPdfFiles — the caller in the alerted 200-response request
- `packages/functions/src/routes/api.js:175` — GET /shopify/pdf-files route, mounted at /api — the request logged 200 / 0.49s at 08:20:52.327Z

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T08:20:52Z" AND timestamp<="2026-08-05T08:20:54Z" AND jsonPayload.tag="[handleFetchPdfFiles]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"kozjvGcNBaGdLMGB7Pxq"`
- 16 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T08:20:50Z" AND timestamp<="2026-08-05T08:21:00Z" AND httpRequest.requestMethod!=""`
- 7 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-05T08:05:56.516Z" AND timestamp<="2026-08-05T08:35:56.516Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.33
- MR: https://gitlab.com/avada/blogs/-/merge_requests/844

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
