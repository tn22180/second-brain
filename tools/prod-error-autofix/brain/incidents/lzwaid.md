fingerprint: lzwaid
service: api
message: [update] yvdugQ1uIcIzQ5xdf8iN articleId: 580200104086 shopify userErrors after retry [{"message":"Internal error. Looks like something went wrong on our end.\nRequest ID: 1cb49ab8-2520-49c2-b260-5de45116e142-1788201391 (include this in support requests).","extensions":{"requestId":"1cb49ab8-2520-49c
app: BLOG
repo: blogs
date: 2026-08-31T18:47:36.758Z
status: fix_disabled
attempt: 1

# BLOG · api · lzwaid

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify's Admin GraphQL answered the articleUpdate mutation with HTTP 2xx carrying a top-level `errors` array (extensions.code INTERNAL_SERVER_ERROR), a shape neither shopifyRetryGraphQL nor handleRetryOnError handles, so all 4 saves of article 580200104086 for shop yvdugQ1uIcIzQ5xdf8iN were dropped and each emitted 3 ERROR lines.

**Mechanism.** updateArticlePrimary issues articleUpdate through makeGraphQlApi (shopifyGraphQlService.js:1249). Shopify returned an in-band GraphQL error body, not an HTTP error, so shopifyRetryGraphQL never entered its catch — its predicate is RETRYABLE_CODES.includes(e.code) || RETRYABLE_STATUSES.includes(e.response?.status) (api.js:165) and a 2xx returns straight out of `return await handler()` (api.js:156). Confirmed: 0 [shopifyRetryGraphQL] lines in the 30-min window against 4 failures. updateArticlePrimary then maps the transport-level fault into the userError channel: `if (resp.errors) { logger.error(...); return {userErrors: resp.errors}; }` (shopifyGraphQlService.js:1251-1253) — the first of the three ERROR lines per failure. articleController.update sees req.userErrors.length > 0, logs at ERROR (articleController.js:649) and calls handleRetryOnError (articleController.js:658). These objects carry only message/extensions and no `field`, so the 'Must reference an existing blog.' branch (articlesHelper.js:177) and the ['article','handle'].every(v => userErrors[0]?.field?.includes(v)) branch (articlesHelper.js:192) both miss, and the helper falls through to `return {userErrors}` (articlesHelper.js:208) without re-issuing any Shopify call — the 'after retry' log is byte-identical and 0.1-0.5 ms later (18:36:32.067242 → .067706). The controller logs 'shopify userErrors after retry' (articleController.js:667) and answers 200 {success:false} (articleController.js:675), which is why the requests read at status>=500 has 0 entries while the merchant's save is silently lost. 12 ERROR entries = 4 failed saves x 3 lines, spaced 18:36:32, 18:37:59, 18:38:54, 18:40:18 — the merchant retrying by hand.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:1251` — top-level GraphQL `errors` returned as `userErrors` with no retry and no error class — origin of the alerted line
- `packages/functions/src/services/shopifyGraphQlService.js:1252` — emits the [updateArticlePrimary] ... resp.errors ERROR seen 4x in the window
- `packages/functions/src/helpers/api.js:165` — retry predicate keys off thrown e.code / e.response.status; an HTTP 200 body carrying `errors` never reaches it
- `packages/functions/src/helpers/api.js:156` — `return await handler()` — success path that bypasses the whole backoff loop for in-band GraphQL errors
- `packages/functions/src/helpers/articlesHelper.js:192` — retry branch requires userErrors[0].field to contain article+handle; INTERNAL_SERVER_ERROR entries have no `field`
- `packages/functions/src/helpers/articlesHelper.js:208` — falls through returning the same userErrors untouched — the 'retry' the after-retry log claims never happened
- `packages/functions/src/controllers/articleController.js:667` — logs 'shopify userErrors after retry' at ERROR — the alert text
- `packages/functions/src/controllers/articleController.js:675` — answers 200 {success:false}, which is why the requests read has 0 entries at status>=500

## Evidence
- 12 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-31T18:22:02.759Z" AND timestamp<="2026-08-31T18:52:02.759Z" AND severity>=ERROR`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-31T18:22:02Z" AND timestamp<="2026-08-31T18:52:02Z" AND jsonPayload.message:"shopify userErrors after retry"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-31T18:22:02Z" AND timestamp<="2026-08-31T18:52:02Z" AND jsonPayload.message:"[updateArticlePrimary]" AND jsonPayload.message:"resp.errors"`

## Job
- analyze rounds: 1
- cost: $1.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
