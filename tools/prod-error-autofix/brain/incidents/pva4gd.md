fingerprint: pva4gd
service: changelogtriggers-shops
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T06:18:25.122Z
status: infra
attempt: 1

# SEO · changelogtriggers-shops · pva4gd

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem fault in avada-seo/us-central1 during the 04:0x–04:3xZ hour on 2026-08-14 made readFileSync of files under /workspace/node_modules fail with 'EIO: i/o error, read', so changelogtriggers-shops cold-start containers died at module load, never bound :8080, and Cloud Run answered the queued Firestore-changelog deliveries 503 'instance failed the readiness check' / 500 'no available instance'.

**Mechanism.** The stderr read holds two complete container-start failures on revision changelogtriggers-shops-00261-ret, both with the identical shape: 'Provided module can't be loaded.' → 'Is there a syntax error in your code?' → 'Detailed stack trace: Error: EIO: i/o error, read' → 'at Object.readFileSync (node:fs:440:20)' → 'at loadSource (node:internal/modules/cjs/loader:1808:20)' → 'Could not load the function, shutting down.' The two failures die on DIFFERENT files — 04:12:43.984Z at /workspace/node_modules/@avada/core/build/auth.js:42:36 and 04:13:17.377Z at /workspace/node_modules/koa-router/lib/router.js:9:15 — which rules out a corrupt single artifact or a bad build: the fault is the read itself (EIO is a block-device I/O error from the container's overlay filesystem), not the file's content. The failing frame is node's own CJS loader calling readFileSync on a third-party dependency, before any line of packages/functions/src runs, so no application code is reachable as a cause. Because the process exits before listen(), the startup TCP probe fails: 19 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' entries in the 30-minute window. Every one of the 17 5xx in the window is downstream of that: 13× 503 'instance failed the readiness check' with latencies clustered at 241.09–246.13s (12 of 13; the 13th is 27.13s), each on a distinct instanceId (001548f72991639558d5, 001548f7291a718b1dd8, 001548f7290adf9b9900, 001548f729d9344dc49c, 001548f7295c5e04b1fc, 001548f729c60e0fe6a2, 001548f72928c14aed10, 001548f7290260107cae, 001548f7293968476da1, 001548f729df5609588d, 001548f7291212236ea4, 001548f7297135a1a0b6) — the ~241–246s band is the 240s startup-probe deadline plus scheduling (P4), and 12 distinct instances failing means Cloud Run kept replacing the dead container; plus 4× 500 'no available instance' at 0s latency, which is the queue overflowing while zero instances were healthy. The fault is fleet-wide, not service-specific: the same 'EIO: i/o error' text appears 22 times across 9 different avada-seo/us-central1 services in that one hour — authgen2 (8), onupdateshopgen2 (3), embedappgen2 (3), handleproderroralertgen2 (2), changelogtriggers-shops (2), handleprocessinternallinkreportgen2 (1), extensiongen2 (1), changelogtriggers-shopinfos (1), apigen2 (1) — different images, different revisions, one shared host substrate. Same-day control: the same unchanged revision started successfully 6 times ('STARTUP TCP probe succeeded') outside the fault window. P3 OOM is ruled out — zero 'Memory limit' lines for this service in the full 24h, and the container dies in the loader long before doing work. The service itself is changelogTriggers registered for collectionId 'shops' at packages/functions/src/config/changelog.js:11, declared memory '1GiB' with no minInstances (:9), so every Firestore write burst on the shops collection with no warm instance pays a full cold start and was fully exposed to this fault. No data lost: a 503/500 nacks the Eventarc/Pub/Sub delivery and it is redelivered. Same fault, same service, same hour already recorded as fingerprint 1mprni; sibling services recorded as 8g3u6t, 1470mjt, 1bwfmw9, e9i6k0.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2(...) — the declaration that creates the changelogtriggers-* Cloud Run services, i.e. the service that failed to start
- `packages/functions/src/config/changelog.js:11` — {collectionId: 'shops'} — the collection entry that names this specific service, changelogtriggers-shops
- `packages/functions/src/config/changelog.js:9` — memory: '1GiB' with no minInstances — every delivery with no warm instance pays a full cold start, which is what the EIO fault killed; also the memory figure that, with zero 'Memory limit' lines in 24h, rules out P3
- `packages/functions/src/app.js:20` — export {changelogTriggers} — the only export path for this service; nothing else in src/ participates, and the crash happens in node's CJS loader before any of it is reached

## Evidence
- 2 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T04:06:29.518Z" AND timestamp<="2026-08-14T04:36:29.518Z" AND textPayload:"EIO: i/o error"`
- 2 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T04:06:29.518Z" AND timestamp<="2026-08-14T04:36:29.518Z" AND textPayload:"Could not load the function, shutting down."`
- 19 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T04:06:29.518Z" AND timestamp<="2026-08-14T04:36:29.518Z" AND textPayload:"STARTUP TCP probe failed"`
- 17 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T04:06:29.518Z" AND timestamp<="2026-08-14T04:36:29.518Z" AND httpRequest.status>=500`
- 22 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`
- 6 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.66

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
