fingerprint: vtubke
service: fixauditcontentgen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-09-01T18:06:30.223Z
status: infra
attempt: 1

# SEO · fixauditcontentgen2 · vtubke

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault swept avada-seo/us-central1 during 2026-09-01T17:24–17:54Z — 6 fixauditcontentgen2 cold-start containers never bound :8080 within the 240s Cloud Run STARTUP TCP probe deadline, so Cloud Run itself answered the queued Pub/Sub push deliveries with 5×503 and the alerted 1×500 before any application code ran.

**Mechanism.** Pub/Sub pushes topic fixAuditContent to https://fixauditcontentgen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_... (userAgent 'APIs-Google'). fixAuditContentGen2 is declared with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:338), so each burst needs a cold start of revision fixauditcontentgen2-00182-yud. 6 of those starts logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' (17:36:41→17:53:44Z, 6 distinct instanceIds). The runtime was killed before firebase-functions ever loaded packages/functions/src/handlers/pubsub/subscribeFixAuditContent.js:8, so Cloud Run answered the waiting deliveries itself: 5×503 'The request failed because the instance failed the readiness check' with latencies clamped at 241.13/242.11/242.17/246.24/250.29s (all ≈ the 240s startup-probe deadline, i.e. platform wait time, not handler work) plus the alerted 500 at 17:36:48.252788Z with latency 0s and no textPayload — the 'instance could not start successfully' class, zero handler time. This is not this function's import graph: the same probe failure hit 21 distinct avada-seo Cloud Run services in the identical 30-minute window (apisagen2 63, authsagen2 22, partnerintegrationsubscribergen2 13, changelogtriggers-subscriptions 12, handlehooksubscribergen2 11, changelogtriggers-shopinfos 11, scanspeedscoresubscriberv2gen2 9, savealtversionsubscribergen2 7, oncreateusergen2 7, handleoptimizeimagegen2 6, fixauditcontentgen2 6, proxygen2 5, bulkauditfixapplygen2 5, …) — 183 in the window, 270 in the 17:00–18:00Z hour. Positive control that the code itself is healthy: on instances that DID start, the same handler ran clean inside the same window — '[subscribeFixAuditContent] start yjQlVSltcqnrrD9WCmG9 …' at 17:44:51.507648Z and 17:52:43.871973Z, each finishing '[fixMainContentAsync] done … fullyResolved: true' in ~24s and ~19s. Same family as recorded fingerprints 1sc23g3 / txdvop / 1gbu5l7 / 1esj5e / koudd9 for this project and date.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:338` — the only declaration of fixAuditContentGen2 — memory '1GiB', timeoutSeconds 540, topic FIX_AUDIT_CONTENT_TOPIC, no minInstances, so every burst pays a cold start; none of its options were reached because the container never bound :8080
- `packages/functions/src/handlers/pubsub/subscribeFixAuditContent.js:8` — the handler that would have run had the container started; its first log line '[subscribeFixAuditContent] start' (line 46) is absent for all 6 failed instanceIds and present for the two that did start
- `packages/functions/src/const/aiFixJob.js:5` — FIX_AUDIT_CONTENT_TOPIC = 'fixAuditContent' — the topic name in the alerted request URL, confirming the 500 is an Eventarc/Pub/Sub push to this service

## Evidence
- 6 matching entries: `resource.labels.service_name="fixauditcontentgen2" AND timestamp>="2026-09-01T17:24:04Z" AND timestamp<="2026-09-01T17:54:04Z" AND textPayload:"STARTUP TCP probe failed"`
- 7 matching entries: `resource.labels.service_name="fixauditcontentgen2" AND timestamp>="2026-09-01T17:24:04Z" AND timestamp<="2026-09-01T17:54:04Z" AND httpRequest.status>=500`
- 183 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-09-01T17:24:04Z" AND timestamp<="2026-09-01T17:54:04Z" AND textPayload:"STARTUP TCP probe failed"`
- 18 matching entries: `resource.labels.service_name="fixauditcontentgen2" AND timestamp>="2026-09-01T17:24:04Z" AND timestamp<="2026-09-01T17:54:04Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.79

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
