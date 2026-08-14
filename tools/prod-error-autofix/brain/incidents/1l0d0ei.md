fingerprint: 1l0d0ei
service: embedappgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T04:42:35.666Z
status: infra
attempt: 1

# SEO · embedappgen2 · 1l0d0ei

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint e9i6k0 / 1ge62bd (already recorded infra, no MR): a platform-side container-filesystem fault in avada-seo/us-central1 on 2026-08-14 made Node's readFileSync of files under /workspace fail with `EIO: i/o error, read`, so every embedappgen2 container start on revision embedappgen2-00318-naf died at module load and Cloud Run had no instance to serve the alerted /embed* requests.

**Mechanism.** All 21 5xx in the window are on one revision, embedappgen2-00318-naf. Three container starts (04:12:35.407Z, 04:13:15.367Z, 04:16:23.521Z) each logged `Provided module can't be loaded.` → `Detailed stack trace: Error: EIO: i/o error, read` → `Could not load the function, shutting down.`, with the read frame `at Object.readFileSync (node:fs:440:20)` / `at Object.readSync (node:fs:736:18)`. The module that fails is different every time — /workspace/node_modules/@avada/utils/lib/index.js:50:23, /workspace/node_modules/cheerio/node_modules/undici/lib/dispatcher/client.js:60:19, and an ESM getSourceSync path — so the failure is the read of the bundled file, not any module's code. The process never bound :8080, so Cloud Run logged 23× `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` and answered the queued traffic: 19× 503 `The request failed because the instance failed the readiness check.` with latencies clustered at 212–253s (the startup-probe budget) and 2× 500 at 0s latency, one of which carries `The request was aborted because there was no available instance.`. No application log line exists for any of them — the Koa app mounted at packages/functions/src/handlers/exports/httpFunctions.js:29 was never entered. Not app-specific: the same `EIO: i/o error, read` appears 21 times across 8 distinct services in avada-seo/us-central1 in the same 12h window (authgen2 8, embedappgen2 3, onupdateshopgen2 3, changelogtriggers-shops 2, handleproderroralertgen2 2, apigen2 1, changelogtriggers-shopinfos 1, extensiongen2 1). embedAppGen2 already runs minInstances: 1 in production (httpFunctions.js:32) and that warm instance could not start either, so there is no app-side lever here. Infra class — no code change.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:29` — embedAppGen2 = onRequest(...) — the alerted service; its handler was never reached, the container died during module load
- `packages/functions/src/handlers/exports/httpFunctions.js:32` — minInstances: appConfig.isProduction ? 1 : 0 — the warm prod instance also failed to start, so raising capacity is not the fix

## Evidence
- 3 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:35Z" AND textPayload:"EIO: i/o error"`
- 3 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:35Z" AND textPayload:"Could not load the function, shutting down"`
- 23 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:35Z" AND textPayload:"STARTUP TCP probe failed"`
- 21 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:35Z" AND httpRequest.status>=500`
- 21 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T12:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.21

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
