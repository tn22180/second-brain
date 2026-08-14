fingerprint: 1t6fr9s
service: changelogtriggers-shopinfos
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T07:25:12.774Z
status: infra
attempt: 1

# SEO · changelogtriggers-shopinfos · 1t6fr9s

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour of 2026-08-14 made changelogtriggers-shopinfos cold starts fail — one instance recorded the mechanism verbatim as `EIO: i/o error, read` while `readFileSync` loaded a JSON file out of /workspace/node_modules, so the process died before binding :8080 and Cloud Run's 240s startup TCP probe killed 11 instances.

**Mechanism.** changelogTriggers registers a Firestore document-written trigger per collection (packages/functions/src/config/changelog.js:8-14), so every write to `shopInfos` is delivered as a Pub/Sub-bound CloudEvent POST to changelogtriggers-shopinfos. The service runs with no minInstances (gcloud run services describe: annotations carry only maxScale=100 and startup-cpu-boost, no minScale), so bursts of shopInfos writes force fresh cold starts. Between 04:21:40Z and 04:39:38Z, 11 distinct instances (…ad49, …197d, …0653, …8d5f, …aaf1, …85fe, …e79a, …1dec, …73cc, …f574, …c746) across revisions -00256-laq and -00257-zod never reached listen(). Nine of them logged nothing at all and were killed by `Default STARTUP TCP probe failed ... Connection failed with status DEADLINE_EXCEEDED`; the 8 requests waiting on them were answered 503 'instance failed the readiness check' at latencies 241.15s / 241.15s / 241.17s / 243.22s / 244.13s / 241.15s / 250.10s / 194.11s — the first six match the service's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} to within a second (P4: the latency identifies which limit fired), and 2 further POSTs got 500 'instance could not start successfully'. One instance, 001548f729ad49 on revision -00256-laq, did emit before dying, at 04:26:12.104Z: `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read` with the frames `at Object.readFileSync (node:fs:440:20) → defaultLoadImpl → loadSource → Object..json → /workspace/node_modules/har-validator/lib/schemas/index.js:13:16 → har-validator/lib/runner.js:3:15 → Could not load the function, shutting down.` That is a read failure on the container's own image filesystem inside node_modules — a bundled dependency of `request`/`request-promise` that has not changed and is not touched by this repo's src/. No app code frame appears anywhere in the trace. The fault is not specific to this service: in the same 04:00–05:00Z hour the same `STARTUP TCP probe failed` line fired 593 times across 78 distinct avada-seo services on unrelated revisions and images, and the same `EIO: i/o error` signature appears 22 times across 9 services (authgen2 ×8, onupdateshopgen2 ×3, embedappgen2 ×3, handleproderroralertgen2 ×2, changelogtriggers-shops ×2, plus apigen2, extensiongen2, handleprocessinternallinkreportgen2, changelogtriggers-shopinfos). Scoped to this service the fault is confined to that hour: 11 probe failures in the full 24h, all inside it, against 10 successful cold starts. P3 OOM is excluded — the container is declared 1024Mi (memory: '1GiB' at changelog.js:9) and the process died during module load, before any app allocation, and the failing instances produced no memory-limit line. Blast radius is bounded: the Firestore-trigger deliveries that got 500/503 are retried by Eventarc, and changelog rows are a BigQuery mirror of `shopInfos`, so nothing merchant-facing failed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelogTriggers = changelog.registerV2({memory: '1GiB', ...}) — declares the failing service; 1GiB matches the 1024Mi limit on the Cloud Run revision, and no minInstances is set, so every shopInfos write burst pays a cold start
- `packages/functions/src/config/changelog.js:12` — {collectionId: 'shopInfos'} — the registration that produces the changelogtriggers-shopinfos service named in the alert; it is a 6-line declarative config with no request-path code, so no src/ line can be the cause

## Evidence
- 1 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:16:27Z" AND timestamp<="2026-08-14T04:46:27Z" AND textPayload:"EIO: i/o error"`
- 11 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 10 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`
- 11 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:16:27Z" AND timestamp<="2026-08-14T04:46:27Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $2.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
