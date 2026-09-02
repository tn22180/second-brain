fingerprint: lridf6
service: handlehooksubscribergen2
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-09-01T18:30:55.897Z
status: infra
attempt: 1

# SEO · handlehooksubscribergen2 · lridf6

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: four handlehooksubscribergen2 cold-start containers on revision -00343-zaq failed their Cloud Run STARTUP TCP probe on :8080 with DEADLINE_EXCEEDED during 2026-09-01T17:59–18:13Z, so Cloud Run answered the 9 queued handleHook Pub/Sub push requests with a synthetic 500 'The request failed because the instance could not start successfully.' at latency 0s.

**Mechanism.** All 9 alerted entries are POST https://handlehooksubscribergen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects%2Favada-seo%2Ftopics%2FhandleHook with httpRequest.latency exactly '0s' and textPayload 'The request failed because the instance could not start successfully.' — Cloud Run's own frontend message, emitted when no container is available. No application code ran, so no handler log exists for any of the 9. In the same window four distinct instances of the same revision handlehooksubscribergen2-00343-zaq (00a41e8c1d69b2 @ 17:59:22.660Z, 00a41e8c1d58db @ 18:03:59.718Z, 00a41e8c1d4994 @ 18:08:40.767Z, 00a41e8c1d640f @ 18:13:34.756Z) logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' The 500 burst (18:13:03 → 18:14:52) lands immediately around the 18:13:34 failed start. The same container ran fine before and after: instance 00a41e8c1dd30f completed a full bulk_operations/finish hook at 18:12:15–18:12:25Z and instance 00a41e8c1d8e1d completed two more at 18:15:50–18:15:52Z, both on that same revision — so the code path is healthy and the failure is confined to container startup. The fault is fleet-wide, not this service: 40 'Default STARTUP TCP probe failed' entries appear across 17 avada-seo services in 17:50–18:30Z (partnerintegrationsubscribergen2 8, handlehooksubscribergen2 6, optimizesubscriberv2gen2 5, webhookpublishthemegen2 4, …), the tail of the same platform-side container-start fault already recorded for this project on 2026-09-01 (fingerprints koudd9 / 17whf6b / 10y5ot5 / txdvop). The function is already declared memory '2GiB', timeoutSeconds 540, minInstances 1 — the warm-instance knob is already on, so there is no app-side mitigation left to add.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:344` — handleHookSubscriberGen2 is declared {memory: '2GiB', timeoutSeconds: 540, topic: 'handleHook', minInstances: 1, ...vpcSettings} — already pinned to a warm instance, so the failed cold starts are platform-side, not an under-provisioning defect. No code change applies.

## Evidence
- 9 matching entries: `(resource.labels.service_name="handlehooksubscribergen2" OR resource.labels.function_name="handlehooksubscribergen2") AND timestamp>="2026-09-01T17:58:37.742Z" AND timestamp<="2026-09-01T18:28:37.742Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-09-01T17:58:37.742Z" AND timestamp<="2026-09-01T18:28:37.742Z" AND textPayload:"Default STARTUP TCP probe failed"`
- 40 matching entries: `timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T18:30:00Z" AND textPayload:"Default STARTUP TCP probe failed"`
- 52 matching entries: `timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T18:30:00Z" AND httpRequest.status>=500 AND textPayload:"instance could not start successfully"`

## Job
- analyze rounds: 1
- cost: $2.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
