fingerprint: 1szehrm
service: apigen2
message: [event-tracker] trackEvent failed after retries
app: SEO
repo: seo
date: 2026-08-14T11:03:24.647Z
status: infra
attempt: 1

# SEO · apigen2 · 1szehrm

**Outcome.** infra class — reported, no MR

**Root cause.** BigQuery rejected two fire-and-forget streaming inserts from falcon-event-tracker at 06:02:49Z and 06:03:07Z with "Table is truncated." — the shared cross-app analytics table (plaza-staging-3.product_analytics.events) had just been truncated/recreated outside this project, so its streaming buffer was unavailable; no avada-seo code path and no merchant request failed.

**Mechanism.** packages/functions/src/handlers/api.js:67 mounts setupEventTracker with appId 'seoSuite' (APP_ID at api.js:26), which matches jsonPayload.app_id='seoSuite' on both error entries. The SDK POSTs each event as a BigQuery streaming insert into the shared events table named in docs/features/product-analytics-tracking.md:154 (plaza-staging-3.product_analytics.events). BigQuery returns "Table is truncated." for streaming inserts issued while a table's streaming buffer is torn down after a TRUNCATE / WRITE_TRUNCATE load; the SDK exhausted its internal retries and emitted '[event-tracker] trackEvent failed after retries' with error='Table is truncated.'. The failing code is inside the npm package falcon-event-tracker@^0.6.0 (packages/functions/package.json:69), which is not vendored in this repo — nothing in packages/functions/src produced the error, and because trackEvent is fire-and-forget the request itself was unaffected (requests read with httpRequest.status>=500 = 0 matches in the 30-minute window).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/api.js:67` — setupEventTracker mounted on apigen2 with appId 'seoSuite' — the only producer of '[event-tracker]' lines on this service; app_id in both error payloads is 'seoSuite'
- `packages/functions/src/handlers/api.js:26` — APP_ID = 'seoSuite' constant that the log payload's app_id field carries
- `packages/functions/package.json:69` — falcon-event-tracker ^0.6.0 — the retry loop and the failing streaming insert live in this npm package, not in packages/functions/src, so there is no repo line to patch
- `docs/features/product-analytics-tracking.md:154` — names the destination table plaza-staging-3.product_analytics.events, a table shared by all 6 Falcon apps and owned by the product-analytics repo — the object that was truncated

## Evidence
- 2 matching entries: `jsonPayload.message="[event-tracker] trackEvent failed after retries" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T07:00:00Z"`
- 2 matching entries: `jsonPayload.error="Table is truncated." AND timestamp>="2026-08-14T05:48:29Z" AND timestamp<="2026-08-14T06:18:29Z"`
- 200 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T05:48:29.023Z" AND timestamp<="2026-08-14T06:18:29.023Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $3.54

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
