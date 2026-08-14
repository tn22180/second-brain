fingerprint: q19goa
service: changelogtriggers-subscriptions
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T07:38:29.728Z
status: infra
attempt: 1

# SEO · changelogtriggers-subscriptions · q19goa

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 (already recorded under 1t6fr9s / pva4gd / 1mprni / 1r74ll6 / muzsov / 1e908f9 and others) made changelogtriggers-subscriptions cold starts fail Cloud Run's 240s startup TCP probe, so the 7 Firestore-changelog Pub/Sub deliveries waiting on those cold starts were answered 503 'instance failed the readiness check' (5×) and 500 'instance could not start successfully' (2×).

**Mechanism.** All 7 failed requests are POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING — the Eventarc/Pub/Sub push entry point of the firestore-bigquery-changelog trigger registered at packages/functions/src/config/changelog.js:8 for collection `subscriptions` (:13), declared memory '1GiB' (:9) with no minInstances, so every changelog burst at zero warm instances pays a full cold start. The 5 503s carry latency 241.13s, 242.11s, 247.11s, 258.05s and 241.13s — the 240s default startup-probe deadline plus scheduling (P4: the latency identifies which limit fired); the 2 500s are 0s ('no instance available to start'). 6 of the 13 error entries are 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' across 6 distinct instanceIds and TWO revisions of unchanged code (00256-sen and 00257-tov), which rules out a code regression in a single build. Not this service's code at all: fleet-wide the identical probe-failure line fired 578 times across 78 avada-seo Cloud Run services in the 04:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, changelogtriggers-shops 19, changelogtriggers-shopinfos 11, changelogtriggers-subscriptions 6, …) against just 2 entries in the whole preceding 03:00Z hour — a bounded platform window, not 78 simultaneous app bugs. P3 OOM ruled out: zero 'Memory limit' lines on this service in 24h, and stderr for the window is 0 entries because the container dies before module load (P7 also applies — this app's logger is bare console.*, so an empty errors read for app code is expected here anyway). The image boots fine: the same service logged 12 'STARTUP TCP probe succeeded' the same day. Blast radius: 7 Firestore→BigQuery changelog events for the `subscriptions` collection were delayed ~11 minutes; the handler was never entered so no partial writes, and Pub/Sub/Eventarc retries the delivery.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2(...) — the export that creates the changelogtriggers-* Cloud Run services whose cold starts failed the startup probe
- `packages/functions/src/config/changelog.js:9` — memory: '1GiB' — the only resource declaration; no minInstances, so each changelog burst pays a full cold start. 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/config/changelog.js:13` — {collectionId: 'subscriptions'} — the collection whose trigger is this exact service; identifies the 7 failed CE_PUBSUB_BINDING POSTs as subscription changelog deliveries

## Evidence
- 7 matching entries: `(resource.labels.service_name="changelogtriggers-subscriptions") AND timestamp>="2026-08-14T04:16:38.343Z" AND timestamp<="2026-08-14T04:46:38.343Z" AND httpRequest.status>=500`
- 13 matching entries: `(resource.labels.service_name="changelogtriggers-subscriptions") AND timestamp>="2026-08-14T04:16:38.343Z" AND timestamp<="2026-08-14T04:46:38.343Z" AND severity>=ERROR`
- 578 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 12 matching entries: `resource.labels.service_name="changelogtriggers-subscriptions" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.33

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
