fingerprint: 1th7fsw
service: api
message: [setupTemplates] error get template page tag HTTPError: Response code 404 (Not Found)
app: BLOG
repo: blogs
date: 2026-07-31T04:35:30.919Z
status: mr_open
attempt: 1

# BLOG · api · 1th7fsw

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/794

**Root cause.** setupTemplates uses `shopify.asset.get(themeId, {'asset[key]': 'templates/page.avada-articles-tags.liquid'})` as an existence probe, and Shopify's Admin REST answers HTTP 404 when the asset is absent — the normal case for a shop that does not yet have the template — but the .catch logs that expected miss via logger.error, which emits severity ERROR and pages the prod-error-alerts sink.

**Mechanism.** afterLoginService fires setupTemplates fire-and-forget (packages/functions/src/services/after-login.service.js:37). Inside, line 97-99 calls shopify.asset.get for the template key; shopify-api-node's got client throws HTTPError 'Response code 404 (Not Found)' when the asset does not exist on the main theme, which is exactly the log message and got stack in the alert. The .catch on line 99-101 logs it at logger.error (helpers/logger.js emits `severity: ERROR`, BLOG being the only app with that fix), so the sink matches it and Slack pages. Control flow then falls through to line 102: existingTemplate is undefined, so asset.create runs and installs the template — 0 of 17 occurrences in 7 days produced the sibling 'error create template' line, so the create leg always succeeded. No HTTP request failed: 0 entries with httpRequest.status>=500 in the alert window, because the call is `void`-ed off the login response.

Confidence: `high`

## Code
- `packages/functions/src/services/after-login.service.js:97` — shopify.asset.get used as an existence probe — 404 is the API's normal 'asset not found' answer, not a fault
- `packages/functions/src/services/after-login.service.js:100` — the exact log statement producing '[setupTemplates] error get template page tag' at logger.error severity
- `packages/functions/src/services/after-login.service.js:103` — the create leg that runs on the 404 path and succeeds — proves the 404 is benign, not a failed setup
- `packages/functions/src/services/after-login.service.js:37` — call site is void/fire-and-forget, so this never becomes an HTTP 5xx — consistent with requests=0 in the window

## Evidence
- 17 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T05:00:00Z" AND timestamp<="2026-07-31T05:00:00Z" AND jsonPayload.message:"error get template page tag"`
- 17 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T05:00:00Z" AND timestamp<="2026-07-31T05:00:00Z" AND jsonPayload.tag="[setupTemplates]"`
- 17 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-24T00:00:00Z" AND timestamp<="2026-07-31T05:00:00Z" AND jsonPayload.message:"error get template page tag"`

## Job
- analyze rounds: 2
- cost: $2.56
- branch: `fix/prod-blog-1th7fsw`
- fix commit: `55d1b8bf90f3e6b5e1d6790538eab9423b726876`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/794
- tests: 214 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/services/after-login.service.js | 14 +++++++++++---
 1 file changed, 11 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
