fingerprint: me5nt2
service: knowledgebase
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-09-01T15:28:24.838Z
status: infra
attempt: 1

# BLOG · knowledgebase · me5nt2

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-blog-app/us-central1 at 2026-09-01T14:59:5xZ stalled two unrelated Cloud Run cold starts (knowledgebase and oncreateuser, started 2.1s apart) past Cloud Run's default 240s startup TCP probe deadline, so the Pub/Sub push to knowledgeBase was answered 503 'instance failed the readiness check'.

**Mechanism.** The Eventarc/Pub/Sub push POST arrived at 14:59:54.403071Z with no warm instance, triggering a cold start of revision knowledgebase-00160-mat (instanceId 00a41e8c1d476290…). That container never bound :8080: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' at 15:03:54.613267Z — exactly 240.2s after the request start, matching Cloud Run's default startup TCP probe timeout (P4), and the request's own latency of 244.352650s is that deadline plus routing. It is not this function's code or config: oncreateuser, a different entry point (onDocumentCreated on shops/{shopId}, packages/functions/src/functions/firestore.js:25) with a different cpu allocation (cpu: 1 vs knowledgeBase's cpu: 0.5), failed its probe at 15:03:52.468432Z — 2.1s earlier, same 240s deadline. Those two are the ONLY startup-probe failures in the entire avada-blog-app fleet in the 25h window 2026-08-31T15:00Z→2026-09-01T16:00Z; every other probe event in that window (api, apiv2, ontokenuserwritten, subscriberenewsubscribertokenshandler, syncsubscribeactivecharge, handleproderroralert) succeeded on the first attempt. knowledgebase's own baseline is 29 clean cold starts vs this 1 failure in 25h (3.3%), and it recovered on its own: probe succeeded at 15:07:07.496336Z with '[redis.service] connected 34.60.93.33' logged 32ms later, so the boot path itself is healthy. No application log line exists for the failed request — the container died before src/index.js finished evaluating, so no handler was ever entered — and no 'Memory limit … exceeded' line exists for knowledgebase in the window, ruling out OOM. Same fault family as already-recorded fingerprints mcfuet (BLOG/knowledgebase) and iae7wm (BLOG/oncreateuser), same date and same 14:59:5xZ band.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/pubsub.js:102` — knowledgeBase is the Pub/Sub subscriber the alerted push targeted — topic 'knowledgeBase', memory 512MiB, cpu 0.5, maxInstances 10, no minInstances, so every idle-period delivery depends on a cold start the platform must complete inside 240s
- `packages/functions/src/functions/firestore.js:25` — onCreateUser — the second service that failed its probe 2.1s earlier at cpu: 1, a different memory/entry-point profile; its failure is what rules out knowledgeBase's own cpu 0.5 config as the cause
- `packages/functions/src/index.js:6` — index.js re-exports http, pubsub, scheduled and firestore, so every container — knowledgebase included — evaluates the full functions import graph before it can bind :8080; that is the work the platform stalled on
- `packages/functions/src/globalOptions.js:1` — every function attaches the VPC connector at start; connector attach is part of the pre-bind path, and the 34.60.93.33 Memorystore connect logged 32ms after the successful probe shows it is not the blocker on a healthy start

## Evidence
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-31T15:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 30 matching entries: `resource.labels.service_name="knowledgebase" AND timestamp>="2026-08-31T15:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 1 matching entries: `resource.labels.service_name="knowledgebase" AND timestamp>="2026-08-31T15:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND httpRequest.status>=500`
- 26 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Memory limit")`
- 1 matching entries: `(resource.labels.service_name="knowledgebase") AND timestamp>="2026-09-01T14:49:10.163Z" AND timestamp<="2026-09-01T15:19:10.163Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
