fingerprint: 1ufg1uu
service: bulkauditfixapplyproductgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-12T19:58:19.247Z
status: infra
attempt: 1

# SEO · bulkauditfixapplyproductgen2 · 1ufg1uu

**Outcome.** infra class — reported, no MR

**Root cause.** Two of three bulkauditfixapplyproductgen2 cold-start containers in the 09:06–09:15Z window never bound :8080 and were killed when Cloud Run's startup TCP probe hit its configured timeoutSeconds: 240 — a cold-start boot stall on the shared gen2 module graph, not an application defect; Pub/Sub redelivered and the third instance booted in 39.8s and completed both bulk jobs.

**Mechanism.** Cloud Run started 3 instances for the bulkAuditFixApplyProduct push subscription. Instance 001548f729ded2f5 logged 'Starting new instance. Reason: AUTOSCALING' at 09:06:15.883897Z and 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 / Connection failed with status DEADLINE_EXCEEDED' at 09:10:15.997798Z — 240.114s later. Instance 001548f729fc0b1f started 09:10:33.751115Z, failed 09:14:33.889638Z — 240.139s later. `gcloud run services describe bulkauditfixapplyproductgen2` returns startupProbe {tcpSocket: 8080, failureThreshold: 1, periodSeconds: 240, timeoutSeconds: 240}, so both latencies match the configured probe limit to within 140ms (pattern P4: the number identifies which limit fired). Neither failed container emitted a single stderr line — all 59 stderr entries in the window carry instanceId 001548f729a88fd8, the instance that booted successfully — so the stall is in module load before any application code runs, exactly the silent variant seen on handleoptimizeimagegen2 (fingerprint 17q2y13, same repo, same 240s probe). Every gen2 container loads the whole functions index (src/index.js → app.js), which pulls the `googleapis` barrel via helpers/google.js:2 — hundreds of readFileSync calls on a 1-vCPU container; the one instance that did boot still needed 39.795s (09:14:51.712880Z start → 09:15:31.507891Z 'STARTUP TCP probe succeeded'), so the normal boot already sits within an order of magnitude of the 240s ceiling. Redis is ruled out as the blocker: redisCache.js:90 sets lazyConnect: true and connect() is fire-and-forget (:108), and the surviving instance's '[redisCache] connection error connect ETIMEDOUT' landed at 09:15:34.977Z — 3.5s AFTER it had already bound :8080. Memory is ruled out: the service is 1024Mi and no 'Memory limit ... exceeded' line exists in the window. The two failed deliveries were answered 503 'The request failed because the instance failed the readiness check' (latency 245.134392s and 241.148763s); Pub/Sub redelivered, and the third instance ran both jobs to completion — '[dispatchNextOrFinalise] apply complete' for bulkJobId pDMssYY5hesQh7RigETy (10/10 applied, 09:16:46.127536Z) and a28FSBhSUSo5PJW6Y3j1 (1/1 applied, 09:18:21.651558Z). No merchant work was lost.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:505` — bulkAuditFixApplyProductGen2 export — the service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:506` — {memory: '1GiB', timeoutSeconds: 540, topic: APPLY_PRODUCT} — no minInstances, so every Pub/Sub burst pays a full module-load cold start; 1GiB rules out P3 OOM (no memory-limit line in window)
- `packages/functions/src/helpers/google.js:2` — `import {google} from 'googleapis'` — the barrel in the shared gen2 import graph that made a 240s+ boot possible; same file implicated in fingerprint 17q2y13
- `packages/functions/src/index.js:8` — `module.exports = require('./app')` — every gen2 container loads the whole functions index, so this pubsub handler carries the full import graph on cold start
- `packages/functions/src/helpers/redisCache.js:90` — lazyConnect: true with a fire-and-forget connect() at :108 — proves the ETIMEDOUT redis line on the surviving instance is not a boot blocker

## Evidence
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`
- 3 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND textPayload:"Starting new instance" AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`
- 1 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND textPayload:"STARTUP TCP probe succeeded" AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND httpRequest.status>=500 AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND textPayload:"dispatchNextOrFinalise" AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`
- 2 matching entries: `resource.labels.service_name="bulkauditfixapplyproductgen2" AND textPayload:"redisCache" AND timestamp>="2026-08-12T08:58:09Z" AND timestamp<="2026-08-12T09:28:10Z"`

## Job
- analyze rounds: 1
- cost: $1.66

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
