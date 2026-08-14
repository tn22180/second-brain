fingerprint: qqn3ht
service: aiapi
message: HTTP 500 OPTIONS /sidekick/v1/speed/score
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-14T09:10:52.289Z
status: infra
attempt: 1

# IMG-OPT · aiapi · qqn3ht

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the single OPTIONS /sidekick/v1/speed/score 500 was rejected by Cloud Run at admission during a scale-from-zero event — the request never entered the Koa app (latency 0s, zero application log lines), and Cloud Run logged "Starting new instance. Reason: AUTOSCALING" 69.6 ms after it.

**Mechanism.** aiapi is declared with no minInstances (packages/functions/src/index.js:66), so it scales to zero. The Sidekick CORS preflight is answered by application middleware (packages/functions/src/middleware/sidekickCors.js:17), so an OPTIONS preflight cannot be served without a live container — it is exactly the request type that arrives first after an idle period and must force a cold start. At 04:35:54.463501Z one such preflight from extensions.shopifycdn.com hit the service with no warm instance; Cloud Run answered 500 with httpRequest.latency "0s" and emitted the AUTOSCALING "Starting new instance" system log at 04:35:54.533111Z. Because the request was never dispatched to the container, errorHandler (packages/functions/src/middleware/errorHandler.js:15) never ran and the stderr read is empty — consistent with platform-side rejection, not with any handler throwing. The three other OPTIONS in the same period all reached the app and returned 204, two of them paying the cold start (10.81s at 05:17:10Z, 5.37s at 05:42:36Z) and one warm (0.005s at 05:21:14Z), which shows the app-side preflight path itself is healthy but fully exposed to scale-from-zero.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:66` — aiApi onRequest declares only timeoutSeconds and memory — no minInstances, so the service scales to zero and every first request after idle forces a cold start
- `packages/functions/src/middleware/sidekickCors.js:17` — the OPTIONS preflight is answered inside app middleware, so a preflight requires a running container; it cannot be served by the platform
- `packages/functions/src/middleware/errorHandler.js:15` — any in-app 5xx would have written a console.error here; the empty stderr read confirms the request never reached the app

## Evidence
- 1 matching entries: `(resource.labels.service_name="aiapi") AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T12:00:00Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="aiapi") AND timestamp>="2026-08-14T04:35:54Z" AND timestamp<="2026-08-14T04:36:00Z"`
- 3 matching entries: `(resource.labels.service_name="aiapi") AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND httpRequest.requestMethod="OPTIONS"`

## Job
- analyze rounds: 1
- cost: $1.52

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
