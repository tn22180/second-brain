fingerprint: 1ts4gf7
service: lighthouseauditrunnergen2
message: The request failed because either the HTTP response was malformed or connection to the instance had an error. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#malformed-response-or-connection-error>
app: SEO
repo: seo
date: 2026-10-01T07:39:39.095Z
status: infra
attempt: 1

# SEO · lighthouseauditrunnergen2 · 1ts4gf7

**Outcome.** infra class — reported, no MR

**Root cause.** A single mobile/densen4G Lighthouse+Chrome audit of https://www.djiusa.com/collections/accessories needs more than the 4096 MiB lighthouseauditrunnerGen2 is declared with, so each such request OOM-kills its own container; 16 of 16 kills in the window landed on 16 distinct fresh instances at concurrency: 1, which rules out per-container stacking.

**Mechanism.** lighthouseauditrunnerGen2 is deployed memory: '4GiB', concurrency: 1, timeoutSeconds: 540 (packages/functions/src/handlers/exports/httpFunctions.js:74,76,73). Every GET /lighthouse/auditNew launches its own headless Chrome (packages/functions/src/controllers/lightHouseController.js:118) and runs Lighthouse with output: ['html','json'] (packages/functions/src/services/lightHouseService.js:265), so the trace, the lhr, the JSON report and the self-contained HTML report are all live in the same process as Chrome. At concurrency: 1 that is one audit per container, so the kill is the memory cost of one audit, not of stacked requests. In 2026-10-01T04:55:30–05:25:30Z the service logged 16 'Memory limit of 4096 MiB exceeded' kills, reported usage 4096–4140 MiB, each carrying a different labels.instanceId on revision lighthouseauditrunnergen2-00384-wed, and the request log shows exactly 16 failures (14× 503 'malformed response or connection to the instance had an error', 2× 500) — a 1:1 request-to-kill match. The alerted 503 at 05:11:27.109818Z (latency 287.921s) is one of those killed containers. Amplifying but not causing it: all 21 GETs in 04:40–05:40Z are byte-identical (same shopId n9caJyShcfdIM8TGSxOB, same url, device=mobile, throttling=densen4G), arriving 05:01:24→05:08:29 with up to ~12 in flight, and the caller's fetch uses AbortSignal.timeout(120000) (packages/functions/src/services/lightHouseService.js:68) with no server-side cancellation, so a caller that gave up at 120s leaves a 4GiB container running the audit for up to the full 540s — 5 of the 21 returned 200 after 112–316s, i.e. 4 of 5 successes arrived after the caller had already aborted. Caller-side the only visible evidence is 2 '[getAuditResultByLightHouse] … The operation was aborted due to timeout' lines on apigen2 at 05:08:20/05:08:22Z; fetchLightHouse logs its dispatch at logger.info, which is silenced in prod, so the source of the remaining duplicate requests is not provable from these logs.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:74` — memory: '4GiB' — the exact limit named in all 16 kill lines
- `packages/functions/src/handlers/exports/httpFunctions.js:76` — concurrency: 1 — one audit per container, so 4103–4140 MiB is the cost of a single audit, not of stacked requests
- `packages/functions/src/handlers/exports/httpFunctions.js:73` — timeoutSeconds: 540 — an abandoned audit holds its 4GiB container for up to 9 minutes after the caller's 120s abort
- `packages/functions/src/controllers/lightHouseController.js:118` — launchBrowser() per request — a full headless Chrome inside the 4GiB budget
- `packages/functions/src/services/lightHouseService.js:265` — output: ['html','json'] — both report formats plus the lhr are materialized alongside the live Chrome
- `packages/functions/src/services/lightHouseService.js:68` — AbortSignal.timeout(120000) on the caller only; nothing cancels the server-side audit, so aborted requests keep burning a 4GiB container

## Evidence
- 16 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-10-01T04:55:30.810Z" AND timestamp<="2026-10-01T05:25:30.810Z" AND textPayload:"Memory limit of 4096 MiB exceeded"`
- 16 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-10-01T04:55:30.810Z" AND timestamp<="2026-10-01T05:25:30.810Z" AND httpRequest.status>=500`
- 21 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-10-01T04:40:00Z" AND timestamp<="2026-10-01T05:40:00Z" AND httpRequest.requestMethod="GET"`

## Job
- analyze rounds: 1
- cost: $2.86

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
