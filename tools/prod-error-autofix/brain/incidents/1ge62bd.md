fingerprint: 1ge62bd
service: embedappgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:37:29.324Z
status: infra
attempt: 1

# SEO · embedappgen2 · 1ge62bd

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint e9i6k0 (already recorded infra, no MR): a platform-side container-filesystem fault in avada-seo/us-central1 between 2026-08-14T04:05:08Z and 04:27:57Z made every embedappgen2 cold-start container fail readFileSync with 'EIO: i/o error, read' during module load, so 24 startup TCP probes failed and the 19 in-flight /embed* requests waiting on those cold starts were answered 503.

**Mechanism.** embedAppGen2 is declared onRequest({memory:'1GiB', minInstances: isProduction ? 1 : 0, region:'us-central1'}) at packages/functions/src/handlers/exports/httpFunctions.js:28-36, so with a single warm instance every traffic spike autoscales into a fresh cold start. In the 04:05-04:28Z window those cold starts never reached listen(): the container's own stderr shows three module-load crashes, each ending in `Detailed stack trace: Error: EIO: i/o error, read` from `Object.readFileSync (node:fs:440:20)` / `Object.readSync (node:fs:736:18)` followed by 'Provided module can't be loaded.' and 'Could not load the function, shutting down.' The three crashes died reading three UNRELATED files — /workspace/node_modules/@avada/utils/lib/index.js:50 (04:16:23Z), /workspace/node_modules/cheerio/node_modules/undici/lib/dispatcher/client.js:60 (04:13:15Z) and an ESM getSourceSync path with no app frame at all (04:12:35Z) — which rules out a syntax/import defect in this repo: a bad symbol fails at one deterministic site, an EIO on the read syscall hits whatever file the loader happened to touch. The container therefore never bound :8080 and Cloud Run killed it: 24 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' lines, 21 with 'Connection failed with status DEADLINE_EXCEEDED' and 3 with CANCELLED. Every one of the 19 alerted 503s carries 'The request failed because the instance failed the readiness check' with a latency of 212-253s — the probe deadline window, not a handler running slow (P4: the latency identifies which limit fired). The 2 remaining requests are 500s at 0s latency, matching the single 'The request was aborted because there was no available instance' entry — the same shortage, not a second cause. The fault is not this service and not this deploy: revision embedappgen2-00318-naf was created 2026-08-13T09:10:06Z and served ~19h clean, all 24 probe failures fall inside the single 04:00Z hour with ZERO in the other 47 hours of 2026-08-13/14, and the same 'EIO: i/o error' line fired 20 times across 7 distinct avada-seo services in 03:50-05:00Z (authgen2 8, onupdateshopgen2 3, embedappgen2 3, handleproderroralertgen2 2, changelogtriggers-shops 2, changelogtriggers-shopinfos 1, apigen2 1) on different revisions and different images with unchanged code — the same window already recorded under fingerprints e9i6k0, 1e908f9, 1bpp1pw, mr1olj, 17wg4ve, 15mknix. P3 OOM is ruled out: zero 'Memory limit' lines on this service in 24h. Blast radius is the merchants whose embedded admin page failed to render during the 23 minutes; the app self-healed (8 'STARTUP TCP probe succeeded' in the same hour, clean since).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 export — the service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:31` — minInstances: isProduction ? 1 : 0 — only one warm instance, so any spike autoscales into cold starts that hit the faulty filesystem; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/embed.js:25` — the sole /embed* handler — never entered, because the crash is at module load before app.callback() runs; its known unguarded node-fetch (fp 1wnpppy, MR 2169) is NOT this cause, latency is the 240s probe window not a fetch stall

## Evidence
- 66 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-14T03:53:34.686Z" AND timestamp<="2026-08-14T04:23:34.686Z" AND logName:"stderr"`
- 20 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T03:50:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`
- 24 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 21 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-14T03:53:34.686Z" AND timestamp<="2026-08-14T04:23:34.686Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.23

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
