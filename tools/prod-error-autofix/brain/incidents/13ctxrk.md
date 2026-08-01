fingerprint: 13ctxrk
service: lighthouseauditrunnergen2
message: HTTP 500 GET /lighthouse/auditNew
app: SEO
repo: seo
date: 2026-08-01T04:59:24.212Z
status: infra
attempt: 1

# SEO · lighthouseauditrunnergen2 · 13ctxrk

**Outcome.** infra class — reported, no MR

**Root cause.** lighthouseauditrunnerGen2 is declared memory: '4GiB' while a single mobile/densen4G Lighthouse+Chrome audit of https://www.mandotos.com peaks at 4104–4275 MiB, so the container is OOM-killed mid-request and Cloud Run answers 500 — 4 of the 5 HTTP 500s this service produced in 24h are these kills, 1:1 by instanceId.

**Mechanism.** performAudit (controllers/lightHouseController.js:102) launches headless Chrome per request and hands it to auditLightHouse, which runs Lighthouse with output: ['html','json'] (services/lightHouseService.js:261) so the trace, the LHR object and the rendered HTML report all stay resident in the same container. The function is declared memory: '4GiB', concurrency: 1 (handlers/exports/httpFunctions.js:71,73), so exactly one audit owns the whole 4096 MiB budget; mandotos.com's audit costs 4104–4275 MiB, 0.2–4.4% over. Each 500 ends at the exact instant of an OOM entry on the same instanceId: req 04:49:03.149849 + 263.043s = 04:53:26.19 vs OOM 04:53:26.504973 (instance 001548f72936558c…); req 04:50:00.282236 + 244.544s = 04:54:04.83 vs OOM 04:54:05.328027 (instance 001548f729b09d46…); req 04:51:00.272694 + 279.473s = 04:55:39.75 vs OOM 04:56:01.650760 (instance 001548f729e84f42…); req 04:53:01.858718 + 254.084s = 04:57:15.94 vs OOM 04:57:15.884187 (instance 001548f729761fd7…). No application log line exists for any of the four — expected, the container dies before any catch runs. It is not a leak across warm requests: 3 of the 4 killed instances died on their first request; 12 of the 16 audits in the same burst, same URL and params, finished 200 on the same 4GiB tier. Contributing load: all 16 audits ran 195.98–279.47s, every one longer than the caller's own AbortSignal.timeout(120000) in fetchLightHouse (services/lightHouseService.js:65), so the caller had already abandoned each result and re-fired — 16 identical audits of one URL in 5 minutes, each drawing again from a memory distribution whose tail sits above 4096 MiB.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:71` — memory: '4GiB' — the limit the log line names (4096 MiB)
- `packages/functions/src/handlers/exports/httpFunctions.js:73` — concurrency: 1 — one audit owns the whole budget, so 4275 MiB is a single audit, not co-tenancy
- `packages/functions/src/controllers/lightHouseController.js:102` — launchBrowser() per request — headless Chrome lives inside the 4096 MiB container
- `packages/functions/src/services/lightHouseService.js:261` — output: ['html','json'] keeps the rendered HTML report and the LHR resident simultaneously
- `packages/functions/src/services/lightHouseService.js:65` — AbortSignal.timeout(120000) — caller abandons at 120s while every audit ran 196–279s, driving the duplicate re-fire burst

## Evidence
- 4 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND severity>=ERROR AND textPayload:"Memory limit" AND timestamp>="2026-07-31T05:00:00Z" AND timestamp<="2026-08-01T05:08:27.045Z"`
- 5 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND httpRequest.status>=500 AND timestamp>="2026-07-31T05:00:00Z" AND timestamp<="2026-08-01T05:08:27.045Z"`
- 16 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND httpRequest.requestMethod="GET" AND timestamp>="2026-08-01T04:00:00Z" AND timestamp<="2026-08-01T05:08:00Z"`

## Job
- analyze rounds: 2
- cost: $2.64

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
