fingerprint: jirp4l
service: oncreateuser
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-09-01T15:30:06.730Z
status: infra
attempt: 1

# BLOG · oncreateuser · jirp4l

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-blog-app/us-central1 at 2026-09-01T15:03:5xZ made one oncreateuser cold start miss Cloud Run's default 240s startup TCP probe deadline, so the Eventarc/Pub/Sub delivery of the shops/{shopId} create event was answered 503 'instance failed the readiness check' after 242.434082s.

**Mechanism.** onCreateUser is declared onDocumentCreated('shops/{shopId}') with memory 512MiB / cpu 1 / maxInstances 10 and no minInstances (packages/functions/src/functions/firestore.js:25), so a shop-create event with no warm instance forces a cold start. Every container evaluates the whole src/index.js import graph (packages/functions/src/index.js:9 re-exports http+pubsub+scheduled+firestore) and attaches the VPC connector (packages/functions/src/globalOptions.js:9) before it can bind :8080. On this start the container never bound: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' at 15:03:52.468432Z on revision oncreateuser-00160-deq, instance 00a41e8c1d7b0d1e…, and the POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING from APIs-Google got HTTP 503 with latency 242.434082s — Cloud Run's 240s default startup TCP probe timeout plus routing overhead (P4). The fault is not oncreateuser-specific and not app code: knowledgebase failed the identical probe 2.145s later at 15:03:54.613267Z, and those two are the ONLY startup-probe failures and the only 'Memory limit' lines in the entire avada-blog-app project in the preceding 24h (0 OOM). oncreateuser's own 24h baseline is 11 cold starts, 10 clean; the very next start at 15:05:06.640738Z succeeded and logged '[redis.service] connected 34.60.93.33' 33ms later, proving the Redis/VPC path is not the pre-bind blocker. No onCreateShopHandler application log exists for the failed delivery because the container died before Node loaded the handler — the request never entered app code.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/firestore.js:25` — onCreateUser declared memory 512MiB / cpu 1 / timeoutSeconds 300 / maxInstances 10 with no minInstances — the shops/{shopId} create event had no warm instance and depended entirely on a cold start the platform could not complete
- `packages/functions/src/index.js:9` — index.js re-exports http, pubsub, scheduled and firestore, so every oncreateuser container evaluates the full functions import graph before binding :8080 — this is the pre-bind work that must finish inside the 240s probe deadline
- `packages/functions/src/globalOptions.js:9` — every function including oncreateuser attaches a VPC connector (PRIVATE_RANGES_ONLY) at start; connector attach is part of the pre-bind path the platform stalled on
- `packages/functions/src/handlers/onCreateShop.js:1` — the handler the failed delivery was routed to — it was never entered, which is why no application log line exists for the 503

## Evidence
- 17 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T14:30:00Z" AND timestamp<="2026-09-01T15:30:00Z" AND textPayload:"STARTUP TCP probe"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-31T15:20:00Z" AND timestamp<="2026-09-01T15:20:00Z" AND (textPayload:"STARTUP TCP probe failed" OR textPayload:"Memory limit")`
- 11 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-08-31T15:20:00Z" AND timestamp<="2026-09-01T15:20:00Z" AND textPayload:"STARTUP TCP probe"`
- 1 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-09-01T14:49:10.757Z" AND timestamp<="2026-09-01T15:19:10.757Z" AND httpRequest.status>=500`
- 1 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-09-01T14:49:10.757Z" AND timestamp<="2026-09-01T15:19:10.757Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
