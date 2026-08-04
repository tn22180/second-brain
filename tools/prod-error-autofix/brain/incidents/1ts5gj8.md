fingerprint: 1ts5gj8
service: handleoptimizeimagegen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-04T11:22:41.384Z
status: infra
attempt: 1

# SEO · handleoptimizeimagegen2 · 1ts5gj8

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 17q2y13 (same 10:01-10:07Z burst on handleoptimizeimagegen2, already recorded as infra on 2026-08-04): five of 14 cold-start containers never reached listen() on :8080 — two died with `EIO: i/o error, read` while readFileSync'ing `/workspace/node_modules/googleapis/build/src/apis/**`, three hung in the same boot phase until the startup TCP probe's 240s timeout — so Cloud Run answered the three in-flight Pub/Sub pushes 503 'instance failed the readiness check'.

**Mechanism.** The alert message is the Cloud Run request-side text, not an application error; the same three 503s (10:01:02.368/.376/.447Z, latency 242.17s/241.14s/184.12s, three distinct instanceIds 001548f729a03fa62f70 / 001548f729aafe5b696e / 001548f7293e323e07ca) were the requests waiting on failed cold starts. Every gen2 container in this repo loads the whole functions index, and handleOptimizeImageGen2 (packages/functions/src/handlers/exports/pubsubFunctions.js:397) sits in a graph pulling the `googleapis` barrel twice (packages/functions/src/helpers/google.js:2 and packages/functions/src/services/instantIndexingService.js:1), whose apis/index.js requires ~200 sub-API modules — hundreds of readFileSync calls per boot. Two containers threw on that read: 10:02:31.850Z 'Provided module can't be loaded / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20) / at Object.<anonymous> (/workspace/node_modules/googleapis/build/src/apis/index.js:87:24)' → 'Could not load the function, shutting down.' → probe failed CANCELLED 10:02:32.759Z; and 10:04:06.283Z at apis/websecurityscanner/index.js:20 → probe failed CANCELLED 10:04:06.735Z. 2/2 module-load deaths pair with a probe failure inside 500ms. The remaining three probe failures (10:05:02.632Z, 10:05:03.452Z, 10:07:34.650Z) logged no application line and carry DEADLINE_EXCEEDED, matching the service's startupProbe timeoutSeconds: 240 (P4 — latency equals a configured limit). The image did not change and 9 of 14 starts in the same 20 minutes probed successfully, with traffic flowing throughout (~70 '[incrementImageOptimizeAIUsage] Credits deducted Wykd9UtZWCEhYTBtCq52 1' lines from 10:04-10:08Z), so the fault is a transient device-level read error on the container source layer, not a defect in this repo. The concurrent '[redisCache:get] ... Stream isn't writeable and enableOfflineQueue options is false' lines (6 in window) are a separate non-fatal path, not the 503 cause. memory is 2GiB (pubsubFunctions.js:398) and no 'Memory limit ... exceeded' line exists in the window, so P3 OOM is ruled out.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:397` — handleOptimizeImageGen2 export — the service whose cold starts failed; no minInstances, so every Pub/Sub burst pays a full module-load cold start
- `packages/functions/src/handlers/exports/pubsubFunctions.js:398` — {memory: '2GiB', timeoutSeconds: 540, topic: 'handleManualOptimizeImage'} — 2GiB plus zero OOM lines rules out P3; memory is not the ceiling that fired
- `packages/functions/src/helpers/google.js:2` — import {google} from 'googleapis' — the barrel whose apis/index.js is the exact file that threw EIO at 10:02:31.850Z
- `packages/functions/src/services/instantIndexingService.js:1` — second googleapis barrel import in the same shared graph — confirms ~200 sub-API modules are read on every gen2 cold start, including this one

## Evidence
- 5 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND textPayload:"EIO: i/o error, read"`
- 2 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND textPayload:"Could not load the function"`
- 2 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND textPayload:"googleapis/build/src/apis"`
- 3 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND httpRequest.status>=500`
- 70 matching entries: `resource.labels.service_name="handleoptimizeimagegen2" AND timestamp>="2026-08-04T09:49:15.018Z" AND timestamp<="2026-08-04T10:19:15.018Z" AND textPayload:"incrementImageOptimizeAIUsage"`

## Job
- analyze rounds: 1
- cost: $1.15

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
