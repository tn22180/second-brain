fingerprint: mcfuet
service: knowledgebase
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T15:26:21.908Z
status: infra
attempt: 1

# BLOG · knowledgebase · mcfuet

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-blog-app/us-central1 at 2026-09-01T14:59:5xZ stalled cold starts of two unrelated services past Cloud Run's 240s default STARTUP TCP probe deadline — knowledgebase (the alert) and oncreateuser — so both instances never bound :8080 and their in-flight Pub/Sub deliveries got 503 'failed the readiness check'.

**Mechanism.** Pub/Sub push POST https://knowledgebase-…run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-blog-app/topics/knowledgeBase arrived at 2026-09-01T14:59:54.403071Z with no warm instance; Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' 57ms later on instance 00a41e8c1d4762906b5ec759f6b76e09…. That container emitted no application log line at all — not even the '[redis.service] connected 34.60.93.33' line every warm start writes — and at 15:03:54.613267Z Cloud Run gave up: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED'. Request latency 244.352650s ≈ the 240s default startup-probe timeout plus scheduling overhead (P4: the number identifies which limit fired). This is not a config defect in the alerted function: oncreateuser, an unrelated Firestore trigger declared cpu:1 (packages/functions/src/functions/firestore.js:29) against knowledgeBase's cpu:0.5 (packages/functions/src/functions/pubsub.js:106), failed identically 2.1s earlier — 503 at 14:59:52.292491Z, latency 242.434082s, probe DEADLINE_EXCEEDED at 15:03:52.468432Z — so the shared factor is the platform, not either function's memory/cpu tier. Both recovered on the immediate next attempt: oncreateuser started 15:04:06.643869Z and passed its probe at 15:05:06.640738Z (60s); knowledgebase started 15:04:12.696302Z and passed at 15:07:07.496336Z (175s), then served 200s at 0.23s and 0.34s. Ordinary knowledgebase cold starts in the same hour bound in ~20s (probe succeeded 14:09:05.391660Z, 14:23:37.013158Z), and this is the only STARTUP-probe failure on knowledgebase in the 7 days 2026-08-25→2026-09-01. No 'Memory limit … exceeded' line exists for the service in 13:00–16:00Z, so this was not an OOM kill. Same event already recorded as fingerprint iae7wm (BLOG/oncreateuser, 2026-09-01).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/pubsub.js:102` — the alerted service: export const knowledgeBase = onMessagePublished on topic 'knowledgeBase' — the Cloud Run service knowledgebase
- `packages/functions/src/functions/pubsub.js:105` — memory: '512MiB', cpu: 0.5 — the declared tier; cpu:0.5 gives a thin margin under the 240s probe deadline (the recovered cold start still took 175s), but is not the cause here since cpu:1 oncreateuser failed the same way
- `packages/functions/src/functions/firestore.js:29` — oncreateuser declares cpu: 1 and failed its startup probe 2.1s before knowledgebase — the control that rules out a per-function cpu/memory defect
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions declares only region and VPC — no global memory/cpu floor, so each function's own tier is all that applies
- `packages/functions/src/handlers/pubsub/subscribeKnowledgeBase.js:19` — the handler that never ran — the container died before module load finished, so no catch block logged anything

## Evidence
- 4 matching entries: `resource.labels.service_name="knowledgebase" AND timestamp>="2026-09-01T13:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP" OR textPayload:"probe")`
- 2 matching entries: `resource.type="cloud_run_revision" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T14:55:00Z" AND timestamp<="2026-09-01T15:10:00Z" AND httpRequest.status>=500`
- 10 matching entries: `resource.type="cloud_run_revision" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T14:40:00Z" AND timestamp<="2026-09-01T15:20:00Z" AND (textPayload:"STARTUP" OR textPayload:"Memory limit" OR textPayload:"container terminated" OR textPayload:"no available instance")`
- 1 matching entries: `resource.labels.service_name="knowledgebase" AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 17 matching entries: `resource.labels.service_name="knowledgebase" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND httpRequest.status>=200`

## Job
- analyze rounds: 1
- cost: $1.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
