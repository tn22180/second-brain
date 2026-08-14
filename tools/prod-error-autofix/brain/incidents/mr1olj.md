fingerprint: mr1olj
service: onupdateshopgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:16:56.965Z
status: infra
attempt: 1

# SEO · onupdateshopgen2 · mr1olj

**Outcome.** infra class — reported, no MR

**Root cause.** Infra: a platform-side container-start fault in avada-seo/us-central1 between 04:01Z and 04:15Z on 2026-08-14 — 105 startup TCP probe failures across 8 unrelated services plus EIO read errors on the /workspace layer of 4 of them — stopped onupdateshopgen2-00318-nug from starting new instances, so 80 Firestore-trigger deliveries were answered 500 'The request failed because the instance could not start successfully'. No defect in this repo.

**Mechanism.** onUpdateShopGen2 is declared onDocumentUpdated({memory: '1GiB', document: 'shops/{shopId}', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/firestoreFunctions.js:13-16); Cloud Run runs it at containerConcurrency 80, maxScale 100, 1 vCPU / 1024Mi, startupProbe {tcpSocket:8080, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}. Traffic was flat and healthy right up to the break: 1408 requests in 03:30-04:00Z, every one HTTP 200, ~45/min (~0.75 rps) — so this is not a load spike and not maxScale saturation. At 04:01:52Z the service starts failing; in the alert window it logs 32 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 ... DEADLINE_EXCEEDED', 26 'instance could not start successfully' and 39 'no available instance', all on one revision, onupdateshopgen2-00318-nug. The one application-level line is not a code fault either: at 04:09:45.273Z the runtime logged "Provided module can't be loaded" / 'Is there a syntax error in your code?' / 'Detailed stack trace: Error: EIO: i/o error, read' with the top frame at Object.readFileSync (node:fs:440:20) -> loadSource -> require of /workspace/node_modules/@shopify/koa-shopify-webhooks/index.js:1:18, then 'Could not load the function, shutting down.' EIO on readFileSync is the container's backing filesystem failing the read, not a parse error — the same EIO/'module can't be loaded' pair fired in the same hour on authgen2 (x4), embedappgen2 (x2) and changelogtriggers-shops (x2), i.e. on different images and different node_modules paths, which no change in this repo can cause. Blast radius is fleet-wide, not service-wide: 'STARTUP TCP probe failed' fired 105 times in 03:40-04:40Z across onupdateshopgen2 (35), authgen2 (32), handleproderroralertgen2 (13), embedappgen2 (12), proxygen2 (8), partnerintegrationsubscribergen2 (2), changelogtriggers-shops (2) and updateshopswithaiusagesubscriptionexpiredtodaygen2 (1). P3 OOM is ruled out: zero 'Memory limit' lines on this service across the full 00:00-12:00Z day, and the 429 'no available instance' answers are the downstream effect of instances not booting, not of queueing. A bad deploy is ruled out: revision -00318-nug was created 2026-08-13T09:10:07Z, ~19h earlier, and served the 1408 clean requests immediately before the window. Recovery is self-healing — successful probes resume at 04:13:26Z and the service is back to mostly 200 by 04:14 (30x200 / 6x500) with the last 500 at 04:15. Same class already recorded as infra under fingerprints 1ufg1uu / pcaoyd / 15d5t6z. Merchant impact: onDocumentUpdated has Firestore-trigger retry semantics only if enabled, so up to 80 shop-doc update events for the affected shops were dropped rather than reprocessed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:13` — onUpdateShopGen2 — the export behind the failing Cloud Run service onupdateshopgen2
- `packages/functions/src/handlers/exports/firestoreFunctions.js:14` — {memory: '1GiB', document: 'shops/{shopId}', ...vpcSettings} — no minInstances, so every scale-out during the stall needed a cold start that never bound :8080; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/exports/firestoreFunctions.js:15` — handler body is a one-line delegation to onUpdateShopHandler — nothing in it runs before the module-load EIO, confirming the failure is pre-application

## Evidence
- 112 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T03:51:25.475Z" AND timestamp<="2026-08-14T04:21:25.475Z" AND severity>=ERROR`
- 105 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:40:00Z" AND timestamp<="2026-08-14T04:40:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 20 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:40:00Z" AND timestamp<="2026-08-14T04:40:00Z" AND (textPayload:"EIO: i/o error" OR textPayload:"Provided module can't be loaded")`
- 1408 matching entries: `resource.labels.service_name="onupdateshopgen2" AND logName:"run.googleapis.com%2Frequests" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<"2026-08-14T04:01:00Z"`
- 80 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-14T03:51:25.475Z" AND timestamp<="2026-08-14T04:21:25.475Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.61

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
