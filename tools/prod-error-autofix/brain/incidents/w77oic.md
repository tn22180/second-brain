fingerprint: w77oic
service: optimizesubscriberv2gen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T07:34:32.391Z
status: infra
attempt: 1

# SEO · optimizesubscriberv2gen2 · w77oic

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 1wblodj (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 killed 4 optimizesubscriberv2gen2 cold starts on revision -00315-fem, each at the 240s startup TCP probe deadline, so Pub/Sub's push deliveries for topic optimizeImageV2 were answered 503 'instance failed the readiness check'.

**Mechanism.** optimizeSubscriberV2Gen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds: LIMIT_TIME_PUBSUB_OPTIMIZE=540, topic: OPTIMIZER_PUB_SUB_V2, ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:124-132), so every optimizeImageV2 message arriving at zero warm instances pays a full cold start. Four such cold starts in 04:16–04:34Z never bound :8080: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' at 04:20:41.298Z, 04:25:01.173Z, 04:29:19.113Z, 04:33:39.026Z, each ~20s after the matching push request started, and the four push requests were answered 503 with latencies 246.105s / 243.100s / 241.084s / 241.109s — matching `gcloud run services describe`'s startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (P4: the latency identifies which limit fired). All four are the same revision optimizesubscriberv2gen2-00315-fem, the same revision that started fine at 03:25:20.933Z and again at 04:35:04.396Z and 04:37:28.350Z — unchanged code, so this is not a module-load regression. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h against a declared cpu=1;memory=1024Mi, and no application log line accompanies any of the four (the stderr read holds only successful [subscribeOptimize] MSG_RECEIVED / [optimizeImg:processFileImage] work at 04:37). The fault is fleet-wide, not service-specific: in the same 04:00–05:00Z hour the identical 'STARTUP TCP probe failed' line fired 593 times across ~78 distinct avada-seo services (authgen2 ×103, handleproderroralertgen2 ×79, apigen2 ×52, onupdateshopgen2 ×45, proxygen2 ×37, extensiongen2 ×31, …, optimizesubscriberv2gen2 ×4) on different revisions and different images — the same window already recorded as infra under fingerprints 1wblodj / 1fgksqk / nxz67h / 1t6fr9s / 6ya4nu / muzsov and others. Blast radius is bounded: onMessagePublished is a Pub/Sub push subscription, so a 503 is a nack and the message is redelivered — the same shop 9sJwi1SYMfJLYX1NKuly / historyId TEKaJyrJrhsMQ1PRQpLT work ran to completion at 04:37:39-04:37:41Z on revision -00316-ciy ([runOptimizeImageJob] LAUNCHED, execution avada-seo-optimize-image-job-pqf6j), i.e. the optimize job was delayed ~20 minutes, not lost.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:124` — optimizeSubscriberV2Gen2 export — the service whose cold starts failed the 240s startup TCP probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:126` — memory: '1GiB' with no minInstances — every optimizeImageV2 message at zero warm instances pays a full cold start; 1GiB with zero 'Memory limit' lines in 24h rules out P3 OOM
- `packages/functions/src/const/optimizeImage.js:1` — LIMIT_TIME_PUBSUB_OPTIMIZE = 540 — the function's own request timeout, 2.2× the observed 241–246s latencies, confirming the 240s startup probe (not the function timeout) is the limit that fired

## Evidence
- 8 matching entries: `(resource.labels.service_name="optimizesubscriberv2gen2") AND timestamp>="2026-08-14T04:16:31.924Z" AND timestamp<="2026-08-14T04:46:31.924Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.service_name="optimizesubscriberv2gen2") AND timestamp>="2026-08-14T04:16:31.924Z" AND timestamp<="2026-08-14T04:46:31.924Z" AND httpRequest.status>=500`
- 13 matching entries: `(resource.labels.service_name="optimizesubscriberv2gen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe")`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $1.26

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
