fingerprint: txdvop
service: handleoptimizeimagegen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-09-01T17:52:49.941Z
status: infra
attempt: 1

# SEO · handleoptimizeimagegen2 · txdvop

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault swept avada-seo/us-central1 during 2026-09-01T17:00–18:00Z — 6 handleoptimizeimagegen2 cold-start containers (all revision handleoptimizeimagegen2-00343-key) failed their Cloud Run STARTUP TCP probe on :8080 with DEADLINE_EXCEEDED, so Cloud Run itself answered the queued Pub/Sub push deliveries with 500/503 before any application code ran.

**Mechanism.** Pub/Sub pushes topic handleManualOptimizeImage as POST /?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects%2Favada-seo%2Ftopics%2FhandleManualOptimizeImage (userAgent APIs-Google) to handleoptimizeimagegen2. Traffic is bursty and the function declares no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:397-399), so every burst forces AUTOSCALING cold starts — 9 'Starting new instance. Reason: AUTOSCALING' lines in the 30-min window. 6 of those containers logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED': the runtime never bound :8080 within the probe deadline and was killed before firebase-functions could load the handler (wrapPubSub(handleManualOptimizeImage), src at packages/functions/src/handlers/pubsub/handleManualOptimizeImage.js). Cloud Run then answered the deliveries itself: 6× 503 'The request failed because the instance failed the readiness check' with platform-clamped latencies 241.11/241.20/242.13/242.13/243.18/246.14s, and 1× 500 at 0s latency on instance 00a41e8c1d40ca8300ec… at 17:30:57.149480Z — that 0s 500 is the alerted 'HTTP 500 POST /'. Both the 0s and the ~241s numbers are platform wait/kill values, not handler work. The stderr read is empty for the whole window and the only application lines present are successful 'newAlt====' outputs at 17:41:35Z from containers that did start, so nothing in this function's own import graph failed. It is not specific to this service either: 259 identical probe failures hit 27 distinct avada-seo Cloud Run services in the same 17:00–18:00Z hour (apisagen2 63, authsagen2 30, handlehooksubscribergen2 18, changelogtriggers-subscriptions 15, partnerintegrationsubscribergen2 14, … handleoptimizeimagegen2 6), which matches the already-recorded fingerprints 10y5ot5 / 1gbu5l7 / 13ojanr / 18882z / 1esj5e for this exact window.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:397` — handleOptimizeImageGen2 = onMessagePublished(...) — the only definition of the alerting Cloud Run service
- `packages/functions/src/handlers/exports/pubsubFunctions.js:398` — config {memory:'2GiB', timeoutSeconds:540, topic:'handleManualOptimizeImage'} — no minInstances, so every traffic burst cold-starts; the topic name matches the alerted request URL
- `packages/functions/src/handlers/exports/pubsubFunctions.js:399` — wrapPubSub(handleManualOptimizeImage) — the handler that would have run; no code path in it executed because the container never bound :8080

## Evidence
- 6 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-09-01T17:18:57Z" AND timestamp<="2026-09-01T17:48:57Z" AND textPayload:"STARTUP TCP probe failed"`
- 7 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-09-01T17:18:57Z" AND timestamp<="2026-09-01T17:48:57Z" AND httpRequest.status>=500`
- 259 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
