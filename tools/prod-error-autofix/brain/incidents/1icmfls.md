fingerprint: 1icmfls
service: ontokenuserwritten
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: BLOG
repo: blogs
date: 2026-09-01T18:22:37.094Z
status: infra
attempt: 1

# BLOG · ontokenuserwritten · 1icmfls

**Outcome.** infra class — reported, no MR

**Root cause.** onTokenUserWritten is declared cpu: 0.5 with no minInstances, so its cold start takes 84.5s; a burst of 7 TokenUser writes in 25s (17:50:43–17:51:08Z) forced 9 simultaneous cold starts at concurrency 1 against maxInstances 10, and the last 2 Eventarc deliveries were rejected at the Cloud Run frontend with the alerted 500 'no available instance' while a 3rd sat 241.13s and got 503.

**Mechanism.** packages/functions/src/functions/firestore.js:36-45 declares onTokenUserWritten with {memory:'512MiB', cpu:0.5, timeoutSeconds:60, maxInstances:10} and globalOptions.js:5 sets only region/VPC — `grep -rn minInstances packages/functions/src` returns zero hits, so nothing keeps a warm instance. Firebase gen2 event-driven functions run at concurrency 1, so each Firestore TokenUser/{shopId} write needs its own instance. The service was cold at 17:50:43.161Z: that first delivery landed on instance …3c58 and took 84.52s to answer 200 — the container must load the whole @functions import graph (handler → TokenLogRepository → Firestore/redis; '[redis.service] connected 34.60.93.33' flushes at 17:52:08 and 17:52:25) on half a vCPU. Six more deliveries arrived at 17:50:51, 17:50:58, 17:51:01, 17:51:03, 17:51:05, 17:51:08; every one logged 'Starting new instance. Reason: AUTOSCALING' (9 starts between 17:50:43 and 17:52:05) because no started instance existed yet. With all in-flight instances still in startup and the cap at 10, the deliveries at 17:51:05.572Z and 17:51:08.495Z were rejected at the frontend — latency '0s', no instanceId label, textPayload 'The request was aborted because there was no available instance', which is the alerted line. The delivery at 17:51:01.102Z was assigned to instance …9dd9, whose container never bound :8080: it burned 241.126544s and returned 503 'The request failed because the instance failed the readiness check', and at 17:55:01/03/05Z three ERROR entries record 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' — the 241s matches Cloud Run's 240s startup probe deadline. The successful starts' probes only passed at 17:52:08 and 17:52:25, i.e. 85–102s after their containers began. Once one instance was warm it served everything alone (…3c58 handled 17:52:29 through 18:02:54 at 0.18–0.83s). So this is a cold-start capacity gap under an event burst, not saturation of steady traffic (13 requests in 32 min) and not application code — the handler wraps its whole body in try/catch and returns null (onTokenUserWritten.js:13-57), so it cannot produce a 500.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/firestore.js:40` — cpu: 0.5 — half a vCPU for a container that must load the full @functions import graph; the direct cause of the 84.5s cold start and the 240s probe timeouts
- `packages/functions/src/functions/firestore.js:42` — maxInstances: 10 — the ceiling the 9 concurrent AUTOSCALING starts were pressing against when the two deliveries were rejected with 'no available instance'
- `packages/functions/src/functions/firestore.js:36` — the onDocumentWritten('TokenUser/{shopId}') declaration whose options object governs this Cloud Run service; no minInstances is set anywhere in it
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions supplies only region and VPC connector — confirms no fleet-wide minInstances warm floor exists
- `packages/functions/src/handlers/trigger/onTokenUserWritten.js:13` — the handler body is entirely inside try/catch and returns null, so no application path can emit the alerted 500 — the failure is pre-handler, at container admission

## Evidence
- 13 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T18:10:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests"`
- 21 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T18:10:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 6 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-09-01T17:38:37.302Z" AND timestamp<="2026-09-01T18:08:37.302Z" AND logName:"stderr"`
- 6 matching entries: `(resource.labels.service_name="ontokenuserwritten") AND timestamp>="2026-09-01T17:38:37.302Z" AND timestamp<="2026-09-01T18:08:37.302Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.37

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
