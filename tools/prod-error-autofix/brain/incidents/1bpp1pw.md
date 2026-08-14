fingerprint: 1bpp1pw
service: onupdateshopgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T04:19:49.879Z
status: infra
attempt: 1

# SEO · onupdateshopgen2 · 1bpp1pw

**Outcome.** infra class — reported, no MR

**Root cause.** A platform-side container-filesystem fault in avada-seo/us-central1 between 04:01Z and 04:16Z on 2026-08-14 made Node's readFileSync of files under /workspace/node_modules fail with EIO, so every onupdateshopgen2 cold start died at module load, never bound :8080, and Cloud Run 5xx'd the Firestore-trigger deliveries waiting on it.

**Mechanism.** onUpdateShopGen2 is an onDocumentUpdated('shops/{shopId}') trigger declared at packages/functions/src/handlers/exports/firestoreFunctions.js:13 with memory '1GiB' and no minInstances, so each burst of shop-doc writes needs a cold start. At 2026-08-14T04:09:45.273Z the booting container logged "Provided module can't be loaded." → "Detailed stack trace: Error: EIO: i/o error, read" → "at Object.readFileSync (node:fs:440:20)" → "at Object.<anonymous> (/workspace/node_modules/@shopify/koa-shopify-webhooks/index.js:1:18)" → "Could not load the function, shutting down." The failure is an I/O error reading the deployed bundle's own node_modules, not MODULE_NOT_FOUND and not a syntax error: @shopify/koa-shopify-webhooks@5.1.1 is a resolved dependency (yarn.lock:9889) and the running revision onupdateshopgen2-00318-nug (image sha256:73785fbc…) was created 2026-08-13T09:10:07Z — 19h earlier — and served normally before and after. With the process dead, the default startup TCP probe on :8080 never succeeded and Cloud Run emitted 39 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' lines; `gcloud run services describe` gives startupProbe {tcpSocket:8080, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}, and the alerted request's latency is 242.109079s (max in window 244.192504s), i.e. that 240s probe window plus scheduling — P4. The 104 5xx split 89×500 'instance could not start successfully' + 15×503 'instance failed the readiness check' (the alert text), plus 43 'no available instance' — all secondary to the dead starts, not distinct bugs. It is not app-scoped: in the same 30-minute window 9 distinct Cloud Run services in avada-seo (onupdateshopgen2, authgen2, handleproderroralertgen2, embedappgen2, proxygen2, changelogtriggers-shops, partnerintegrationsubscribergen2, updateshopswithaiusagesubscriptionexpiredtodaygen2, extensiongen2) logged the same probe failures, and 4 of them logged the same EIO — all 12 EIO lines in the 00:00–08:00Z sweep fall in 04:09:45–04:16:23Z and there are none outside it. Onupdateshopgen2's entire 24h 5xx count, 112, sits in hour 04, and probes started succeeding again at 04:13–04:14Z. Duplicate of already-recorded fingerprint mr1olj (same service, same window, infra, no MR); this read adds the EIO evidence that names the fault. No data lost: a 5xx nacks the Eventarc/Pub/Sub delivery and it redelivers.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:13` — onUpdateShopGen2 export — the service whose cold starts failed
- `packages/functions/src/handlers/exports/firestoreFunctions.js:14` — {memory: '1GiB', document: 'shops/{shopId}', ...vpcSettings} — no minInstances, so every shop-doc write burst with no warm instance pays a full cold start and was exposed to the fault
- `packages/functions/src/handlers/onUpdateShop.js:11` — the handler body — never entered; the process died during module load, so no application log exists from it
- `yarn.lock:9889` — @shopify/koa-shopify-webhooks@npm:5.1.1 is a resolved dependency, so the EIO on its index.js is an I/O fault reading a present file, not a missing module

## Evidence
- 12 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T08:00:00Z" AND textPayload:"EIO: i/o error"`
- 142 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:55:00Z" AND timestamp<="2026-08-14T04:25:00Z" AND (textPayload:"STARTUP TCP probe failed" OR textPayload:"EIO: i/o error")`
- 112 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND httpRequest.status>=500`
- 12 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 28 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:51:25.483Z" AND timestamp<="2026-08-14T04:21:25.483Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
