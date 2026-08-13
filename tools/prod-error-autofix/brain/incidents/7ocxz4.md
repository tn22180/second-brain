fingerprint: 7ocxz4
service: proxy
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: BLOG
repo: blogs
date: 2026-08-12T14:51:25.094Z
status: infra
attempt: 1

# BLOG · proxy · 7ocxz4

**Outcome.** infra class — reported, no MR

**Root cause.** Not a code defect and not maxInstances saturation: proxy runs at ~2.4 rps against concurrency:80, so Cloud Run steady-state holds exactly one warm instance, and when that instance (001548f729c6315cfa62, 731 requests over 13:25:01-13:30:11) was recycled the replacement containers needed 24-36s to pass their startup probe, leaving zero ready instances for ~0.7s during which 5 requests were shed with 'no available instance'.

**Mechanism.** packages/functions/src/functions/http.js:60 declares proxy with concurrency: 80 and no minInstances (grep -rn 'minInstances' packages/functions/src returns zero hits, and packages/functions/src/globalOptions.js sets none globally). At 1441 requests / 10 min (2.4 rps) and 0.242s mean latency the service needs ~0.6 concurrent slots, so the autoscaler keeps a single instance. Cloud Run started the replacement at 13:30:03.435Z ('Starting new instance. Reason: AUTOSCALING'), the old instance stopped taking new requests after 13:30:11.217Z, and the first replacement's 'Default STARTUP TCP probe succeeded' only landed at 13:30:39.823Z — 36.4s after start. Seven more instances were started 13:30:16.8-13:30:30.2 chasing the queue. The 5 aborts all fall at 13:30:17.416-13:30:18.062Z with httpRequest.latency '0s', i.e. inside that ready-instance gap, before the load reached even 8 of the 10 allowed instances. No application log line exists for them because the request never reached the container.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:60` — proxy runtime config: memory 512MiB, concurrency 80, maxInstances 10, and no minInstances — concurrency 80 at 2.4 rps collapses the warm pool to one instance, so any recycle is a full cold-start gap
- `packages/functions/src/functions/http.js:59` — the proxy onRequest declaration whose options object is the only place a minInstances floor could be set for this service
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions sets only region and VPC connector — no fleet-wide minInstances, confirming nothing else supplies a warm floor

## Evidence
- 5 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-07T13:00:00Z" AND timestamp<="2026-08-07T14:00:00Z" AND textPayload:"no available instance"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-07T13:00:00Z" AND timestamp<="2026-08-07T14:00:00Z" AND textPayload:"Starting new instance"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-07T13:29:00Z" AND timestamp<="2026-08-07T13:31:30Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 1441 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-07T13:25:00Z" AND timestamp<="2026-08-07T13:35:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests"`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
