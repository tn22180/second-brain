fingerprint: pr4klq
service: scanspeedscoresubscriberv2gen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T07:59:59.667Z
status: infra
attempt: 1

# SEO · scanspeedscoresubscriberv2gen2 · pr4klq

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 6f0nn (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 during the 2026-08-14 04:00–05:00Z hour made scanSpeedScoreSubscriberV2Gen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 5 Pub/Sub pushes on topic scanSpeedScoreV2 waiting on those cold starts were answered 503 'instance failed the readiness check' (plus 1 fast 500 at 0s while a new instance was being started).

**Mechanism.** All 6 failed requests in the window are POST / with __GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/scanSpeedScoreV2, user-agent APIs-Google, all on one revision scanspeedscoresubscriberv2gen2-00309-qik. The 5× 503 carry latency 241.126s / 242.147s / 243.331s / 244.137s / 244.453s — the 240s Cloud Run startup-probe deadline plus scheduling (P4: the latency identifies which limit fired), not this function's own timeoutSeconds of 540 (LIMIT_TIME_PUBSUB_OPTIMIZE, const/optimizeImage.js:1). The 6th failure at 04:21:42.061767Z is a 500 with latency 0s, emitted 63ms before 'Starting new instance. Reason: AUTOSCALING … no existing capacity for current traffic' — a request rejected before any container existed. 5 of the 11 severity>=ERROR entries are 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. / Connection failed with status DEADLINE_EXCEEDED', across 5 distinct instanceIds (…a0269536c2, …e8f7ab7098, …ce20aeaab4, …01060f73a0, …b5696fca21, …bf201100d0), each 503 matching one dead instanceId one-to-one. Not this service's code: the identical probe-failure line fired across 20+ avada-seo services in the same 04:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, scanspeedscoresubscriberv2gen2 5, …) against exactly 2 entries in the whole 03:00Z hour — a bounded platform window already recorded under 6f0nn, 1r74ll6, muzsov, 1470mjt, 8g3u6t, e9i6k0, 1bwfmw9, 1mprni. P3 OOM ruled out: 0 'Memory limit' lines on this service in the whole day at its declared memory '2GiB'. The image boots fine — 14 'STARTUP TCP probe succeeded' the same day, and stderr in the same window shows the handler running normally ('[getGooglePageSpeedScore] done https://cranstonbeanmariner.com/en-global desktop 37417ms score=60', '[subscribeScanSpeedScore] Done speed score scan jIENxPe2ORiRPHyb5bgE' at 04:39). The subscriber body was never entered — the container died before listen() — so no partial Firestore writes; Pub/Sub redelivers on 5xx, so the scans re-ran.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:244` — scanSpeedScoreSubscriberV2Gen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:246` — memory: '2GiB' with no minInstances, so every scanSpeedScoreV2 burst at zero warm instances pays a full cold start; 2GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:248` — topic: 'scanSpeedScoreV2' — the topic named in the requestUrl of all 6 failed pushes
- `packages/functions/src/const/optimizeImage.js:1` — LIMIT_TIME_PUBSUB_OPTIMIZE = 540 — the function's own timeout, which the 241–244s latencies do NOT match, confirming the 240s startup probe fired instead

## Evidence
- 6 matching entries: `(resource.labels.service_name="scanspeedscoresubscriberv2gen2") AND timestamp>="2026-08-14T04:20:54.187Z" AND timestamp<="2026-08-14T04:50:54.187Z" AND httpRequest.status>=500`
- 11 matching entries: `(resource.labels.service_name="scanspeedscoresubscriberv2gen2") AND timestamp>="2026-08-14T04:20:54.187Z" AND timestamp<="2026-08-14T04:50:54.187Z" AND severity>=ERROR`
- 578 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 14 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
