fingerprint: 1s70qli
service: resetgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:30:52.516Z
status: infra
attempt: 1

# SEO · resetgen2 · 1s70qli

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25Z prod deploy of avada-seo hit a platform-side container-start fault that swept the whole project — resetGen2's new revision resetgen2-00319-xuq never bound :8080 within Cloud Run's 240s default startup TCP probe, so the UpdateFunction rolled back; identical source redeployed clean at 05:16Z with no code change.

**Mechanism.** resetGen2 is a plain onRequest gen2 function (packages/functions/src/handlers/exports/httpFunctions.js:105, memory '1GiB', default containerConcurrency 80) whose only body is resetHandler imported at :13 — it has no cron, no Pub/Sub trigger, and took zero traffic that day. The alert is a deploy-time event, not a request failure. Timeline on the one instance: 04:25:45.914Z Cloud Run logs /InternalServices.ReplaceInternalService for the new config (audit UpdateFunction by principalEmail tuannv@avadagroup.com, i.e. a hand-run prod deploy); 04:27:43.558262Z 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on revision resetgen2-00319-xuq; 04:31:43.867415Z 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED'. That gap is 240.309s against `gcloud run services describe resetgen2` startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} — the latency identifies exactly which limit fired (P4), and failureThreshold:1 means one miss kills the rollout. Cloud Run then flipped Ready=False on revision then service (code 9), and the Functions v2 API surfaced code 3 'Could not create or update Cloud Run service resetgen2, Container Healthcheck failed'. The container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. Not this repo's defect, on three counts. (1) Not service-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37 …), and 70 UpdateFunction operations failed with severity>=ERROR project-wide in the same 90 minutes — the same window already recorded as infra under fingerprints 1wpcrz3 / 58n8b8 / 5dup6h and ~25 others. (2) Self-healed with no code change: resetgen2-00320-zij probe succeeded after 1 attempt at 05:16:28.042Z, and -00321-sad (05:33:24Z) and -00322-riy (06:52:20Z) likewise. (3) P3 OOM ruled out — zero 'Memory limit' lines and zero httpRequest.status>=500 on this service across the full 24h. Blast radius is nil: a failed gen2 rollout never receives traffic, so the previous revision kept serving; the only cost was a rolled-back deploy that succeeded 45 minutes later.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:105` — resetGen2 = onRequest({memory: '1GiB', ...vpcSettings}, resetHandler) — the service whose rollout failed the startup probe; 1GiB with zero 'Memory limit' lines that day rules out P3
- `packages/functions/src/handlers/exports/httpFunctions.js:13` — import resetHandler from '../reset' — the whole function body; a plain HTTP handler with no cron/Pub/Sub trigger, so a failed rollout drops no queued work

## Evidence
- 1 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="resetgen2" AND timestamp>="2026-08-14T04:21:29Z" AND timestamp<="2026-08-14T04:51:29Z" AND textPayload:"STARTUP TCP probe failed"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 70 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND severity>=ERROR AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 3 matching entries: `resource.labels.service_name="resetgen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T07:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 2
- cost: $2.66

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
