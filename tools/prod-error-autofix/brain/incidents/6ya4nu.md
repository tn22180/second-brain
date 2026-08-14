fingerprint: 6ya4nu
service: bulkauditfixdispatchgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T07:20:06.563Z
status: infra
attempt: 1

# SEO · bulkauditfixdispatchgen2 · 6ya4nu

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 1w98ui1 (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 during the 04:1x–04:45Z window on 2026-08-14 stopped bulkauditfixdispatchgen2 cold-start containers from ever binding :8080, so Cloud Run killed each at its 240s startup TCP probe deadline and answered the waiting Pub/Sub push 503 'instance failed the readiness check'.

**Mechanism.** This alert's window (04:15:54–04:45:54Z) covers the identical event already recorded as 1w98ui1 (window 04:14:21–04:44:21Z): 6 of that incident's 7 503s appear here timestamp-for-timestamp — 04:19:23.538029Z (241.074955s), 04:23:39.418419Z (244.126550s), 04:28:04.301137Z (248.249092s), 04:32:36.430465Z (241.105278s), 04:37:06.349937Z (249.121146s), 04:41:45.371914Z (240.370960s) — same instanceIds (…77a78cd07e, …439853e855, …2e3992c9ac, …1b5beffdeb, …0892470d6f, …3b94b53bac), same revision bulkauditfixdispatchgen2-00124-bad. The 7th (04:15:03.894733Z, …65c58987db) falls just before this window's start, which is the only difference. Only the alert text differs ('instance failed the readiness check', the httpRequest fallback) vs the STARTUP-probe textPayload there, so the fingerprint differs while the incident does not. Mechanism unchanged: bulkAuditFixDispatchGen2 is onMessagePublished({memory:'1GiB', timeoutSeconds:120, topic: BULK_FIX_TOPICS.DISPATCH}) with no minInstances (pubsubFunctions.js:490-493), so every Pub/Sub push to a scaled-to-zero service pays a full cold start; the service's startupProbe is tcpSocket:8080 with timeoutSeconds:240, failureThreshold:1, and every 503 latency is 240.37–249.12s — the 240s probe budget plus scheduling, which is P4: the latency identifies which limit fired. Instance ids tie the 9 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' lines one-to-one onto the 503s (e.g. probe failure on …77a78cd07e at 04:23:23.663884Z ↔ its 503 at 04:19:23.538029Z). The container never reached listen(): stderr returned 0 entries and no application log line exists for any of the 6 failures. P3 OOM is ruled out — zero 'Memory limit' lines on this service in 24h. Not this service's code: in this exact 30-minute window the same probe-failure line fired 459 times across 65 distinct avada-seo services (authgen2 97, handleproderroralertgen2 67, apigen2 49, onupdateshopgen2 39, proxygen2 36, extensiongen2 31, bulkauditfixdispatchgen2 only 10), on different revisions and images with unchanged code — the same bounded platform window already recorded under 1w98ui1, 1lwydlk, 16ubfhn, 1r74ll6, kjv3nd, 1e908f9. Blast radius bounded and self-healed: subscribeBulkAuditFixDispatch rethrows so Pub/Sub NACKs and redelivers (subscribeBulkAuditFixDispatch.js:28), dispatchBulkFixProducts is resume-safe, and the message landed 200 in 25.77s at 04:46:20.578501Z once a container started — one bulk-fix job delayed ~31 minutes, no work lost.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:490` — bulkAuditFixDispatchGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:491` — {memory:'1GiB', timeoutSeconds:120, topic: BULK_FIX_TOPICS.DISPATCH} — no minInstances, so every push to a scaled-to-zero service pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/pubsub/subscribeBulkAuditFixDispatch.js:28` — rethrow makes Pub/Sub NACK and redeliver — why the failed pushes cost only a delay and a later attempt returned 200 at 04:46:20Z
- `packages/functions/src/const/bulkFixJob.js:10` — BULK_FIX_TOPICS.DISPATCH = 'bulkAuditFixDispatch' — matches __GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/bulkAuditFixDispatch in every 503 URL

## Evidence
- 19 matching entries: `(resource.labels.service_name="bulkauditfixdispatchgen2" OR resource.labels.function_name="bulkauditfixdispatchgen2") AND timestamp>="2026-08-14T04:15:54.213Z" AND timestamp<="2026-08-14T04:45:54.213Z" AND severity>=ERROR`
- 6 matching entries: `(resource.labels.service_name="bulkauditfixdispatchgen2" OR resource.labels.function_name="bulkauditfixdispatchgen2") AND timestamp>="2026-08-14T04:15:54.213Z" AND timestamp<="2026-08-14T04:45:54.213Z" AND httpRequest.status>=500`
- 459 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:15:54Z" AND timestamp<="2026-08-14T04:45:54Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.labels.service_name="bulkauditfixdispatchgen2" AND timestamp>="2026-08-14T04:45:54Z" AND timestamp<="2026-08-14T05:30:00Z" AND httpRequest.status>0`

## Job
- analyze rounds: 1
- cost: $1.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
