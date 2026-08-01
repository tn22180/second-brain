fingerprint: 4cha8x
service: proxygen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-07-31T17:56:27.661Z
status: infra
attempt: 1

# SEO · proxygen2 · 4cha8x

**Outcome.** infra class — reported, no MR

**Root cause.** proxyGen2 is declared with concurrency: 2 and no minInstances, so at its steady-state 4–8 warm instances it has only 8–16 in-flight slots for ~15 req/s of public /proxy/save404; when in-flight demand stepped up at 17:05:00 Cloud Run had to cold-start new instances (first startup probe passed 23s after the first scale-out order) and aborted 303 requests with 'no available instance' during that gap.

**Mechanism.** packages/functions/src/handlers/exports/httpFunctions.js:100 declares proxyGen2 as onRequest({memory:'1GiB', timeoutSeconds:120, concurrency:2, ...vpcSettings}) — no minInstances. gcloud run services describe proxygen2 confirms containerConcurrency: 2, autoscaling.knative.dev/maxScale: '100', revision proxygen2-00289-qak. Measured on the request log: 17:03:30–17:04:59 the service served ~150 req/10s on 4–8 distinct instanceIds with p50 latency 0.007s and max 2.1s — i.e. 8–16 concurrent slots total. At 17:05:00.992 the first long request appears (50.66s, 200, /proxy/save404); per-second arrival rate stays flat at 12–23 req/s across the whole 17:04:30–17:05:30 span, so this is not a traffic burst. The autoscaler issues its first 'Starting new instance. Reason: AUTOSCALING' at 17:05:05 and 33 in total that minute; the first 'STARTUP TCP probe succeeded' lands at 17:05:28 — a 23s gap with no added capacity. Every request the front end could not place in those 8–16 slots was aborted: 303 'The request was aborted because there was no available instance' entries, all in minute 17:05, spanning 17:05:04 → 17:05:42, all POST /proxy/save404, all latency 0s, none carrying an instanceId. Distinct serving instances rose 4 → 20 → 29 across 17:04:50 → 17:05:50 and the aborts stop once capacity lands. maxScale=100 was never approached (peak 29 instances), so the instance cap is not the binding constraint — the 2-request-per-instance ceiling plus a 23s cold start is. The trigger for the concurrency step at 17:05:00 is NOT identified in the logs: p50 stayed 0.007s through the incident (only a subset of requests went slow), the proxy Koa app logs no request durations (handlers/proxy/clientApi.js:44-55 logs only on status>=500), and no application error line appears at 17:05:00. One untimed external call sits on this exact path and is a candidate pin — redirectController.js:35 fetches http://ip-api.com/json/<ip> with no timeout for any shop with specific404Locations, and node fetch has no default timeout, so 8–16 such requests would pin every slot — but nothing in the logs ties it to this window, so it is stated as a candidate, not the cause. SEPARATE CAUSE, SAME FINGERPRINT: 767 of the 500s in this window are 'Not allowed content type' thrown by middleware/plainType.js:13 on the same POST /proxy/save404 route (routes/proxy.js:36), a distinct application defect that shares the 'HTTP 500 POST /proxy/save404' fingerprint and must not be merged with the abort.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 declared concurrency: 2 with no minInstances — 2 in-flight slots per instance is the ceiling that saturates
- `packages/functions/src/routes/proxy.js:36` — the only route involved: POST /save404, 4934 of 5000 sampled proxy requests
- `packages/functions/src/handlers/proxy/controllers/redirectController.js:35` — untimed fetch to ip-api.com on the save404 hot path — candidate slot-pinner, not proven for this window
- `packages/functions/src/handlers/proxy/clientApi.js:52` — proxy logs only status>=500, no request duration — why queue time vs app time cannot be separated from logs
- `packages/functions/src/middleware/plainType.js:13` — source of the 767 'Not allowed content type' 500s sharing this alert's fingerprint — separate cause

## Evidence
- 303 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T16:50:52Z" AND timestamp<="2026-07-31T17:20:53Z" AND textPayload:"no available instance"`
- 34 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T16:50:52Z" AND timestamp<="2026-07-31T17:20:53Z" AND textPayload:"Starting new instance"`
- 62 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T17:04:00Z" AND timestamp<="2026-07-31T17:07:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 3213 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T17:03:30Z" AND timestamp<="2026-07-31T17:07:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 9 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T17:03:00Z" AND timestamp<="2026-07-31T17:05:01Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests" AND httpRequest.latency>="1.5s"`
- 5000 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T17:00:00Z" AND timestamp<="2026-07-31T17:10:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 767 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-07-31T16:50:52Z" AND timestamp<="2026-07-31T17:20:53Z" AND textPayload:"Not allowed content type"`

## Job
- analyze rounds: 1
- cost: $2.84

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
