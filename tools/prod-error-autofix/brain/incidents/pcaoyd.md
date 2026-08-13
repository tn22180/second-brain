fingerprint: pcaoyd
service: bulkauditfixapplyproductgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-12T19:59:42.721Z
status: infra
attempt: 1

# SEO · bulkauditfixapplyproductgen2 · pcaoyd

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 1ufg1uu (already recorded infra, no MR): the same two bulkauditfixapplyproductgen2 cold-start containers in the 09:06–09:15Z window on 2026-08-12 never bound :8080 and were killed at Cloud Run's configured startupProbe timeoutSeconds: 240, so both bulkAuditFixApplyProduct Pub/Sub pushes were answered 503 'instance failed the readiness check'; a boot stall on the shared gen2 module graph, not an application defect.

**Mechanism.** This alert is the 503 request-log side of the same event 1ufg1uu recorded from the probe-failure side — same service, same window, same two instance starts. Cloud Run started an instance at 09:06:15.883897Z ('Starting new instance. Reason: AUTOSCALING') for the push that arrived 09:06:15.842195Z, and logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 ... DEADLINE_EXCEEDED' at 09:10:15.997798Z — 240.114s later. Second start 09:10:33.751115Z (push at 09:10:33.732256Z), probe failure 09:14:33.889638Z — 240.139s later. `gcloud run services describe bulkauditfixapplyproductgen2` returns startupProbe {tcpSocket:8080, failureThreshold:1, periodSeconds:240, timeoutSeconds:240}, so both latencies match the configured probe limit to within 140ms (P4 — the number names which limit fired). The two 503s carry latency 245.134392s and 241.148763s, i.e. probe window plus scheduling. Neither failed container emitted any stderr: all 59 stderr entries in the window belong to the third instance, which started 09:14:51.712880Z and logged 'STARTUP TCP probe succeeded' 39.795s later at 09:15:31.507891Z, then ran both jobs to completion ('[applyOneProduct] ... product applied' 09:18:21.468305Z, '[dispatchNextOrFinalise] apply complete' 09:18:21.651558Z). So the stall is in module load before any application code runs. bulkAuditFixApplyProductGen2 is declared {memory:'1GiB', timeoutSeconds:540, topic: APPLY_PRODUCT} with no minInstances (pubsubFunctions.js:505-507), so every burst on this topic pays a full cold start; every gen2 container loads the whole functions index (index.js:8 → app.js), which pulls the googleapis barrel at helpers/google.js:2 — the same import graph implicated in 17q2y13 on handleoptimizeimagegen2 at the same 240s probe. P3 OOM ruled out: 1GiB declared and zero 'Memory limit ... exceeded' lines in the window. No merchant work lost — Pub/Sub redelivered and both bulk jobs finished. Infra class: the levers are minInstances on this export or trimming the shared import graph, both Tuan's call.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:505` — bulkAuditFixApplyProductGen2 export — the service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:506` — {memory:'1GiB', timeoutSeconds:540, topic: APPLY_PRODUCT} — no minInstances, so every Pub/Sub burst pays a full module-load cold start; 1GiB plus no memory-limit line rules out P3
- `packages/functions/src/index.js:8` — module.exports = require('./app') — every gen2 container loads the whole functions index, so this pubsub handler carries the full import graph on cold start
- `packages/functions/src/helpers/google.js:2` — import {google} from 'googleapis' — barrel in the shared gen2 import graph that makes a >240s boot possible on a 1-vCPU container; same file implicated in 17q2y13

## Evidence
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND timestamp>="2026-08-12T08:59:34.194Z" AND timestamp<="2026-08-12T09:29:34.194Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND timestamp>="2026-08-12T08:59:34.194Z" AND timestamp<="2026-08-12T09:29:34.194Z" AND textPayload:"Starting new instance"`
- 1 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND timestamp>="2026-08-12T08:59:34.194Z" AND timestamp<="2026-08-12T09:29:34.194Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND timestamp>="2026-08-12T08:59:34.194Z" AND timestamp<="2026-08-12T09:29:34.194Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND timestamp>="2026-08-12T08:59:34.194Z" AND timestamp<="2026-08-12T09:29:34.194Z" AND textPayload:"dispatchNextOrFinalise"`

## Job
- analyze rounds: 1
- cost: $1.12

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
