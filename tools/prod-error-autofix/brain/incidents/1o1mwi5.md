fingerprint: 1o1mwi5
service: ontokenuserwritten
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-08-12T19:51:30.377Z
status: infra
attempt: 1

# BLOG · ontokenuserwritten · 1o1mwi5

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint gtghfi (same 3 Eventarc deliveries, same revision ontokenuserwritten-00056-vaw, already recorded infra, no MR): a ~6-minute Cloud Run container-startup stall in avada-blog-app/us-central1 (09:01:11Z–09:07:17Z on 2026-08-12) kept ontokenuserwritten containers from binding :8080 inside the 240s default startup TCP probe timeout, so Eventarc got 503 'instance failed the readiness check' — not a defect in this function's code.

**Mechanism.** The alert text is the Cloud Run httpRequest fallback (P7), not an application error: the errors read carries 4 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' entries at 09:05:11.68Z, 09:09:36.40Z, 09:10:14.74Z, 09:11:06.82Z, and zero application error lines. Cloud Run's default gen2 startup probe is TCP :8080, timeout 240s, failureThreshold 1; the 3 failing POSTs to /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING returned 503 at latency 241.181029s, 242.197441s and 241.164852s — P4, a latency matching the configured 240s probe limit to the tenth of a second. The two containers that did survive the band logged '[redis.service] connected 10.68.191.235' at 09:07:17.080969Z and 09:07:17.099064Z, 18 ms apart despite having started ~40s apart, i.e. both were blocked on the same external thing and released together, not on their own module-load cost (baseline for this service: n=64 cold starts, median 9.9s, p95 33.8s). App-side consequence: onTokenUserWritten is declared without retry, so the 3 dropped deliveries never reached tokenLogRepository.save and their token-log rows are permanently missing.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/firestore.js:33` — onTokenUserWritten declared via onDocumentWritten with no minInstances and no retry — every delivery may pay a cold start, and a 503'd one is not redelivered
- `packages/functions/src/functions/firestore.js:37` — cpu: 0.5 — thinnest CPU allocation in the repo, least headroom when platform startup is degraded
- `packages/functions/src/index.js:7` — index.js re-exports the whole functions graph (koa, shopify, langchain/langgraph, ioredis, googleapis), so every ontokenuserwritten container evaluates all of it at 0.5 vCPU before binding :8080
- `packages/functions/src/handlers/trigger/onTokenUserWritten.js:41` — the tokenLogRepository.save the 3 dropped deliveries never reached — concrete data loss from the 503s

## Evidence
- 4 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T08:50:14.534Z" AND timestamp<="2026-08-12T09:20:14.534Z" AND httpRequest.status>=500`
- 33 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T08:55:00Z" AND timestamp<="2026-08-12T09:15:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 128 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-12T08:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe succeeded")`
- 2 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-08-12T08:50:14.534Z" AND timestamp<="2026-08-12T09:20:14.534Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $0.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
