fingerprint: igidee
service: lighthouseauditrunnergen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-22T03:52:56.492Z
status: fix_disabled
attempt: 1

# SEO · lighthouseauditrunnergen2 · igidee

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /lighthouse/auditNew has no server-side deadline anywhere in its chain, so the mobile/densen4G Lighthouse run of https://www.houseofvices.com (shop lPfogovTYE48MfiIXIp8, a 1.6 MB HTML document) never returns and Cloud Run kills every one of those requests at the function's own timeoutSeconds: 540 — 16 of 16 504s in the alert window, and 16 of 16 5xx across 7 days, are that single shop+URL.

**Mechanism.** The audit fans out from the scanIssues artifact: resultLightHouse.js:42 Promise.all over allItemUrls -> getAuditResultByLightHouse -> getLightHouseData (lightHouseService.js:445 logs `[getLightHouseData] https://www.houseofvices.com lPfogovTYE48MfiIXIp8 useGoogleApi: true`, seen 3x at 23:46/23:56/00:15) -> on a PSI miss it falls back to fetchLightHouse (lightHouseService.js:447/473), which is the exact request seen in the logs (uploadResult=true, useAvadaLightHouse=true, throttling=densen4G, passwordStore from the shop doc). Server side, performAudit (lightHouseController.js:101-131) awaits auditLightHouse with no deadline, and auditLightHouse awaits `lighthouse(auditUrl, options, config)` (lightHouseService.js:271) with no global timeout — Lighthouse's maxWaitForLoad: 60000 (lightHouseService.js:205) bounds only page load inside a pass, not the run. The other awaits in the chain carry puppeteer's own 30s defaults (page.goto :252, waitForSelector :311/:323) and would have thrown into the catch, which logs at logger.error; zero stderr/error application lines exist for any of the 16 containers, so nothing threw — the process was still awaiting when the container was killed. All 16 latencies are 539.946-540.002s against the declared timeoutSeconds: 540 (httpFunctions.js:71), i.e. the platform cut the request, not the code. Each request got its own cold container (concurrency: 1; 16 `Starting new instance ... AUTOSCALING` system events at exactly the 16 request-start timestamps), so one bad URL burned 16 x 540s of a 4GiB/1-vCPU instance. Second-order and separately proven: the caller aborts at 120s (AbortSignal.timeout(120000), lightHouseService.js:65) — `[getAuditResultByLightHouse] lPfogovTYE48MfiIXIp8 The operation was aborted due to timeout` at 00:03:25.117Z, 7 minutes before the container died — and the scan then reported `[runner:audit] Done all artifacts` at 00:03:25.294Z with empty Lighthouse data, so the merchant's scan silently degraded. That 120s caller budget is also under the service's normal cost: 16 of the 33 HTTP 200 audits in the same 6h window took 138-202s, i.e. their results were already abandoned by the caller. Not the cause: password handling (the successful minhpt-store-15 audits at 01:51-01:54 also carry passwordStore and returned 200 in 31-86s), and not queueing/no-available-instance (every request was placed on a dedicated instance).

Confidence: `high`

## Code
- `packages/functions/src/controllers/lightHouseController.js:107` — performAudit awaits auditLightHouse with no deadline and no AbortSignal — the request can only end when Cloud Run kills it.
- `packages/functions/src/services/lightHouseService.js:271` — await lighthouse(auditUrl, options, config) — the unbounded await; Lighthouse has no global run timeout, only the per-pass maxWaitForLoad set at :204-205.
- `packages/functions/src/services/lightHouseService.js:65` — Caller-side AbortSignal.timeout(120000): the requester gives up at 120s while the runner keeps a 4GiB instance for 540s. Source of the 00:03:25Z 'operation was aborted due to timeout' log.
- `packages/functions/src/handlers/exports/httpFunctions.js:71` — lighthouseauditrunnerGen2 declared timeoutSeconds: 540, memory: '4GiB', concurrency: 1 — the 540.000s cutoff the 16 latencies match, and the concurrency that makes each hang cost one whole instance.
- `packages/functions/src/services/lightHouseService.js:447` — getLightHouseData's fallback to fetchLightHouse — the code path that produced the observed query string (useAvadaLightHouse=true, uploadResult=true, throttling=densen4G).
- `packages/functions/src/services/audit/artifacts/resultLightHouse.js:42` — Unbounded Promise.all fan-out of the audit over allItemUrls, each leg reaching the runner; the scan completes with EMPTY_RESULT when a leg aborts.

## Evidence
- 16 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-19T23:57:48.833Z" AND timestamp<="2026-08-20T00:27:48.833Z" AND httpRequest.status=504`
- 17 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-20T02:00:00Z" AND httpRequest.status>=500`
- 49 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-19T20:00:00Z" AND timestamp<="2026-08-20T02:00:00Z" AND httpRequest.requestMethod!=""`
- 22 matching entries: `resource.labels.service_name="scanissuessubscribergen2" AND timestamp>="2026-08-19T23:30:00Z" AND timestamp<="2026-08-20T00:30:00Z" AND textPayload:"lPfogovTYE48MfiIXIp8"`
- 16 matching entries: `resource.labels.service_name="lighthouseauditrunnergen2" AND timestamp>="2026-08-19T23:50:00Z" AND timestamp<="2026-08-20T00:10:00Z" AND logName:"varlog" AND textPayload:"Starting new instance"`

## Job
- analyze rounds: 1
- cost: $3.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
