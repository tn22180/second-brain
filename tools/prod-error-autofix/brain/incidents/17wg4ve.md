fingerprint: 17wg4ve
service: partnerintegrationsubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T04:33:55.366Z
status: infra
attempt: 1

# SEO · partnerintegrationsubscribergen2 · 17wg4ve

**Outcome.** infra class — reported, no MR

**Root cause.** Infra: a platform-side container-start fault in avada-seo/us-central1 between 2026-08-14T03:52Z and ~05:30Z made every cold start of partnerintegrationsubscribergen2 (unchanged revision -00316-wur) miss the 240s Cloud Run startup TCP probe, so all 6 Pub/Sub push deliveries on topic partnerIntegration in that window were answered 503 'instance failed the readiness check' before any application code ran.

**Mechanism.** partnerIntegrationSubscriberGen2 is declared {memory:'1GiB', timeoutSeconds:540, topic:'partnerIntegration', ...vpcSettings} with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:318), so a partnerIntegration message with no warm instance pays a full cold start. Its only publisher is dispatchWork('partnerIntegration', {shopifyDomain, integration}) in the App-Proxy audit handler (packages/functions/src/controllers/auditController.js:14). In the alert window each push arrived (userAgent 'APIs-Google', requestUrl __GCP_CloudEventsMode=CUSTOM_PUBSUB_.../topics/partnerIntegration), Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' within ~20ms on the same instanceId, the container never bound :8080, and exactly 240s later Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED'. That 240s matches `gcloud run services describe partnerintegrationsubscribergen2` startupProbe {timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (P4); the 6 request latencies are 241.13/241.26/243.12/243.21/245.12/246.12s — the probe window plus scheduling. Four distinct instanceIds (…8b327e0f, …9233ae8a, …130ac57e, …0fe7c2de, …d4c17c2a) all failed the same way on the same unchanged revision. Not a repo defect: the identical revision cold-started fine 3× earlier the same day (probe 'succeeded after 1 attempt' at 02:21:54, 03:12:54, 03:42:18Z) and those requests returned 200 in 26.8–31.7s. Not P3 OOM: zero 'Memory limit' lines on this service in 24h and no application log at all (the stderr/severity=DEFAULT read is empty because the container died before app code ran — a genuinely empty read here, not the P7 logger artefact). It is fleet-wide, not endpoint-specific: 214 startup-probe failures across 13 avada-seo services (authgen2 60, onupdateshopgen2 55, handleproderroralertgen2 29, embedappgen2 22, proxygen2 18, changelogtriggers-shops 10, extensiongen2 7, apigen2 5, partnerintegrationsubscribergen2 4, +4 more at 1 each) in the same 30-minute window, against 3 in the preceding 3 hours and 0 between 05:30Z and 10:00Z. Same event already recorded as fingerprints 15mknix / 1e908f9 / 1bpp1pw / mr1olj. Impact: the audit-integration message was not processed — the last 2xx on this service that day is 03:41:47Z, so after redelivery attempts stopped at 04:30Z the partnerIntegration payload was dropped; it is a fire-and-forget side effect of the proxy audit, so no merchant-visible request failed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:317` — partnerIntegrationSubscriberGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:318` — {memory:'1GiB', timeoutSeconds:540, topic:'partnerIntegration', ...vpcSettings} — no minInstances, so every partnerIntegration message with no warm instance pays a full cold start; 1GiB with zero OOM lines rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — handleHookSubscriberGen2 declares minInstances: 1 — the lever exists in this same file and is deliberately unset on partnerIntegrationSubscriberGen2
- `packages/functions/src/controllers/auditController.js:14` — dispatchWork('partnerIntegration', {shopifyDomain, integration}) — the only publisher to this topic, so the 503'd pushes originated here; it is not awaited for a merchant response beyond the fire-and-forget dispatch

## Evidence
- 6 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 6 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND httpRequest.status>=500`
- 3 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 214 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:52:32.281Z" AND timestamp<="2026-08-14T04:22:32.281Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T03:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND httpRequest.status<300 AND httpRequest.status>0`

## Job
- analyze rounds: 2
- cost: $2.98

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
