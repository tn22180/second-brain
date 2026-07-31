fingerprint: 1i6gqkt
service: apisa
message: [getCrmWidgets] mPATvvR7OiUGuZCDvuS2 Request failed with status code 400
app: BLOG
repo: blogs
date: 2026-07-30T13:50:32.626Z
status: inconclusive
attempt: 1

# BLOG · apisa · 1i6gqkt

**Outcome.** MR not opened: push_failed

**Root cause.** The external CRM widget endpoint https://public.avada.io/widget/list intermittently answers HTTP 400 (21 times in 24h across 13 distinct shopIds, against 566 successful GET /shops loads = 3.7%); getCrmWidgets catches it, returns an empty widget set, and the request still succeeds — the alert is a caught, non-fatal degraded path whose logger.error discards the upstream body, so the 400 reason is not recoverable from the logs.

**Mechanism.** GET /shops → routes/api.js:55 → shopController.getUserShops → Promise.all includes getCrmWidgets(shopId) (shopController.js:42). getCrmWidgets builds the CRM URL with six hardcoded widget ids plus shopId and app=seoOnBlog (widgetService.js:24) and calls api(), which is a bare axios client.request whose promise rejects on any non-2xx (helpers/api.js:28-37). Axios rejects with message 'Request failed with status code 400'; the catch at widgetService.js:34 logs only e.message — e.response.data is dropped — and returns emptyResponse at line 36, so ctx.body still spreads an empty widgets/appOptions/appSectionOptions and the endpoint answers 200. Confirmed non-fatal: 566 of 573 /shops entries in the window were 200, 7 were 401, zero 5xx, and the requests read for the alert window returned 0 entries. The failure is not shop-specific or input-specific: re-issuing the exact URL for the alerted shopId mPATvvR7OiUGuZCDvuS2 returned HTTP 200 with a full widget payload on 15 of 15 attempts, and no shopId in the 24h set failed more than 3 times.

Confidence: `medium`

## Code
- `packages/functions/src/services/widgetService.js:24` — the outbound CRM call that returned 400 — public.avada.io/widget/list with ids, shopId, app=seoOnBlog
- `packages/functions/src/services/widgetService.js:35` — the exact log line in the alert; logs only e.message, so the upstream 400 response body is never captured
- `packages/functions/src/services/widgetService.js:36` — returns emptyResponse — proves the 400 does not fail the request, only silently blanks the widget area
- `packages/functions/src/controllers/shopController.js:42` — getCrmWidgets sits inside the Promise.all of getUserShops, the GET /shops handler
- `packages/functions/src/helpers/api.js:37` — api() has no non-2xx handling, no retry and no interceptor — axios rejects with a status-only message

## Evidence
- 21 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-07-29T12:00:00Z" AND textPayload:"getCrmWidgets"`
- 573 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apisa") AND timestamp>="2026-07-29T12:00:00Z" AND httpRequest.requestUrl:"/shops"`
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-07-30T11:47:29.846Z" AND timestamp<="2026-07-30T12:17:29.846Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.91
- fix commit: `94b2b938094c005153522aa2577d5a97e269a2a4`
- tests: 197 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/services/widgetService.js | 20 ++++++++++++++++++--
 1 file changed, 18 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
