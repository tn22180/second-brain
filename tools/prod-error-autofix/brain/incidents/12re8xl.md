fingerprint: 12re8xl
service: api
message: [update] yvdugQ1uIcIzQ5xdf8iN articleId: 580200104086 shopify userErrors [{"message":"Internal error. Looks like something went wrong on our end.\nRequest ID: 1cb49ab8-2520-49c2-b260-5de45116e142-1788201391 (include this in support requests).","extensions":{"requestId":"1cb49ab8-2520-49c2-b260-5de45
app: BLOG
repo: blogs
date: 2026-08-31T18:46:08.299Z
status: fix_disabled
attempt: 1

# BLOG · api · 12re8xl

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify's Admin GraphQL answered the articleUpdate mutation with HTTP 2xx and a top-level `errors` array (`extensions.code: INTERNAL_SERVER_ERROR`), and nothing in the app retries that shape — `shopifyRetryGraphQL` only retries thrown HTTP/socket failures and `handleRetryOnError` only matches `field`-based userErrors — so all 4 saves of article 580200104086 for shop yvdugQ1uIcIzQ5xdf8iN failed and each logged ERROR twice.

**Mechanism.** `updateArticlePrimary` issues the articleUpdate mutation through `makeGraphQlApi` (shopifyGraphQlService.js:1249). Shopify returned an in-band GraphQL error body, not an HTTP error: `shopifyRetryGraphQL` retries only inside its catch, gated on `RETRYABLE_CODES.includes(e.code) || RETRYABLE_STATUSES.includes(e.response?.status)` (api.js:165), and a 2xx never enters that catch — confirmed by 0 `[shopifyRetryGraphQL]` lines in the window against 4 failures. `updateArticlePrimary` then maps the transport-level failure into the userError channel: `if (resp.errors) { logger.error(...); return {userErrors: resp.errors}; }` (shopifyGraphQlService.js:1251-1253) — this is the `[updateArticlePrimary] ... resp.errors` line, first of the three per failure. `articleController.update` sees `req.userErrors.length > 0`, logs at ERROR (articleController.js:649) and calls `handleRetryOnError` (articleController.js:658). Those objects carry only `message`/`extensions`, no `field`, so the 'Must reference an existing blog.' branch (articlesHelper.js:177-178) and the `['article','handle'].every(v => userErrors[0]?.field?.includes(v))` branch (articlesHelper.js:192) both miss and the helper falls through to `return {userErrors}` (articlesHelper.js:208) without re-issuing anything. The controller then logs `shopify userErrors after retry` (articleController.js:667) and answers 200 `{success:false}` (articleController.js:675) — so the merchant's save is silently lost, the requests read shows 0 entries at status>=500, and every occurrence emits 3 ERROR lines (12 = 4×3).

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:1251` — top-level GraphQL `errors` are returned as `userErrors` with no retry and no error class — origin of the alerted line
- `packages/functions/src/services/shopifyGraphQlService.js:1252` — emits the `[updateArticlePrimary] ... resp.errors` ERROR seen 4× in the window
- `packages/functions/src/helpers/api.js:165` — retry predicate keys off thrown `e.code`/`e.response.status`; an HTTP 200 body carrying `errors` never reaches it
- `packages/functions/src/helpers/api.js:156` — `return await handler()` — the success path that bypasses the whole backoff loop for in-band GraphQL errors
- `packages/functions/src/helpers/articlesHelper.js:192` — retry branch requires `userErrors[0].field` to contain article+handle; INTERNAL_SERVER_ERROR entries have no `field`
- `packages/functions/src/helpers/articlesHelper.js:208` — falls through returning the same userErrors untouched — the 'retry' the after-retry log claims never happened
- `packages/functions/src/controllers/articleController.js:667` — logs `shopify userErrors after retry` at ERROR — the alert text
- `packages/functions/src/controllers/articleController.js:675` — answers 200 `{success:false}`, which is why the requests read has 0 entries at status>=500

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-31T18:22:01Z" AND timestamp<="2026-08-31T18:52:01Z" AND jsonPayload.message:"shopify userErrors after retry"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-31T00:00:00Z" AND timestamp<="2026-09-01T00:00:00Z" AND jsonPayload.message:"[updateArticlePrimary]" AND jsonPayload.message:"resp.errors"`
- 12 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-31T18:22:01.508Z" AND timestamp<="2026-08-31T18:52:01.508Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
