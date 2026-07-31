fingerprint: 1whczpb
service: api
message: [getCrmWidgets] 3yhj0ZCmZ1wOF0cvipu4 Request failed with status code 400
app: BLOG
repo: blogs
date: 2026-07-31T04:19:43.074Z
status: mr_open
attempt: 1

# BLOG · api · 1whczpb

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/793

**Root cause.** public.avada.io/widget/list intermittently answers HTTP 400 (30 of ~596 /api/shops loads in 24h, 5.0%); getCrmWidgets already swallows it and returns an empty widget set, so no request fails — but it logs the swallowed failure at logger.error, which the severity>=ERROR sink turns into a Slack page, and it logs only e.message so the upstream 400 body is discarded and the CRM-side cause is undiagnosable.

**Mechanism.** GET /api/shops -> shopController.getUserShops runs getCrmWidgets(shopId) inside Promise.all (shopController.js:42). widgetService.getCrmWidgets calls api('https://public.avada.io/widget/list?ids=...&shopId=...&app=seoOnBlog') (widgetService.js:23); helpers/api.js:37 returns res.data and lets axios reject on non-2xx. On a 400 the catch at widgetService.js:34 logs logger.error('[getCrmWidgets]', shopId, e.message) and returns emptyResponse (widgetService.js:36), so the handler still answers 200 with widgets: []. helpers/logger.js emits a `severity: ERROR` field, so the prod-error-alerts sink matches and pages. Failure is not shop-specific: 26 distinct shopIds in 24h, and re-requesting the exact failing URL for 3yhj0ZCmZ1wOF0cvipu4 and ulekYNw6kIBkDm5y08vI now returns 200 with data, so the 400 is transient upstream, not a bad shopId or a malformed URL. Because only e.message is logged, the 400's response body never reaches the logs. (The other 8 stderr lines in the alert window — 'shopName must be a non-empty string' from node_modules/avada-feature-request — are a separate cause and are not this fingerprint.)

Confidence: `medium`

## Code
- `packages/functions/src/services/widgetService.js:23` — the external CRM call that returns 400
- `packages/functions/src/services/widgetService.js:35` — logs a fully-handled degradation at error severity, and logs only e.message so the 400 body/status is lost
- `packages/functions/src/services/widgetService.js:36` — returns emptyResponse — proves the failure is non-fatal to the request
- `packages/functions/src/controllers/shopController.js:42` — the only caller; runs inside Promise.all so its failure cannot fail the response
- `packages/functions/src/helpers/api.js:37` — axios wrapper rejects on non-2xx and surfaces only e.message to the caller
- `packages/functions/src/routes/api.js:55` — GET /shops -> getUserShops, the request path that triggers it

## Evidence
- 30 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T04:00:00Z" AND jsonPayload.tag="[getCrmWidgets]"`
- 566 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T04:00:00Z" AND httpRequest.requestUrl:"/shops" AND httpRequest.status=200`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T03:56:14.445Z" AND timestamp<="2026-07-31T04:26:14.445Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $2.23
- branch: `fix/prod-blog-1whczpb`
- fix commit: `982b9e86171e22306ae8c32e5522c9f0f1a0915e`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/793
- tests: 216 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/services/widgetService.js | 61 +++++++++++++++++++++---
 1 file changed, 55 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
