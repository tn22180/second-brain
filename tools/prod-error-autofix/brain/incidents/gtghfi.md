fingerprint: gtghfi
service: ontokenuserwritten
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-08-12T19:50:13.415Z
status: infra
attempt: 1

# BLOG · ontokenuserwritten · gtghfi

**Outcome.** infra class — reported, no MR

**Root cause.** A ~6-minute Cloud Run container-startup stall in avada-blog-app/us-central1 (≈09:01:11Z–09:07:17Z on 2026-08-12) prevented ontokenuserwritten containers from binding :8080 within the 240s default startup TCP probe timeout; it is not a defect in this function's code — every container of two unrelated services started inside that band was degraded, and every container started after it was normal.

**Mechanism.** Cloud Run's default startup probe for a gen2 function is TCP :8080, timeout 240s, failureThreshold 1. Each of the 4 failing instances logged 'STARTUP TCP probe failed' at exactly 240.1s / 240.7s / 240.1s / 240.5s after its own 'Starting new instance' line — P4, a latency matching a configured limit to the tenth of a second. The two ontokenuserwritten instances that survived the same band bound :8080 at 09:07:17.009709Z and 09:07:17.026486Z — 17 ms apart despite having started 40 s apart (09:04:44.716Z → 152.3s, 09:05:24.616Z → 112.4s), i.e. both were blocked on the same external thing and released together, not on their own module load. Baseline for this same service over the preceding 32h is n=64 cold starts, median 9.9s, p95 33.8s, max 40.6s, so 112–240s is 3–24× the p95. Blast radius crosses services: apisa instances started 09:03:48.77Z and 09:05:53.34Z also failed at 240.5s and 240.6s, authsa took 75.1s, while all 4 containers started at/after 09:07:50Z (apisa ×3, knowledgebase) bound normally in 22.6–48.5s. 6 of 6 containers started in 09:01:11–09:07:06Z degraded, 0 of 4 started after 09:07:50Z. Consequence for the app: the 3 Eventarc deliveries returned 503 after 241.16s / 242.20s / 241.18s, so 3 TokenUser document writes never reached tokenLogRepository.save and their token-log rows are permanently missing — onDocumentWritten is declared without retry, so Eventarc does not redeliver.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/firestore.js:33` — onTokenUserWritten is declared memory 512MiB / cpu 0.5 / maxInstances 10 with no minInstances and no retry — so every delivery may pay a cold start, and a failed one is dropped rather than redelivered.
- `packages/functions/src/functions/firestore.js:37` — cpu: 0.5 is the thinnest CPU allocation of any function in this repo alongside two scheduled and two pubsub functions; it gives the smallest headroom when platform startup is degraded.
- `packages/functions/src/index.js:7` — index.js re-exports http, pubsub, scheduled and firestore, so every ontokenuserwritten container evaluates the whole functions import graph (koa, shopify, langchain/langgraph, ioredis, googleapis) at 0.5 vCPU before it can bind :8080 — the 9.9s median baseline.
- `packages/functions/src/handlers/trigger/onTokenUserWritten.js:41` — The tokenLogRepository.save that the 3 dropped deliveries never reached — the concrete data loss from the 503s.

## Evidence
- 4 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 33 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T08:55:00Z" AND timestamp<="2026-08-12T09:15:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 128 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-12T08:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe succeeded")`
- 3 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T08:50:14.361Z" AND timestamp<="2026-08-12T09:20:14.361Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T09:04:00Z" AND timestamp<="2026-08-12T09:08:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.58

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
