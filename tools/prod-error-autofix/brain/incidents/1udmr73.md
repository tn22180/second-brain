fingerprint: 1udmr73
service: apiv2gen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:09:21.483Z
status: infra
attempt: 1

# SEO · apiv2gen2 · 1udmr73

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25Z prod deploy of avada-seo created revision apiv2gen2-00325-pac, whose cold-start container never bound :8080 and was killed when Cloud Run's default 240s startup TCP probe hit DEADLINE_EXCEEDED — one of 593 identical startup-probe failures across 78 distinct avada-seo services in the same 90 minutes, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** apiV2Gen2 is declared onRequest({timeoutSeconds: 60, memory: '1GiB', ...vpcSettings}) with the Default startupProbeType (packages/functions/src/handlers/exports/httpFunctions.js:64-65). At 2026-08-14T04:27:25.949355Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on instance 001548f729eddd6f… for revision apiv2gen2-00325-pac; the container never reached listen(), and at 04:31:26.334469Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.4s after the instance-start line, matching the Default startup probe's 240s deadline (P4: the latency identifies which limit fired). Two audit lines follow at 04:31:29.501472Z and 04:31:29.612658Z ('Ready condition status changed to False' for revision apiv2gen2-00325-pac and service apiv2gen2), and at 04:31:31.562047402Z the deploy itself failed: google.cloud.functions.v2.FunctionService.UpdateFunction returned status code 3, 'Could not create or update Cloud Run service apiv2gen2, Container Healthcheck failed'. The container emitted zero stdout/stderr in 04:27–04:35Z, so it died before any application module logged — that rules out a module-load ReferenceError (which this repo has produced before, e.g. devController's missing imports) since such a throw prints to stderr. P3 OOM is ruled out: zero 'Memory limit' lines on this service, and the 1GiB limit was unchanged from the revisions before and after. The fault is not service-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 ×79, handleproderroralertgen2 ×61, apigen2 ×47, proxygen2 ×27, …), on different revisions and different images — the same platform window already recorded as infra under fingerprints e9i6k0 / 1e908f9 / 5dup6h and ~50 siblings. It self-healed: apiv2gen2-00326-xap at 05:16:34.768296Z and -00327-vox at 05:33:25.989255Z both logged 'Default STARTUP TCP probe succeeded after 1 attempt', and apiv2gen2-00328-xuq now serves 100% of traffic. Blast radius is zero user-facing: the failed revision never took traffic (the prior revision kept serving) and apiv2gen2 logged no HTTP 5xx at all in 2026-08-14T00:00–12:00Z. Cost is one failed function in that CI deploy, which the next deploy shipped.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:64` — apiV2Gen2 export — the service whose cold-start container failed the startup TCP probe
- `packages/functions/src/handlers/exports/httpFunctions.js:65` — {timeoutSeconds: 60, memory: '1GiB', ...vpcSettings} — 1GiB matches the failed and the two later-successful revisions, and zero 'Memory limit' lines rule out P3 OOM; no startup-probe override, so the platform Default 240s probe applies

## Evidence
- 4 matching entries: `(resource.labels.service_name="apiv2gen2" OR resource.labels.function_name="apiv2gen2" OR resource.labels.job_name="apiv2gen2") AND timestamp>="2026-08-14T04:26:07.116Z" AND timestamp<="2026-08-14T04:56:07.116Z" AND severity>=ERROR`
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="apiv2gen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 18 matching entries: `resource.labels.service_name="apiv2gen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`

## Job
- analyze rounds: 2
- cost: $2.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
