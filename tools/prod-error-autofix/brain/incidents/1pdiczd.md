fingerprint: 1pdiczd
service: api
message: [update] PfT1I1kh3E8vhWsUbmQA articleId: 576919568438 shopify userErrors [{"field":["article","handle"],"message":"Handle has already been taken"}]
app: BLOG
repo: blogs
date: 2026-08-12T17:10:20.998Z
status: mr_open
attempt: 1

# BLOG · api · 1pdiczd

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/874

**Root cause.** Not a request failure: `articleController.update` logs the pre-retry Shopify `userErrors` at `logger.error` (severity ERROR) before `handleRetryOnError` runs, and for the `['article','handle']` "Handle has already been taken" case that retry always recovers by re-issuing `updateShopifyArticle` with a uuid-suffixed handle — so the alert is a recovered condition escalated to the Slack sink, not a user-visible error.

**Mechanism.** Shopify's articleUpdate returned `[{"field":["article","handle"],"message":"Handle has already been taken"}]` because the handle derived from the merchant's title (`generateHandleFromTitle`, packages/functions/src/helpers/articlesHelper.js:148-152) collided with an existing article handle in shop PfT1I1kh3E8vhWsUbmQA. articleController.js:601 sees `req.userErrors.length > 0` and calls `logger.error` at line 602 — logger emits `severity: ERROR` (helpers/logger.js:77), which is exactly the `severity>=ERROR` predicate the prod-error-alerts sink matches, so Slack fired. Only *after* that log does line 611 call `handleRetryOnError`, whose handle branch (articlesHelper.js:187-204) rewrites `preparedData.handle` to `<handle>-<uuid6>-<epoch4>` and re-runs `updateShopifyArticle` for `status === 'update'`. The retry succeeded: execution_id n8uhoj3jaf12 emitted exactly one log line in the whole window (the pre-retry one), the `shopify userErrors after retry` branch at line 620 never fired for this shop/article, and requests with `httpRequest.status>=500` in the window = 0. The `update` handler returns 200 with `{success:true}` regardless, by design.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:602` — logger.error fires on the raw pre-retry userErrors — this is the exact log line in the alert, emitted before any recovery is attempted
- `packages/functions/src/controllers/articleController.js:611` — handleRetryOnError is only called after the ERROR log, so the recoverable case is already alerted on
- `packages/functions/src/helpers/articlesHelper.js:192` — hasArticleAndHandleError branch matches field ['article','handle'] exactly — the alert's userError
- `packages/functions/src/helpers/articlesHelper.js:201` — status === 'update' && id path re-issues updateShopifyArticle with the uuid-suffixed handle; this is the recovery that succeeded
- `packages/functions/src/controllers/articleController.js:620` — the only correct place for ERROR severity — post-retry failure; it did not fire for this article
- `packages/functions/src/helpers/logger.js:77` — logger.error writes severity ERROR, the predicate the prod-error-alerts sink filters on

## Evidence
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-11T00:00:00Z" AND jsonPayload.message:"shopify userErrors" AND jsonPayload.message:"Handle has already been taken"`
- 1 matching entries: `labels.execution_id="n8uhoj3jaf12" AND timestamp>="2026-08-10T13:00:00Z" AND timestamp<="2026-08-10T13:10:00Z"`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-11T00:00:00Z" AND jsonPayload.message:"shopify userErrors after retry"`

## Job
- analyze rounds: 2
- cost: $3.76
- branch: `fix/prod-blog-1pdiczd`
- fix commit: `89162aaad8e9b828aa695e5be7d017e740ad103c`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/874
- tests: 359 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/articleController.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
