fingerprint: 1bazm02
service: changelogtriggers-shops
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T15:16:00.548Z
status: infra
attempt: 1

# IMG-OPT · changelogtriggers-shops · 1bazm02

**Outcome.** infra class — reported, no MR

**Root cause.** changelogTriggers-{shops,shopInfos,subscriptions} are the only Cloud Run services in app-plaza-image-optimizer left at the firebase-functions v2 default 256Mi/1CPU, and at that size a cold start of this repo's single full-app index.js import graph exceeds the service's 240s startup TCP probe, so the instance is never started and Eventarc gets a 503.

**Mechanism.** packages/functions/src/config/changelog.js:8 calls changelog.registerV2({collections:[shops,shopInfos,subscriptions]}) with no memory/cpu option; that value is re-exported unchanged at packages/functions/src/index.js:278, the only export in index.js carrying no memory option (compare packages/functions/src/index.js:65, memory '2GiB'). gcloud run services list confirms changelogtriggers-{shops,shopinfos,subscriptions}=256Mi while every other service in the project is >=512Mi, and changelogtriggers-shops' startupProbe is tcpSocket:8080 with timeoutSeconds=240, periodSeconds=240, failureThreshold=1. Every container in this repo loads the same index.js graph (51 top-level imports, sharp/puppeteer/shopify chains). During the 14:52-15:00Z Firestore write burst on `shops`, cold starts at 256Mi took 47.14s / 61.08s / 100.91s and still answered HTTP 200, while three instances blew past the 240s probe deadline: POSTs at 14:52:48.207849Z / 14:52:51.988978Z / 14:52:52.366145Z returned 503 'The request failed because the instance failed the readiness check' with latencies 242.121076s / 242.155639s / 242.227693s — the 240s probe timeout plus routing overhead — and Cloud Run logged 4 'Default STARTUP TCP probe failed ... DEADLINE_EXCEEDED' entries at 14:58:15.164209Z, 14:58:15.164216Z, 14:58:15.662262Z, 14:59:39.874659Z. Same cause and same window as recorded fingerprint 1ocard1 on the sibling service changelogtriggers-subscriptions. No OOM: this is slow module load under a tight heap, not a memory-limit kill — the container never binds :8080 at all.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2({collections:[...]}) called with no memory/cpu option — the three changelogTriggers services therefore deploy at the gen2 default 256Mi/1CPU
- `packages/functions/src/index.js:278` — `export {changelogTriggers};` — the only export in index.js with no memory option attached
- `packages/functions/src/index.js:65` — representative sibling export (exports.apiv2, memory '2GiB') — every other function passes an explicit memory
- `packages/functions/src/index.js:53` — import of changelogTriggers into the shared index.js module graph that every gen2 container in this repo loads on cold start

## Evidence
- 7 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-09-01T14:43:00Z" AND timestamp<="2026-09-01T15:15:00Z" AND severity>=ERROR`
- 19 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="changelogtriggers-shops" AND httpRequest.requestMethod="POST" AND timestamp>="2026-09-01T14:40:00Z" AND timestamp<="2026-09-01T15:15:00Z"`
- 4 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="changelogtriggers-shops" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T14:43:00Z" AND timestamp<="2026-09-01T15:15:00Z"`

## Job
- analyze rounds: 2
- cost: $1.81

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
