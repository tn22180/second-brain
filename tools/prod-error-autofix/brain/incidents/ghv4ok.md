fingerprint: ghv4ok
service: lighthouseauditrunnergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-04T16:37:25.432Z
status: infra
attempt: 1

# SEO · lighthouseauditrunnergen2 · ghv4ok

**Outcome.** infra class — reported, no MR

**Root cause.** Two of 62 lighthouseauditrunnerGen2 cold-start containers in the 15:30–16:30Z hour never bound :8080 and were killed at 240.12s / 241.64s — exactly the service's configured startupProbe timeoutSeconds: 240 with failureThreshold: 1 — while the other 60 booted in a median of 22.3s on the same revision 00292-ray, so this is an infra-side cold-start stall, not an application bug.

**Mechanism.** lighthouseauditrunnerGen2 is declared concurrency: 1 with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:68-78), and a single mobile/densen4G audit of https://www.mandotos.com runs 202.9–285.4s (three 200s in the window), so Cloud Run must start a fresh instance for essentially every request: 62 'Starting new instance. Reason: AUTOSCALING' against 47 requests in 60 minutes. Measured start→'STARTUP TCP probe succeeded' delta over the 60 successful boots: min 10.48s, median 22.31s, p90 41.44s, max 207.34s. The two failed instances started at 16:00:07.359Z (001548f729221beb…) and 16:00:09.122Z (001548f729264277…) and logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' at 16:04:08.995Z and 16:04:09.243Z — 241.64s and 240.12s later, matching `gcloud run services describe` startupProbe {tcpSocket:8080, failureThreshold: 1, periodSeconds: 240, timeoutSeconds: 240} to within 1.7s (pattern P4). Neither instance emitted a single application line — no module-load error, no OOM line, nothing — so nothing in the process got to run; the same image on the same revision booted 60 times in the same hour. The caller (userAgent 'node', retrying the same shopId=H7Mp9P0k2AnZlMlRFrp0 / url=www.mandotos.com every ~60s) saw the fallout as one 503 'The request failed because the instance failed the readiness check' at 16:00:07.286Z with latency 241.189s (again the 240s probe budget) and one 500 'The request was aborted because there was no available instance' at 16:01:09.111Z with latency 0s. Two other 4GiB-cap symptoms sit behind the same window and are NOT this alert's cause: 3× 'Memory limit of 4096 MiB exceeded with 4112/4167/4171 MiB used' (packages/functions/src/handlers/exports/httpFunctions.js:71 declares memory: '4GiB'), which kill the one in-flight audit each and leave no app log (P3), and 1× puppeteer 'Timed out after 30000 ms while waiting for the WS endpoint URL' at 16:03:53Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:68` — lighthouseauditrunnerGen2 export — the service whose cold starts failed the 240s startup TCP probe
- `packages/functions/src/handlers/exports/httpFunctions.js:73` — concurrency: 1 with no minInstances in the same options object — forces a fresh cold start per request (62 starts / 47 requests), so a 3.2% boot-stall rate becomes user-facing 503s
- `packages/functions/src/handlers/exports/httpFunctions.js:71` — memory: '4GiB' — the limit the 3 OOM kills (4112/4167/4171 MiB) in the same hour exceeded; separate symptom, same undersized-tier question
- `packages/functions/src/controllers/lightHouseController.js:102` — launchBrowser() sits OUTSIDE the try, so the puppeteer 30s WS-endpoint timeout escapes performAudit instead of hitting handleAuditError — matches stack 'at async performAudit (lib/controllers/lightHouseController.js:108:19)'
- `packages/functions/src/middleware/errorHandler.js:30` — await ctx.render('error', …) on any non-application/json accept — this Koa app has no view engine, so the handler itself throws 'TypeError: ctx.render is not a function' (lib/middleware/errorHandler.js:40) and the real error never reaches the client

## Evidence
- 2 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 62 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"Starting new instance"`
- 60 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 6 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND httpRequest.status>=500`
- 3 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"Memory limit of 4096 MiB exceeded"`
- 2 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"WS endpoint URL"`
- 1 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-04T15:30:00Z" AND timestamp<="2026-08-04T16:30:00Z" AND textPayload:"ctx.render is not a function"`

## Job
- analyze rounds: 1
- cost: $2.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
