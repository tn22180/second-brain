fingerprint: 1uldgv
service: scanspeedscoresubscriberv2gen2
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-09-01T18:15:12.886Z
status: infra
attempt: 1

# SEO · scanspeedscoresubscriberv2gen2 · 1uldgv

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so scanspeedscoresubscriberv2gen2 cold-start containers died before binding :8080 and Cloud Run answered the Pub/Sub push deliveries with 503 'instance failed the readiness check' and 500 'instance could not start successfully'.

**Mechanism.** All 13 5xx in the window are POST pushes of topic scanSpeedScoreV2 to scanspeedscoresubscriberv2gen2-00343-bir — 9× 503 'The request failed because the instance failed the readiness check' and 4× 500 'The request failed because the instance could not start successfully' at latency exactly 0s. Ten distinct instances logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' (DEADLINE_EXCEEDED on the 241–246s 503s, matching Cloud Run's 240s startup deadline; CANCELLED on the 54–65s ones where the pusher gave up first). Four of those instances left an application-side stack: 'Provided module can't be loaded. / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20) / at defaultLoadImpl (node:internal/modules/cjs/loader:1122:17) …' followed by 'Could not load the function, shutting down.' The failing read is at a *different* file on every instance and all inside the read-only image layer — node_modules/googleapis/build/src/apis/oauth2/index.js:18 (00a41e8c1db94c @17:42:17), .../driveactivity/index.js:18 (00a41e8c1de5d3 @17:40:34), .../datafusion/index.js:20 (00a41e8c1d43ae @17:39:01), node_modules/@avada/core/build/controllers/subscriptionController.js:83 (00a41e8c1dea68 @17:28:48) — a per-container filesystem fault, not a code path. The revision is not new: scanspeedscoresubscriberv2gen2-00343-bir was created 2026-08-28T10:48:45Z, four days before the incident, and the same image served traffic fine — instance 00a41e8c1d33cd ran normally at 17:57:13–15 ('[subscribeScanSpeedScore] Start speed score scan …'). The fault is fleet-wide, not this service's: the identical `EIO: i/o error, read` appears 76 times across 14 avada-seo services in the 17:00–18:00Z hour (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, scanspeedscoresubscriberv2gen2 5, …), the same window and same signature already recorded as fingerprints 10y5ot5 / 1st9nfu / 1ombwxy / 10gpf63 / znz9xj / 1l9w2m4 / txdvop / koudd9 / 1esj5e. The only app-side amplifier is that scanSpeedScoreSubscriberV2Gen2 is declared with no minInstances and no concurrency override (Cloud Run default 80), so every scanSpeedScoreV2 message in the window had to ride a cold start; those messages are not lost — Pub/Sub redelivers on a 5xx.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:244` — scanSpeedScoreSubscriberV2Gen2 is declared {memory: '2GiB', timeoutSeconds: LIMIT_TIME_PUBSUB_OPTIMIZE (540), topic: 'scanSpeedScoreV2', ...vpcSettings} — no minInstances, no concurrency override (Cloud Run default 80). Every scanSpeedScoreV2 delivery therefore lands on a cold start; when the platform cannot start containers, all of them 5xx. No code defect here — this is the only knob touching blast radius.
- `packages/functions/src/const/optimizeImage.js:1` — LIMIT_TIME_PUBSUB_OPTIMIZE = 540 — the declared request timeout. None of the observed latencies (54–246s) match it; the 241–246s cluster matches Cloud Run's 240s container-startup deadline instead, which is what pins the failure to startup rather than to handler work.

## Evidence
- 13 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-09-01T17:27:20.578Z" AND timestamp<="2026-09-01T17:57:20.578Z" AND httpRequest.status>=500`
- 5 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"EIO: i/o error, read"`
- 10 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"Default STARTUP TCP probe failed"`
- 76 matching entries: `textPayload:"EIO: i/o error, read" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z"`
- 8 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2gen2" AND timestamp>="2026-09-01T17:56:00Z" AND timestamp<="2026-09-01T17:58:00Z"`

## Job
- analyze rounds: 1
- cost: $1.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
