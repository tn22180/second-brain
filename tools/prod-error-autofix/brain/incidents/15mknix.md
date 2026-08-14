fingerprint: 15mknix
service: partnerintegrationsubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:28:38.018Z
status: infra
attempt: 1

# SEO · partnerintegrationsubscribergen2 · 15mknix

**Outcome.** infra class — reported, no MR

**Root cause.** Infra: a platform-side container-start fault in avada-seo/us-central1 between 04:01Z and 04:26Z on 2026-08-14 made cold-start containers never bind :8080, so the five Pub/Sub push deliveries of the partnerIntegration topic that arrived in that window each waited out Cloud Run's 240s startup TCP probe and were answered 503 — not a defect in partnerIntegrationSubscriberGen2's code.

**Mechanism.** partnerIntegrationSubscriberGen2 is declared onMessagePublished({memory: '1GiB', timeoutSeconds: 540, topic: 'partnerIntegration', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:317-320), so every message on a low-traffic topic (9 pushes in the whole of 2026-08-14) arrives at zero warm instances and pays a full cold start. Four of those cold starts succeeded earlier the same day (02:21, 03:12, 03:25, 03:41 → HTTP 200, latencies 0.48s / 26.76s / 31.73s / 31.55s) on the same revision partnerintegrationsubscribergen2-00316-wur and the same base image nodejs22_20260726 — unchanged code. Starting 04:03:21.195296Z the next five pushes (userAgent 'APIs-Google', Pub/Sub push from 66.102.6.x / 64.233.172.136 / 74.125.212.131) all returned 503 'The request failed because the instance failed the readiness check', with latencies 245.12s, 243.12s, 241.26s, 246.12s, 243.21s. Each is paired with a distinct instanceId logging 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' — and `gcloud run services describe` gives startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}, so the ~241-246s latencies are that 240s probe window plus scheduling, identifying exactly which limit fired (P4). P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h, and stderr for the window is empty (0 entries) — the container died before module load produced any application log, consistent with a process killed pre-listen rather than a handler fault. The fault is not service-specific: in 03:45–04:30Z the same probe-failure line fired 279 times across 17 distinct avada-seo services (authgen2 73, onupdateshopgen2 62, handleproderroralertgen2 41, proxygen2 24, embedappgen2 23, changelogtriggers-shops 18, extensiongen2 12, apigen2 9, partnerintegrationsubscribergen2 5, …), on different revisions and different images, and the hourly profile for the day is 2 (01h) / 1 (02h) / 2 (03h) / 281 (04h) — a step change with no deploy behind it. Same window already recorded as infra under fingerprints 1e908f9, 1bpp1pw and mr1olj. Blast radius is small and bounded by what the topic carries: dispatchWork('partnerIntegration', {shopifyDomain, integration}) at packages/functions/src/controllers/auditController.js:14 only feeds integration-user bookkeeping (subscribePartnerIntegration.js:28-50 creates/upgrades a doc in integrationUsers), so the worst case is one merchant's integration-user record left at type 'guest' — no merchant-facing SEO data lost. Note the retries stopped after 04:20:10 with no later attempt and no 2xx that day, so that one message was dropped rather than eventually delivered.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:317` — partnerIntegrationSubscriberGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:318` — {memory: '1GiB', timeoutSeconds: 540, topic: 'partnerIntegration'} — no minInstances, so every push on this 9-msg/day topic pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/pubsub/subscribePartnerIntegration.js:18` — the handler that never ran — the container was killed before module load, so none of its code is on the failure path
- `packages/functions/src/controllers/auditController.js:14` — the only publisher, dispatchWork('partnerIntegration', {shopifyDomain, integration}) — bounds blast radius to integration-user bookkeeping
- `packages/functions/src/handlers/pubsub/subscribePartnerIntegration.js:28` — saveIntegrationUser only creates/upgrades an integrationUsers doc, so a lost message costs one 'guest'-typed record, not merchant SEO data

## Evidence
- 8 matching entries: `(resource.labels.service_name="partnerintegrationsubscribergen2") AND timestamp>="2026-08-14T03:52:31.794Z" AND timestamp<="2026-08-14T04:22:31.794Z" AND severity>=ERROR`
- 279 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:45:00Z" AND timestamp<="2026-08-14T04:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 286 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T08:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 8 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 9 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND httpRequest.requestMethod="POST"`

## Job
- analyze rounds: 1
- cost: $1.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
