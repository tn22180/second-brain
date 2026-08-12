fingerprint: hfgz6m
service: handleoptimizeimagegen2
message: 'Memory limit of 2048 MiB exceeded with 2053 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-12T10:36:19.828Z
status: infra
attempt: 1

# SEO · handleoptimizeimagegen2 · hfgz6m

**Outcome.** infra class — reported, no MR

**Root cause.** handleOptimizeImageGen2 is declared with no `concurrency` override (packages/functions/src/handlers/exports/pubsubFunctions.js:398), so Cloud Run runs it at the gen2 default of 80 messages per instance; during a 1116-message optimize burst at 04:18–04:22Z two instances packed 80–116 concurrent image download+sharp-decode+base64 pipelines into one 2GiB container and were OOM-killed at 2053 MiB and 2203 MiB.

**Mechanism.** The deployed revision handleoptimizeimagegen2-00306-tep has containerConcurrency=80, cpu=1, memory=2Gi, maxScale=100 (gcloud run services describe) because pubsubFunctions.js:398 sets only {memory:'2GiB', timeoutSeconds:540, topic:'handleManualOptimizeImage'} — no concurrency. Each Pub/Sub message runs subscribeHandleOptimizeImage.js:34 -> optimize<Page>Image, and per image the sharp helper downloads the whole original into memory as an arraybuffer (helpers/optimize/sharp.js:55-72, responseType:'arraybuffer'), hands srcBuffer to sharp for a full raw-pixel decode + re-encode to destBuffer (compressImage, sharp.js:175-214, with sharp.cache(false) at sharp.js:5 so nothing is pooled/reused), then holds srcBuffer + destBuffer + a base64 copy of destBuffer (1.33x, sharp.js:42) live at the same time; one message can carry several logs and fires them under Promise.all (fileImageService.js:395), so per-message footprint is a multiple of that. In the window 1116 messages arrived in ~4 minutes (04:18 117, 04:19 414, 04:20 266, 04:21 300) across 17 instances, fleet-wide peak 451 in flight at 04:19:41. Reconstructing per-instance in-flight from request start (timestamp minus latency) to end: the two OOM-killed instances are the two most loaded of the 17 — 001548f729fde66f n=118 peak 116 concurrent (killed 04:21:03.798, 2053 MiB) and 001548f7292f8f7f n=80 peak 80 concurrent (killed 04:21:45.802, 2203 MiB); both instanceIds match the OOM log entries exactly. All 940-1116 request logs returned 200, i.e. the in-flight messages on the killed containers were ACKed and their optimize work silently lost — the same failure already documented in this file for another subscriber at pubsubFunctions.js:255-258 ('the default (80 concurrent messages/instance) packed ~4k shops onto one 1GiB instance, OOM-killed it, and Cloud Run acked the in-flight messages (200)'), fixed there with concurrency: 1 at pubsubFunctions.js:262. CPU starvation confirms the packing: with 1 vCPU shared by 80 sharp decodes, request latency ran median 31.6s, p90 80.5s, max 87.6s. Overshoot is small (2053 and 2203 MiB against 2048, 5-155 MiB over) and only 2 of 17 instances died, so the peak floats right at the cap — which is why 7 days of history hold exactly these 2 OOMs and no others.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:398` — declaration of handleOptimizeImageGen2 — memory '2GiB', no concurrency override, so Cloud Run applies the gen2 default of 80 messages/instance (confirmed containerConcurrency=80 on revision -00306-tep)
- `packages/functions/src/handlers/exports/pubsubFunctions.js:255` — the same defect already diagnosed and commented in this file for updateSpeedUpExpireTimeSubscriberGen2 — default 80/instance OOM-killed it and Cloud Run acked the in-flight messages
- `packages/functions/src/handlers/exports/pubsubFunctions.js:262` — concurrency: 1 — the precedent fix applied to that subscriber, not applied here
- `packages/functions/src/handlers/pubsub/subscribeHandleOptimizeImage.js:34` — every message runs a full optimize<Page>Image pass in-process; 80 of these share one 2GiB container
- `packages/functions/src/helpers/optimize/sharp.js:59` — responseType 'arraybuffer' — the entire source image is held in memory per image
- `packages/functions/src/helpers/optimize/sharp.js:175` — sharp(srcBuffer).metadata() then re-encode — raw-pixel decode is the dominant allocation, off-heap and counted by the cgroup
- `packages/functions/src/helpers/optimize/sharp.js:42` — base64 copy of destBuffer kept live alongside srcBuffer and destBuffer, +1.33x the compressed size per image
- `packages/functions/src/helpers/optimize/sharp.js:5` — sharp.cache(false) — no pooling, each concurrent decode allocates its own working set
- `packages/functions/src/services/optimize/fileImageService.js:395` — await Promise.all(handlers) — one message can hold several images resident at once, so per-message footprint is a multiple of one image
- `packages/functions/src/controllers/seoController.js:1238` — dispatchWork('handleManualOptimizeImage') fan-out — one message per log entry, the source of the 1116-message burst

## Evidence
- 2 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-08-07T04:08:03.867Z" AND timestamp<="2026-08-07T04:38:03.867Z" AND severity>=ERROR`
- 1116 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-08-07T04:00:00Z" AND timestamp<="2026-08-07T04:40:00Z" AND logName:"requests"`
- 2 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-07-31T00:00:00Z" AND timestamp<="2026-08-07T05:08:00Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 60 matching entries: `(resource.labels.service_name="handleoptimizeimagegen2") AND timestamp>="2026-08-07T03:38:00Z" AND timestamp<="2026-08-07T05:08:00Z" AND logName:"system"`

## Job
- analyze rounds: 1
- cost: $1.97

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
