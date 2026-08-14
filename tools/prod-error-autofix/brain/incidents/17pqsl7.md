fingerprint: 17pqsl7
service: optimizeproductsubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:14:29.008Z
status: infra
attempt: 1

# SEO · optimizeproductsubscribergen2 · 17pqsl7

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:31:58Z prod deploy of avada-seo created revision optimizeproductsubscribergen2-00317-tag, whose container never bound :8080 within the default 240s startup TCP probe, so Cloud Run marked the revision HealthCheckContainerError and the firebase UpdateFunction call failed — one of 593 identical probe failures across 78 distinct avada-seo/us-central1 services in the same 90 minutes, and the same unchanged code deployed clean 45 minutes later as revision 00318-loz.

**Mechanism.** optimizeProductSubscriberGen2 is declared onMessagePublished({topic:'optimizeProduct', memory:'1GiB', timeoutSeconds:LIMIT_TIME_PUBSUB_OPTIMIZE}) at packages/functions/src/handlers/exports/pubsubFunctions.js:109-117 — no minInstances, so every deploy pays a full container start. Revision optimizeproductsubscribergen2-00317-tag was created at 2026-08-14T04:31:58.554828Z (gcloud run revisions describe, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1). At 04:36:03.368120Z Cloud Run logged on instance 001548f729124df7… 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 244.81s after revision creation, matching that revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (P4: the latency identifies which limit fired). 5.1s later the platform emitted the two system_event audit lines (Revision then Service Ready→False, generation 317) and at 04:36:10.073716745Z the cloudaudit activity line 'Could not create or update Cloud Run service optimizeproductsubscribergen2, Container Healthcheck failed', code 3, on principal tuannv@avadagroup.com's FunctionService.UpdateFunction — i.e. the alert is a failed deploy, not a failed request. The container produced no application log at all (stderr read = 0 entries, requests read = 0 entries — which is why round 1's httpRequest.status>=500 query matched nothing: no request ever reached this revision, traffic stayed on 00316-fif). P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h despite the 1GiB declaration. The fault is not this service's code: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44 …) on different revisions and different images, the same platform-wide window already recorded under fingerprints 1udmr73 / s01pkg / 18hglhi et al. On this service specifically the failure is 1-in-4: 3 'STARTUP TCP probe succeeded' vs 1 failure in 24h, and the same build shipped clean as revision optimizeproductsubscribergen2-00318-loz at 05:16:43.831223Z (Ready=True), now superseded by 00320-fen serving 100% of traffic. Blast radius is zero merchant impact: the failed revision never received traffic, no Pub/Sub message on topic 'optimizeProduct' was lost, only this function's deploy in that CI run failed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:109` — optimizeProductSubscriberGen2 export — the function whose deploy revision 00317-tag failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:112` — memory:'1GiB' with no minInstances — matches the deployed revision's 1024Mi limit; zero 'Memory limit' lines that day rules out P3 OOM
- `packages/functions/src/handlers/exports/pubsubFunctions.js:116` — wrapPubSub(subscribeOptimizeProduct) — the handler never ran; the process died before listen(), so no app-side defect can be in scope
- `packages/functions/src/const/optimizeImage.js:1` — LIMIT_TIME_PUBSUB_OPTIMIZE = 540 — the request timeout, distinct from the 240s startup probe that actually fired

## Evidence
- 1 matching entries: `resource.labels.service_name="optimizeproductsubscribergen2" AND timestamp>="2026-08-14T04:26:10Z" AND timestamp<="2026-08-14T04:56:10Z" AND textPayload:"STARTUP TCP probe failed"`
- 593 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="optimizeproductsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 4 matching entries: `(resource.labels.service_name="optimizeproductsubscribergen2" OR resource.labels.function_name="optimizeProductSubscriberGen2") AND timestamp>="2026-08-14T04:26:10.061Z" AND timestamp<="2026-08-14T04:56:10.061Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.61

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
