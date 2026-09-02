fingerprint: 13ojanr
service: partnerintegrationsubscribergen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-09-01T17:28:50.658Z
status: infra
attempt: 1

# SEO · partnerintegrationsubscribergen2 · 13ojanr

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault swept avada-seo/us-central1 during 2026-09-01T15:02–17:27Z, and two consecutive cold-start containers of partnerintegrationsubscribergen2 (revision -00350-jed) never bound :8080 within Cloud Run's 240s STARTUP TCP probe deadline, so Cloud Run itself answered the queued Pub/Sub push deliveries with 503/500 before any application code ran.

**Mechanism.** auditController.publishPartnerIntegration dispatches topic 'partnerIntegration' (packages/functions/src/controllers/auditController.js:14); Eventarc/Pub/Sub pushes it as POST /?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects%2Favada-seo%2Ftopics%2FpartnerIntegration to the Cloud Run service backing partnerIntegrationSubscriberGen2 (packages/functions/src/handlers/exports/pubsubFunctions.js:317). No warm instance existed, so Cloud Run started one: 'Starting new instance. Reason: AUTOSCALING' at 17:18:00.831Z (instance 00a41e8c1d1538ff…) and 17:22:11.680Z (instance 00a41e8c1dd29a96…). Both logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' at 17:22:01.945Z and 17:26:12.236Z — exactly 241.1s and 240.6s after their start, i.e. the platform deadline, not handler work. Cloud Run then answered the waiting deliveries itself: 2× 503 'The request failed because the instance failed the readiness check' with latency clamped at 242.121650s and 242.148829s, and 3× 500 at 0s latency (17:16:56.289Z, 17:22:20.662Z, 17:24:01.423Z — the last is the alert). The process died pre-listen, so there is no application log line anywhere in the window (stderr read = 0 entries, and this app's logger is bare console.* so an empty errors read for app code is the expected state — P7). This service's own cold start is normally 9–26s (probe succeeded 9.2s/10.1s/11.3s/20.9s/21.3s/25.5s after start on the same revision earlier the same day, e.g. 17:22:11→ nothing vs 16:05:55→16:06:15 = 19.9s), so a 240s deadline miss is not this image's import graph being slow — it is the container never starting. It is not specific to this function: 76 identical probe failures hit 22 distinct avada-seo Cloud Run services in the 17:00–17:40Z window (changelogtriggers-shops 10, authsagen2 8, handlehooksubscribergen2 7, bulkauditfixapplygen2 7, embedappgen2 6, savealtversionsubscribergen2 5, proxygen2 3, partnerintegrationsubscribergen2 2 …), which matches the already-recorded fingerprints 18882z / 1esj5e / 1qrdito / 1v639fk / 1mccpq for the same day and region.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:317` — partnerIntegrationSubscriberGen2 — the only definition of the alerting function; memory '1GiB', timeoutSeconds 540, topic 'partnerIntegration' at :318. No line in it executed: the container never bound :8080.
- `packages/functions/src/controllers/auditController.js:14` — dispatchWork('partnerIntegration', {shopifyDomain, integration}) — the only producer of the messages whose push delivery Cloud Run rejected; falls back to Pub/Sub (GCF) which is the path that failed.

## Evidence
- 2 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-09-01T17:02:48Z" AND timestamp<="2026-09-01T17:32:48Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-09-01T17:02:48Z" AND timestamp<="2026-09-01T17:32:48Z" AND httpRequest.status>=500`
- 76 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:40:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.labels.service_name="partnerintegrationsubscribergen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.52

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
