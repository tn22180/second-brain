fingerprint: znz9xj
service: apisagen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-09-01T17:57:26.698Z
status: infra
attempt: 1

# SEO · apisagen2 · znz9xj

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so apisagen2 cold-start containers exited(1) before binding :8080 — with no instance able to start, Cloud Run answered 20 in-flight requests with `no available instance` and the rest with `instance could not start successfully`.

**Mechanism.** apisagen2 runs revision apisagen2-00346-xoh, created 2026-08-28T10:48:45Z — no deploy in or near the window, so this is not a bad build. From 17:25:27Z to 17:49:37Z the varlog/system stream logs a continuous run of `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` (62 in the 30-min alert window) interleaved with `Container called exit(1)`. The stderr for every one of those exits is the same shape: `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20) / at defaultLoadImpl (node:internal/modules/cjs/loader:1122:17) … / Could not load the function, shutting down.` 14 EIO stacks in the window, on 14 distinct instanceIds, and the failing `require()` is a **different file every time** — googleapis/build/src/apis/index.js:31, :56, :69, :89, :127, googleapis .../analyticsdata, /billingbudgets, /calendar (×2), /drive, /logging, plus @avada/shopify-api/dist/utils/index.js:5 and :10, @shopify/network/build/cjs/index.js:5, @avada/core/build/services/authService.js:88. Random victims across unrelated packages rule out a corrupt file or a repo-side import defect; the fault is the read path under /workspace. Because apiSaGen2 is declared `minInstances: 1, concurrency: 10` (httpFunctions.js:53-58), even the min-instance container was recycled into this loop, so the service had zero serving capacity: 130 request-log failures on 20 different `/apiSa/*` paths (shop-locales 12, optimize-store 12, track-event 13, shops 11, shopify/themes 12, settings 14, …), which is the signature of a runtime with no instance rather than any one handler. The 8 alerted `no available instance` aborts (17:29:49.1Z → 17:32:23.3Z, latency 0s, no instanceId) fall in the sub-window before the first exit(1) at 17:32:57Z, when the containers were still hung inside the stalled readFileSync and the probes were timing out with DEADLINE_EXCEEDED — same fault, earlier phase. The blast radius is project-wide, not this service: the identical `EIO: i/o error, read` appears 76 times across 14 distinct Cloud Run services in avada-seo/us-central1 in 17:00–18:10Z (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, scanspeedscoresubscriberv2gen2 5, savealtversionsubscribergen2 5, bulkauditfixapplygen2 5, proxygen2 4, oncreateusergen2 3, changelogtriggers-shopinfos 2, apigen2 2, retriggeroptimizepublishergen2 1, resumestuckbulkfixjobsgen2 1). Same family already recorded for this app/date under fingerprints 10y5ot5 / 1st9nfu / 1ombwxy / 10gpf63 / 1l9w2m4, and the same platform fault under txdvop, 1gbu5l7, 1esj5e, 1qrdito. The fleet recovered on its own: `[fleetHealth] fleet health false → true (ok:6w)` at 17:46:57.2Z and no further failing request after 17:43:34.3Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:53` — apiSaGen2 — the service whose cold starts died; declaration confirms the alert maps to this export, not a job
- `packages/functions/src/handlers/exports/httpFunctions.js:57` — minInstances: 1 in production — even the warm min-instance container was recycled into the failing-probe loop, so the service had zero serving capacity
- `packages/functions/src/handlers/exports/httpFunctions.js:58` — concurrency: 10 — each killed container took up to 10 in-flight /apiSa/* requests with it, which is why 130 failures spread evenly over 20 unrelated endpoints

## Evidence
- 20 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:20:02Z" AND timestamp<="2026-09-01T17:50:02Z" AND textPayload:"no available instance"`
- 19 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:10:00Z" AND textPayload:"EIO: i/o error"`
- 76 matching entries: `timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:10:00Z" AND textPayload:"EIO: i/o error, read"`
- 192 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:20:02.847Z" AND timestamp<="2026-09-01T17:50:02.847Z" AND severity>=ERROR`
- 130 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:20:02.847Z" AND timestamp<="2026-09-01T17:50:02.847Z" AND httpRequest.status>=500`
- 158 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:10:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`

## Job
- analyze rounds: 1
- cost: $2.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
