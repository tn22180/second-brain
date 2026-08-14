fingerprint: 1mzc7t9
service: proxy
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-08-14T07:18:20.614Z
status: infra
attempt: 1

# BLOG · proxy · 1mzc7t9

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-blog-app/us-central1 during the 04:2x–04:3xZ band on 2026-08-14 made 20 of 28 proxy cold starts miss Cloud Run's default 240s startup TCP probe deadline, so proxy lost all serving capacity and Cloud Run answered its storefront traffic with 500 'instance could not start successfully' / 429 'no available instance' and the alerted 503 readiness-check failure.

**Mechanism.** proxy served a flat ~100 req/min all night (03:23–04:20Z, 0 failures) on warm instances. At 04:20:18.842620Z the autoscaler began replacing capacity ('Starting new instance. Reason: AUTOSCALING'), and that container never bound :8080 — 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' at 04:24:19.399036Z, i.e. 240.56s after start, matching Cloud Run's default startup TCP probe timeout of 240s to the tenth of a second (P4). This repeated 20 times between 04:24:19Z and 04:36:08Z with failure durations tightly clustered at 240.10–240.56s. With no minInstances (packages/functions/src/functions/http.js:61) proxy had no warm fallback, so from 04:22Z it served 0 requests successfully: 04:22 = 193×500 / 0×200, and across 04:00–04:50Z the request log holds 972 500s (806 'The request failed because the instance could not start successfully', 165 'no available instance'), 2554 429s and the 1 alerted 503 at 245.570247s latency — again the probe deadline plus routing overhead. The failures are not proxy-specific and not app code: in the same band handleproderroralert failed 9 starts and syncsubscribeactivecharge 2, and the whole avada-blog-app fleet logged 0 probe failures outside 04:00–04:45Z in the 03:30–05:15Z sample. proxy's own 24h baseline is 37 start attempts, 17 clean successes with median 28.4s and min 9.8s, and all 20 failures fall in hour 04Z. No proxy application log line exists for any failed request — the container died before Koa loaded, so no handler was ever entered; the only proxy stderr in the window is 3 '[redis.service] connected 10.68.191.235' lines, each emitted 20–120ms AFTER a successful probe, which rules out the Redis/VPC connect being in the pre-bind critical path. No 'Memory limit … exceeded' line exists for proxy in the window (the single OOM line in the project belongs to handleproderroralert at 512 MiB), so this is not an OOM.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:61` — proxy declared memory 512MiB / cpu 1 / maxInstances 10 / concurrency 80 with no minInstances — when the warm set was replaced at 04:20Z there was no reserved instance, so every request depended on a cold start that the platform could not complete
- `packages/functions/src/functions/http.js:60` — proxy is the only entry point for all /proxy/* storefront traffic (tags, posts-by-tag, post-information, shop/blog); a start failure here fails every shop's storefront at once
- `packages/functions/src/index.js:7` — index.js re-exports http, pubsub, scheduled and firestore, so every proxy container evaluates the full functions import graph before it can bind :8080 — the 28.4s median cold start that leaves only ~8× headroom against the 240s probe deadline
- `packages/functions/src/globalOptions.js:7` — every function, proxy included, is attached to a VPC connector at start (PRIVATE_RANGES_ONLY); connector attach is part of the pre-bind path the platform stalled on

## Evidence
- 812 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:15:47.417Z" AND timestamp<="2026-08-14T04:45:47.417Z" AND httpRequest.status>=500`
- 28 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T05:15:00Z" AND textPayload:"STARTUP TCP probe"`
- 31 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T05:15:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Starting new instance" OR textPayload:"Memory limit")`
- 74 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-13T05:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Starting new instance")`
- 2554 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T04:50:00Z" AND httpRequest.status=429`
- 8000 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T03:20:00Z" AND timestamp<="2026-08-14T04:26:00Z" AND httpRequest.requestMethod!=""`
- 44 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:15:00Z" AND timestamp<="2026-08-14T04:45:00Z" AND NOT logName:"requests"`

## Job
- analyze rounds: 1
- cost: $2.42

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
