fingerprint: u7yyss
service: scanspeedscoresubscriberv2
message: The request failed because the instance failed the readiness check.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T16:29:15.291Z
status: infra
attempt: 1

# IMG-OPT · scanspeedscoresubscriberv2 · u7yyss

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1n2wy73 (same instance 00a41e8c1d61ca2b…, same revision -00179-viy, same second): infra, not code — the Cloud Run container filesystem returned EIO on readFileSync during Node module load, so the cold-start container of scanspeedscoresubscriberv2 exited(1) before binding :8080 and Cloud Run answered the queued Pub/Sub push with 503 'instance failed the readiness check'.

**Mechanism.** The alerted 503 (POST /?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/app-plaza-image-optimizer/topics/scanSpeedScoreV2, latency 233.208150s, timestamp 2026-09-01T16:19:59.385736Z, UA APIs-Google) and the STARTUP-probe ERROR at 16:23:57.298242Z carry the same instanceId 00a41e8c1d61ca2bdc064d0e886887ba… and revision scanspeedscoresubscriberv2-00179-viy — one cold start that never came up. All 14 stderr entries in the window are that one container's startup, in order at 16:23:56.343576–.344826Z: 'Provided module can't be loaded.' → 'Is there a syntax error in your code?' → 'Detailed stack trace: Error: EIO: i/o error, read' → 'at Object.readFileSync (node:fs:448:20)' → 'at loadSource (node:internal/modules/cjs/loader:1548:17)' → 'at Object.<anonymous> (/workspace/lib/services/expertReport/sendReviewNotification.js:9:45)' → 'Could not load the function, shutting down.' EIO from readFileSync is the storage layer under /workspace failing the read, not a JS defect: /workspace/lib/services/expertReport/sendReviewNotification.js is babel output of packages/functions/src/services/expertReport/sendReviewNotification.js, an ordinary import in the shared index.js graph that every other container in this project loads. Platform-side, per the 1n2wy73 record on this same event: 2.6s earlier at 16:23:53.708555Z a different service in the project (handleproderroralertgen2, different revision, different instance) hit the identical EIO at readFileSync on a completely unrelated file (/workspace/node_modules/googleapis/build/src/apis/ml/index.js), and the same service answered HTTP 200 at 16:20:20.115494Z on a healthy instance in the same window. The function is already declared memory '2GiB' (packages/functions/src/index.js:201), and no OOM line exists — the container never bound :8080, so no application log could be written. Two EIO entries and two startup-probe failures project-wide across 15:30–17:00Z: bounded, self-recovered fault.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:200` — scanSpeedScoreSubscriberV2 declared onMessagePublished with memory '2GiB' — already the large tier, so the failed start is not a memory-tier problem
- `packages/functions/src/services/expertReport/sendReviewNotification.js:1` — src source of the /workspace/lib/services/expertReport/sendReviewNotification.js module named in the EIO stack; valid module reached as an ordinary require — the read of the compiled file failed, not its content

## Evidence
- 2 matching entries: `resource.type="cloud_run_revision" AND textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T15:30:00Z" AND timestamp<="2026-09-01T17:00:00Z"`
- 2 matching entries: `resource.type="cloud_run_revision" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T15:30:00Z" AND timestamp<="2026-09-01T17:00:00Z"`
- 1 matching entries: `resource.labels.service_name="scanspeedscoresubscriberv2" AND httpRequest.status=200 AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T17:10:00Z"`
- 2 matching entries: `(resource.labels.service_name="scanspeedscoresubscriberv2" OR resource.labels.function_name="scanspeedscoresubscriberv2") AND timestamp>="2026-09-01T16:09:50.415Z" AND timestamp<="2026-09-01T16:39:50.415Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.18

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
