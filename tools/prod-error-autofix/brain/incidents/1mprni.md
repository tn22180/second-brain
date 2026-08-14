fingerprint: 1mprni
service: changelogtriggers-shops
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:52:17.902Z
status: infra
attempt: 1

# SEO · changelogtriggers-shops · 1mprni

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem fault in avada-seo/us-central1 between 04:12Z and 04:31Z on 2026-08-14 made cold-start containers fail readFileSync of /workspace files with 'EIO: i/o error, read', so changelogtriggers-shops instances died before binding :8080 and Cloud Run failed their 240s startup TCP probe.

**Mechanism.** changelogTriggers is a firestore-bigquery-changelog registerV2 export (packages/functions/src/config/changelog.js:8) declared memory '1GiB' with a 'shops' collection trigger (:11), re-exported from packages/functions/src/app.js:20; it has no minInstances, so every Firestore shops write that arrives with no warm instance pays a full cold start. During the fault window the container process failed at module load, twice with a full stack: at 04:12:43.984274Z 'Detailed stack trace: Error: EIO: i/o error, read' with frames Object.readFileSync (node:fs:440:20) → loadSource → Module.load → Object.<anonymous> (/workspace/node_modules/@avada/core/build/auth.js:42:36), and again at 04:13:17.376947Z with the identical EIO signature ending at /workspace/node_modules/koa-router/lib/router.js:9:15, each followed by "Provided module can't be loaded." / 'Is there a syntax error in your code?' / 'Could not load the function, shutting down.'. Two different node_modules files failing the same readFileSync EIO 34s apart rules out a syntax/import defect in this repo — the bytes on the container's read-only layer could not be read. The process therefore never reached listen(), so 18 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' lines fired, and the 12 Eventarc/Pub-Sub POSTs waiting on those cold starts were answered 503 'instance failed the readiness check' at 241.09–246.13s latency — matching Cloud Run's default startupProbe deadline of 240s plus scheduling (P4: the latency identifies which limit fired). The remaining 5 requests are 500 'no available instance' at 0s latency, the same fault seen from the other side: with every cold start dying, the autoscaler had nothing to route to. Not P3 OOM: zero 'Memory limit' lines on this service in the full 12h 00:00–12:00Z, and an OOM would leave no stack at all, whereas here the runtime logged a full EIO trace. Not a deploy regression: the same service logged zero probe failures at any other minute of that 12h — all 19 fall inside 04:12–04:31Z. Not service-specific either: the same 'STARTUP TCP probe failed' line fired 326 times across 17 unrelated avada-seo services in the same 32 minutes (authgen2 81, onupdateshopgen2 68, handleproderroralertgen2 58, proxygen2 26, embedappgen2 23, extensiongen2 18, changelogtriggers-shops 18, apigen2 13, …), and the EIO signature itself appeared 22 times across 9 distinct services on different images and revisions with unchanged code. This is the same platform incident already recorded as infra under fingerprints 1bwfmw9, 1mk24ih, mr1olj, 1bpp1pw (onupdateshopgen2), 1e908f9, mumebf, 1her4w8 (authgen2), e9i6k0, 1ge62bd, 1l0d0ei (embedappgen2) and 17wg4ve, 15mknix (partnerintegrationsubscribergen2) — changelogtriggers-shops is the twelfth service reporting it, not a new cause. Blast radius is bounded: the dropped payloads are BigQuery changelog rows for shops/shopInfos/subscriptions writes, an analytics export, and Eventarc retries the failed deliveries once instances start again at 04:31Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelogTriggers = changelog.registerV2(...) — the export whose Cloud Run service changelogtriggers-shops failed its startup probe
- `packages/functions/src/config/changelog.js:9` — memory: '1GiB' with no minInstances — every shops write with no warm instance pays a full cold start, which is what the filesystem fault killed; the 1GiB with zero 'Memory limit' lines rules out P3 OOM
- `packages/functions/src/config/changelog.js:11` — {collectionId: 'shops'} — names the per-collection service changelogtriggers-shops in the alert, and bounds the loss to BigQuery changelog rows for shop docs
- `packages/functions/src/app.js:20` — export {changelogTriggers} from '@functions/config/changelog' — the only registration path; no code in this repo runs before module load, so the EIO on /workspace/node_modules cannot originate here

## Evidence
- 28 matching entries: `(resource.labels.service_name="changelogtriggers-shops") AND timestamp>="2026-08-14T03:58:14.350Z" AND timestamp<="2026-08-14T04:28:14.350Z" AND logName:"stderr"`
- 19 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T12:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe failed")`
- 17 matching entries: `(resource.labels.service_name="changelogtriggers-shops") AND timestamp>="2026-08-14T03:58:14.350Z" AND timestamp<="2026-08-14T04:28:14.350Z" AND httpRequest.status>=500`
- 326 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:58:00Z" AND timestamp<="2026-08-14T04:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:50:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`

## Job
- analyze rounds: 1
- cost: $1.45

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
