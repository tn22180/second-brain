fingerprint: 1jt9dai
service: lighthouseauditrunnergen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-07-31T20:52:39.646Z
status: infra
attempt: 1

# SEO · lighthouseauditrunnergen2 · 1jt9dai

**Outcome.** infra class — reported, no MR

**Root cause.** One audit request to lighthouseauditrunnerGen2 sat queued for its caller's full 120s budget and was never placed on a container, because the service runs concurrency: 1 with no minInstances while each audit pins one instance for 113–160s — so Cloud Run recorded it as 'no available instance' (latency 0s, 1 occurrence in 24h).

**Mechanism.** Chain, end to end, all timestamps from avada-seo logs on 2026-07-31: (1) 20:38:18.011 scanissuessubscribergen2 logs '[subscribeScanIssues] Scanning issues for shop dNMafIfF0lyIx5lXCziI manual'; at 20:38:20.76–20:38:20.77 it fans out 4 parallel '[getLightHouseData] ... useGoogleApi: true' audits for rtfactflowers.co.uk. (2) Three finish on Google PSI ('[getGooglePageSpeedScore] done' at 55397ms, 69050ms, 194285ms). The fourth, url https://rtfactflowers.co.uk//collections/anniversary, fails at 20:44:21.391 with '360617ms status=ERR ... network timeout at: https://pagespeedonline.googleapis.com/...' — note 360.6s despite the gaxios {timeout: 120000} at helpers/google.js:86, so that cap did not bind. maxRetries defaults to 0, so the catch returns SPEED_SCORE_DEFAULT_VALUE (google.js:123). (3) getLightHouseData reads resp?.respData?.lighthouseResult (lightHouseService.js:460); the default sentinel carries none, so it falls through to the fallback fetchLightHouse at lightHouseService.js:473 with useCustom: true. (4) That builds https://<baseUrl>/lighthouse/auditNew?...&useAvadaLightHouse=true (lightHouseService.js:61-63) and fetches it with AbortSignal.timeout(120000) (lightHouseService.js:65). The alert's request URL matches this construction field for field — device=mobile, throttling=densen4G, uploadResult=true, shopId=dNMafIfF0lyIx5lXCziI, useAvadaLightHouse=true, and the same doubled slash in the path. (5) The runner never served it: at 20:46:23.656 the caller logs '[getAuditResultByLightHouse] dNMafIfF0lyIx5lXCziI The operation was aborted due to timeout' — 122.3s after the fallback started, i.e. its own AbortSignal firing — and 2.2s later, at 20:46:25.866, Cloud Run writes the 500 'The request was aborted because there was no available instance' with httpRequest.latency '0s' and no instanceId, meaning it was queued and never dispatched to a container. (6) Capacity ceiling: gcloud run services describe lighthouseauditrunnergen2 (revision lighthouseauditrunnergen2-00286-lat) confirms containerConcurrency: 1, timeoutSeconds: 540, autoscaling.knative.dev/maxScale '100'; source is packages/functions/src/handlers/exports/httpFunctions.js:68-78 — concurrency: 1, memory '4GiB', no minInstances, no maxInstances. Every one of the 5 request-log entries in 20:30–21:05 that reached a container ran 112.98s, 131.98s, 137.24s, 141.01s and 159.66s, so at concurrency 1 each in-flight audit holds an entire 4GiB instance for over two minutes and one new instance must cold-start per concurrent request. Cold start measured on the system log: 'Starting new instance' 20:44:21.517 → 'STARTUP TCP probe succeeded' 20:44:41.844 = 20.3s; 20:46:24.126 → 20:46:37.230 = 13.1s. 17 'Starting new instance' events fired in 20:20–21:00. maxScale=100 was never approached, so the instance cap is NOT the binding constraint — the 1-request-per-instance ceiling plus a 13–20s cold start is. NOT ESTABLISHED FROM LOGS: why this particular queued request was still unplaced at +122s when three startup probes succeeded at 20:45:46.359/20:45:46.810/20:45:46.815 and one at 20:46:04.157 — Cloud Run does not log queue-to-instance assignment, so the queue ordering behind those slots is not visible. Also note request logging in this project is not complete: only 6 request entries exist for 19:00–21:30 against 17 instance starts in 40 minutes, so request-log counts understate real traffic and were not used to compute load.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:68` — lighthouseauditrunnerGen2 declared onRequest with concurrency: 1, memory '4GiB', timeoutSeconds 540 and no minInstances/maxInstances — the 1-slot-per-instance ceiling that produced the abort
- `packages/functions/src/services/lightHouseService.js:65` — caller's fetch uses AbortSignal.timeout(120000); the 122.3s gap between the fallback start (20:44:21.39) and '[getAuditResultByLightHouse] ... aborted due to timeout' (20:46:23.656) is this budget expiring while the request sat queued
- `packages/functions/src/services/lightHouseService.js:473` — the fallback call to the self-hosted runner — the code path that generated the aborted request after PSI failed
- `packages/functions/src/services/lightHouseService.js:460` — resp?.respData?.lighthouseResult is falsy for the SPEED_SCORE_DEFAULT_VALUE sentinel, so a PSI failure silently routes the audit onto the concurrency-1 runner with no log line
- `packages/functions/src/helpers/google.js:86` — gaxios {timeout: 120000} on the PSI call did not bind — the logged attempt ran 360617ms before erroring, which is what pushed the fallback into the runner
- `packages/functions/src/helpers/google.js:123` — on failure returns SPEED_SCORE_DEFAULT_VALUE instead of throwing, so getLightHouseData's 'Google PageSpeed API failed' logger.error at lightHouseService.js:463 never fires for this path

## Evidence
- 1 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-07-31T00:00:00Z" AND timestamp<="2026-08-01T00:00:00Z" AND textPayload:"no available instance"`
- 8 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-07-31T20:38:00Z" AND timestamp<="2026-07-31T20:52:00Z" AND textPayload:"dNMafIfF0lyIx5lXCziI"`
- 10 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-07-31T20:38:00Z" AND timestamp<="2026-07-31T20:50:00Z" AND textPayload:"getGooglePageSpeedScore"`
- 17 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-07-31T20:20:00Z" AND timestamp<="2026-07-31T21:00:00Z" AND textPayload:"Starting new instance"`
- 20 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-07-31T20:35:00Z" AND timestamp<="2026-07-31T20:47:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 6 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-07-31T20:30:00Z" AND timestamp<="2026-07-31T21:05:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`

## Job
- analyze rounds: 1
- cost: $2.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
