fingerprint: 6f0nn
service: scanspeedscoresubscriberv2gen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-08-14T07:50:50.918Z
status: infra
attempt: 1

# SEO · scanspeedscoresubscriberv2gen2 · 6f0nn

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault in avada-seo/us-central1 during the 2026-08-14 04:00–05:00Z hour (already recorded as fingerprints q19goa / 1t6fr9s / pva4gd / 1lwydlk / 1r74ll6) — scanspeedscoresubscriberv2gen2 cold starts failed their Cloud Run STARTUP TCP probe on :8080 with DEADLINE_EXCEEDED, so Cloud Run itself answered the Pub/Sub push for topic scanSpeedScoreV2 with 500/503 before any application code ran.

**Mechanism.** Pub/Sub pushes topic scanSpeedScoreV2 as POST /?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects%2Favada-seo%2Ftopics%2FscanSpeedScoreV2 (userAgent APIs-Google, remoteIp 74.125.215.78) to scanspeedscoresubscriberv2gen2, revision -00309-qik. Cloud Run had to cold-start containers; 5 of those starts logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' (04:26:06, 04:30:23, 04:30:30, 04:34:39, 04:35:01Z). The container never bound :8080 inside the probe deadline, so the runtime was killed before firebase-functions ever loaded packages/functions/lib/handlers/exports/pubsubFunctions.js (src at packages/functions/src/handlers/exports/pubsubFunctions.js:244) and therefore before the handler at packages/functions/src/handlers/pubsub/subscribeScanSpeedScore.js:8 could run. The platform answered the queued pushes itself: 5× 503 'The request failed because the instance failed the readiness check' with latencies clamped at 241.13/242.15/243.33/244.14/244.45s, and the alerted 1× 500 at 04:21:42.061767Z with latency 0s and an empty payload — both are platform wait/kill numbers, not handler work. There is no application log line anywhere near 04:21:42Z; the first app output in the window is 04:35:26Z '[subscribeScanSpeedScore] Start speed score scan 7Zg4G0gaM9prq3rEgqVH' on the same revision -00309-qik, and every scan that did get a container completed normally (score=90/56, 100/72, 60/55). This is not specific to the function: 593 identical probe failures hit 25+ distinct avada-seo Cloud Run services in the same 04:00–05:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31 … scanspeedscoresubscriberv2gen2 5), which rules out anything in this function's own import graph or memory/timeout config.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:244` — scanSpeedScoreSubscriberV2Gen2 = onMessagePublished({memory:'2GiB', topic:'scanSpeedScoreV2'}) — the only definition of the alerting Cloud Run service; no line in it executed because the container never bound :8080
- `packages/functions/src/handlers/exports/pubsubFunctions.js:248` — topic: 'scanSpeedScoreV2' — matches the CUSTOM_PUBSUB_projects/avada-seo/topics/scanSpeedScoreV2 in the failing requestUrl, tying the alert to this export
- `packages/functions/src/handlers/pubsub/subscribeScanSpeedScore.js:8` — subscribeScanSpeedScore — the handler that would have run; its own logger.error at :16 never fired, and its success lines at :11/:13 appear only from 04:35:26Z on containers that did start

## Evidence
- 5 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-08-14T04:19:37Z" AND timestamp<="2026-08-14T04:49:37Z" AND textPayload:"STARTUP TCP probe failed"`
- 6 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-08-14T04:19:37Z" AND timestamp<="2026-08-14T04:49:37Z" AND httpRequest.status>=500`
- 593 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 21 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-08-14T04:19:37Z" AND timestamp<="2026-08-14T04:49:37Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.34

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
