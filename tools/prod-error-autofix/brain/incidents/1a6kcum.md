fingerprint: 1a6kcum
service: apisagen2
message: The request failed because either the HTTP response was malformed or connection to the instance had an error. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#malformed-response-or-connection-error>
app: SEO
repo: seo
date: 2026-08-14T02:23:21.811Z
status: infra
attempt: 1

# SEO · apisagen2 · 1a6kcum

**Outcome.** infra class — reported, no MR

**Root cause.** apisagen2 instance 001548f729dfe2… was OOM-killed at 2048 MiB while serving GET /apiSa/scanFeatureWorking/pageSpeed, because scanFeaturePageSpeedWorking abandons its Puppeteer Chrome on a 60s Promise.race timeout without closing the browser, so orphaned Chrome processes accumulate in a 2GiB container that Cloud Run runs at concurrency: 10.

**Mechanism.** scanFeaturePageSpeedWorking races getPageContent against a 60s timer (packages/functions/src/services/featureCheckService.js:68-73). The loser of the race is not cancelled: getFullPageContent only closes the browser in its finally (packages/functions/src/helpers/utils/getPageContent.js:142), and that finally cannot run until page.goto settles — its own deadline is 120000 ms (packages/functions/src/helpers/utils/getPageContent.js:357). So every 'scan timed out' leaves one headless Chrome alive for up to another 60s while the request returns and the next one is admitted. apiSaGen2 is declared memory: '2GiB' with concurrency: 10 (packages/functions/src/handlers/exports/httpFunctions.js:56,58), so the timeouts stack on one container. Instance 001548f729dfe2… logged abandoned scans at 15:33:21.824Z and 15:34:22.719Z, then took two more /apiSa/scanFeatureWorking/pageSpeed requests at 15:35:21.736Z and 15:35:22.632Z; at 15:35:49.090Z the container hit 'Memory limit of 2048 MiB exceeded with 2048 MiB used' and was terminated. Both in-flight requests died with it — latencies 27.889s and 26.582s land their completion at ~15:35:49, exactly the kill, which is why one returned 503 'malformed response or connection to the instance had an error' and the other 500. 9 scan timeouts in 4 minutes across 4 instances shows the leak is the steady state, not a one-off.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/services/featureCheckService.js:68` — Promise.race abandons getPageContent on timeout; the losing promise (and its Chrome) is never cancelled
- `packages/functions/src/services/featureCheckService.js:71` — the 60000 ms reject that produces the exact '[scanFeaturePageSpeedWorking] scan timed out' string seen 9× in stderr
- `packages/functions/src/helpers/utils/getPageContent.js:142` — browser.close() only in finally — unreachable until page.goto settles, so the abandoned browser keeps its RSS
- `packages/functions/src/helpers/utils/getPageContent.js:357` — page.goto timeout 120000 is 2× the 60s race budget, so an orphan Chrome outlives the request by up to 60s
- `packages/functions/src/handlers/exports/httpFunctions.js:56` — apiSaGen2 declared memory: '2GiB' — the limit named in the kill line
- `packages/functions/src/handlers/exports/httpFunctions.js:58` — concurrency: 10 lets up to 10 puppeteer scans share one 2GiB container

## Evidence
- 1 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-13T15:20:56.626Z" AND timestamp<="2026-08-13T15:50:56.626Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 9 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-13T15:20:56.626Z" AND timestamp<="2026-08-13T15:50:56.626Z" AND textPayload:"scan timed out"`
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-13T15:20:56.626Z" AND timestamp<="2026-08-13T15:50:56.626Z" AND httpRequest.requestUrl:"scanFeatureWorking/pageSpeed" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $2.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
