fingerprint: 1mk24ih
service: onupdateshopgen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-14T04:41:03.109Z
status: infra
attempt: 1

# SEO · onupdateshopgen2 · 1mk24ih

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprints mr1olj and 1bpp1pw (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 on 2026-08-14 ~04:01Z–04:16Z stopped onupdateshopgen2 cold starts from binding :8080, and the 43 'no available instance' 500s in this window are the queue-side symptom of those dead starts, not a distinct bug.

**Mechanism.** onUpdateShopGen2 is an onDocumentUpdated('shops/{shopId}') trigger declared at packages/functions/src/handlers/exports/firestoreFunctions.js:13-16 with {memory:'1GiB', ...vpcSettings} and no minInstances, so every scale-out during a shop-doc write burst needs a cold start. In the alert window those cold starts failed: 59 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' lines on this service, and at 04:09:45.273Z the booting container logged the module-load death 'Provided module can't be loaded' -> 'Error: EIO: i/o error, read' -> 'at Object.readFileSync (node:fs:440:20)' -> require of /workspace/node_modules/@shopify/koa-shopify-webhooks/index.js:1:18 -> 'Could not load the function, shutting down.' EIO on readFileSync of a resolved dependency (yarn.lock:9889) is the container's backing filesystem failing the read, not a code or dependency defect — the handler body at packages/functions/src/handlers/onUpdateShop.js:11 is never entered, so no application log exists. With no container able to bind :8080, Cloud Run answered the queued Eventarc deliveries three ways in the same window: 78x500 'instance could not start successfully', 43x500 'no available instance' (this alert's text), 36x503 'instance failed the readiness check' — 158 5xx total, three fingerprints, one cause. It is fleet-wide, not repo-scoped: in this exact 30-minute window 'STARTUP TCP probe failed' fired 246 times across 13 distinct avada-seo services (authgen2 66, onupdateshopgen2 59, handleproderroralertgen2 32, proxygen2 23, embedappgen2 23, changelogtriggers-shops 17, extensiongen2 9, apigen2 7, partnerintegrationsubscribergen2 4, optimizestoresubscribergen2 2, bulkauditfixdispatchgen2 2, updateshopswithaiusagesubscriptionexpiredtodaygen2 1, optimizesubscriberv2gen2 1), and the 12 EIO lines land on 4 different images/node_modules paths (authgen2 x5, embedappgen2 x3, onupdateshopgen2 x2, changelogtriggers-shops x2), all inside 04:09:45-04:16:23Z. No change in this repo can cause EIO on four unrelated images. P3 OOM is ruled out (zero 'Memory limit' lines on this service). A bad deploy is ruled out — revision onupdateshopgen2-00318-nug was created 2026-08-13T09:10:07Z, ~19h earlier, and served 1408 consecutive HTTP 200s in 03:30-04:01Z. Self-healed by 04:16Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:13` — onUpdateShopGen2 export — the function behind the failing Cloud Run service onupdateshopgen2
- `packages/functions/src/handlers/exports/firestoreFunctions.js:14` — {memory:'1GiB', document:'shops/{shopId}', ...vpcSettings} — no minInstances, so every scale-out during the stall needed a cold start that never bound :8080; 1GiB with zero 'Memory limit' lines rules out P3 OOM
- `packages/functions/src/handlers/exports/firestoreFunctions.js:15` — handler body is a one-line delegation to onUpdateShopHandler — nothing in it runs before the module-load EIO, confirming the failure is pre-application
- `packages/functions/src/handlers/onUpdateShop.js:11` — the handler that never executed — no application log line exists from it anywhere in the window

## Evidence
- 158 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T03:54:15.447Z" AND timestamp<="2026-08-14T04:24:15.447Z" AND httpRequest.status>=500`
- 43 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T03:54:15.447Z" AND timestamp<="2026-08-14T04:24:15.447Z" AND textPayload:"no available instance"`
- 246 matching entries: `timestamp>="2026-08-14T03:54:15Z" AND timestamp<="2026-08-14T04:24:15Z" AND textPayload:"STARTUP TCP probe failed"`
- 12 matching entries: `timestamp>="2026-08-14T03:54:15Z" AND timestamp<="2026-08-14T04:24:15Z" AND textPayload:"EIO: i/o error"`
- 28 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:54:15.447Z" AND timestamp<="2026-08-14T04:24:15.447Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
