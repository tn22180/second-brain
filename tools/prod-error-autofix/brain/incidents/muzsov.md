fingerprint: muzsov
service: proxygen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:57:13.864Z
status: infra
attempt: 1

# SEO · proxygen2 · muzsov

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 killed proxygen2 cold starts on the startup TCP probe between 2026-08-14T03:58Z and 04:29Z, so 419 in-flight /proxy/* requests were rejected by Cloud Run's front end before any application code ran.

**Mechanism.** proxyGen2 is declared onRequest({memory:'1GiB', timeoutSeconds:120, concurrency:2, ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:100-101), so at concurrency 2 every traffic bump forces a fresh cold start. `gcloud run services describe proxygen2` reports startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}: one missed bind on :8080 kills the instance outright. In the 30-minute alert window 25 cold starts logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' (logName run.googleapis.com%2Fvarlog%2Fsystem, severity ERROR) against only 11 successes — a 69% cold-start failure rate. Those killed instances are exactly the 5xx: 419 requests with httpRequest.status>=500 in the window, split 308 × 500 'The request failed because the instance could not start successfully', 101 × 500 'The request was aborted because there was no available instance' (capacity that could never be created because starts kept dying) and 10 × 503 'the instance failed the readiness check'. Every sampled 500 carries latency `0s` — Cloud Run rejected it at the front end, no Koa handler was entered — which is why the stderr read for the window contains only ordinary [get404PageByUrl] migration chatter and no exception. Code is ruled out three ways. (1) Same revision on both sides: all 25 failures and all 11 successes are revision proxygen2-00317-bos, live since 2026-08-13T09:11:34Z, i.e. ~19h of clean serving before the burst — no deploy landed at 03:58Z. (2) Not P3 OOM: zero 'Memory limit of' lines on proxygen2 across the full 24h of 2026-08-14, and an OOM would not produce a startup-probe DEADLINE_EXCEEDED. (3) Not service-specific: in 03:45–05:30Z the same probe-failure line fired 593 times across 78 distinct avada-seo Cloud Run services (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, embedappgen2 24 …), on unrelated revisions and images with unchanged code. That is the same platform fault already recorded as infra for this date and window under fingerprints e9i6k0/1ge62bd/1l0d0ei (embedappgen2), 1e908f9/mumebf/1her4w8 (authgen2), mr1olj/1bpp1pw/1mk24ih (onupdateshopgen2), 17wg4ve/15mknix (partnerintegrationsubscribergen2) and 1mprni (changelogtriggers-shops); proxygen2 is one more symptom, not a new cause. Blast radius: storefront App Proxy traffic (/proxy/save404, /proxy/updateOvrList, sitemap) 500s for the duration; save404 losses are unrecoverable since the storefront script does not retry.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 export — the service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — {memory:'1GiB', timeoutSeconds:120, concurrency:2, ...vpcSettings} — no minInstances, so at concurrency 2 every scale-up pays a full cold start and is exposed to the probe fault; 1GiB with zero 'Memory limit of' lines that day rules out P3 OOM

## Evidence
- 25 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-14T03:58:30Z" AND timestamp<="2026-08-14T04:28:31Z" AND "Default STARTUP TCP probe failed"`
- 11 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-14T03:58:30Z" AND timestamp<="2026-08-14T04:28:31Z" AND "Default STARTUP TCP probe succeeded"`
- 419 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-14T03:58:30Z" AND timestamp<="2026-08-14T04:28:31Z" AND httpRequest.status>=500`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:45:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND "Default STARTUP TCP probe failed"`
- 200 matching entries: `resource.labels.service_name="proxygen2" AND resource.labels.revision_name="proxygen2-00317-bos" AND timestamp>="2026-08-13T09:00:00Z" AND timestamp<="2026-08-14T03:00:00Z"`

## Job
- analyze rounds: 2
- cost: $2.52

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
