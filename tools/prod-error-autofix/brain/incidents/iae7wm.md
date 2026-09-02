fingerprint: iae7wm
service: oncreateuser
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T15:24:04.434Z
status: infra
attempt: 1

# BLOG · oncreateuser · iae7wm

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-blog-app/us-central1 at 2026-09-01T14:59:5xZ killed two unrelated Cloud Run services' cold starts at exactly the 240s default startup TCP probe deadline — oncreateuser instance …976ddc83 started 14:59:52.318Z and was declared DEADLINE_EXCEEDED at 15:03:52.468Z (240.150s) having never bound :8080 and having emitted zero application log lines.

**Mechanism.** Eventarc/Pub/Sub delivered a shops/{shopId} create event; Cloud Run had no warm instance and logged 'Starting new instance. Reason: AUTOSCALING' at 14:59:52.318461Z for instance 00a41e8c1d7b0d1e…67f5 on revision oncreateuser-00160-deq. That container never bound :8080. At 15:03:52.468432Z — 240.150s after start, the Cloud Run default startup probe timeoutSeconds — the platform logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 / Connection failed with status DEADLINE_EXCEEDED', and the queued POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING was answered 503 'The request failed because the instance failed the readiness check' with latency 242.434082s. The instance produced no stderr at all: a full log read filtered on that instanceId returns exactly 3 entries (instance-start INFO, probe-fail ERROR, request ERROR) and no 'Memory limit' line, so this is not the P3 OOM pattern and not a slow import graph in this app's code — the same revision, same image, same 512MiB/cpu:1 config (packages/functions/src/functions/firestore.js:25) cold-started successfully 10 other times in the same 24h, including a retry at 15:04:06.643869Z whose probe succeeded 59.997s later and which answered 200 in 60.237650185s. The fault is not specific to this function either: service `knowledgebase` in the same project started instance …3fa7dcb9 at 14:59:54.460582Z and failed its probe at 15:03:54.613267Z — 240.153s, the identical deadline, 2.145s offset from oncreateuser, and those two are the only probe failures in the whole project between 12:00Z and 17:00Z. Two unrelated services starting 2.1s apart and dying at the same 240.15s mark is a platform-side start fault, not app code. No data was lost: the event was redelivered and served 200.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/firestore.js:25` — onCreateUser is onDocumentCreated('shops/{shopId}') with memory 512MiB, cpu 1, timeoutSeconds 300, maxInstances 10 — the config the failing container ran under; it is unchanged and the same config cold-started fine 10× in 24h
- `packages/functions/src/functions/firestore.js:30` — timeoutSeconds: 300 is the request timeout, not the startup probe timeout — the 240.150s deadline that fired is Cloud Run's default startup probe, which this repo never declares
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions declares only region and VPC — no memory floor, no startup probe override anywhere in the chain, so the platform default 240s probe applies
- `packages/functions/src/handlers/onCreateShop.js:1` — the handler body never ran — the container died before module load produced any log line, so nothing here is implicated

## Evidence
- 4 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-09-01T13:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Memory limit" OR textPayload:"readiness check")`
- 3 matching entries: `labels.instanceId="00a41e8c1d7b0d1e50d0b0abaf7b9b0d8549fb7279da91873abb0592976ddc836b8eeeb01a012657199a897ef8d73d107d8c93509b57cb42b740815289994a040847d9ee19adb3d1f0a240446267f5"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T12:00:00Z" AND timestamp<="2026-09-01T17:00:00Z" AND (textPayload:"STARTUP TCP probe failed" OR textPayload:"Memory limit")`
- 4 matching entries: `(resource.labels.service_name="knowledgebase") AND timestamp>="2026-09-01T14:55:00Z" AND timestamp<="2026-09-01T15:10:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 11 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-08-31T15:00:00Z" AND timestamp<="2026-09-01T15:20:00Z" AND textPayload:"STARTUP TCP probe"`
- 1 matching entries: `(resource.labels.service_name="oncreateuser") AND timestamp>="2026-09-01T15:04:00Z" AND timestamp<="2026-09-01T15:20:00Z" AND httpRequest.status>0`

## Job
- analyze rounds: 1
- cost: $1.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
