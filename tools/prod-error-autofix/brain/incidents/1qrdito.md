fingerprint: 1qrdito
service: proxygen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T16:41:52.025Z
status: infra
attempt: 2

# SEO · proxygen2 · 1qrdito

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one proxygen2 cold-start container (instance 00a41e8c1d967a…, revision proxygen2-00351-riz) never bound :8080 — its Default STARTUP TCP probe ended in DEADLINE_EXCEEDED — and the single POST /proxy/save404 that Cloud Run had queued behind that scale-out was failed with 503 after 241.21s of queue time.

**Mechanism.** proxyGen2 is declared with concurrency: 2 and no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:101), so a bursty storefront crawler load past 2 in-flight requests on the serving instance makes Cloud Run queue the request and emit 'Starting new instance. Reason: AUTOSCALING … or no existing capacity for this request'. Both are logged on instance 00a41e8c1d967a at 16:31:30.599Z, 0.16s after the same instance's request log carries the 503 at 16:31:30.441545Z with latency 241.205708s — i.e. the request waited ~4 minutes for capacity, not in the handler (timeoutSeconds is 120, so it never reached proxyHandler). The container that was supposed to take it then failed the platform's startup probe at 16:35:30.963Z, 'The instance was not started. Connection failed with status DEADLINE_EXCEEDED'. The healthy path in the same window shows what the cold start normally costs: instance 00a41e8c1d39deba logged 'Starting new instance' at 16:35:32.84Z and served its first request at 16:36:49.77Z — ~77s — and the request it was scaled out for finished 200 after 139.82s of queueing. So the app code never ran on the failed path: the alerted line is a Cloud Run container-start fault, amplified by a concurrency cap of 2 that forces scale-out (5 instance starts in the 15:20–17:20Z window) on traffic the warm instance was otherwise absorbing at 0.06–0.18s.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — proxyGen2 declared concurrency: 2, memory 1GiB, timeoutSeconds 120 and no minInstances — every burst past 2 in-flight forces a cold start, and a queued request rides on that container's readiness
- `packages/functions/src/routes/proxy.js:41` — the alerted path POST /proxy/save404 — the storefront hot path that carries this traffic; its handler never executed on the 503 (latency 241.2s > timeoutSeconds 120, request log carries the platform readiness message, not an app error)
- `packages/functions/src/middleware/save404RateLimit.js:4` — documents save404 as ~98% of proxy traffic (~22 req/s prod), the volume that keeps re-triggering scale-out against concurrency: 2

## Evidence
- 3 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-09-01T16:20:00Z" AND timestamp<="2026-09-01T16:50:00Z" AND labels.instanceId:"00a41e8c1d967ad43c4a"`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-09-01T14:20:00Z" AND timestamp<="2026-09-01T17:20:00Z" AND httpRequest.status>=500`
- 5 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-09-01T16:20:00Z" AND timestamp<="2026-09-01T16:50:00Z" AND labels.instanceId:"00a41e8c1d39deba"`
- 6 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-09-01T15:50:00Z" AND timestamp<="2026-09-01T17:20:00Z" AND (textPayload:"STARTUP" OR textPayload:"readiness check")`
- 5000 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-09-01T16:20:33Z" AND timestamp<="2026-09-01T16:50:33Z" AND httpRequest.status>=100`

## Job
- analyze rounds: 1
- cost: $2.03

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
