fingerprint: 1ve3ntt
service: ollamaquotaalertgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-22T03:28:23.418Z
status: infra
attempt: 1

# SEO · ollamaquotaalertgen2 · 1ve3ntt

**Outcome.** infra class — reported, no MR

**Root cause.** The alerted STARTUP TCP probe failure on ollamaquotaalertgen2-00001-tiw is the downstream symptom of an OOM kill 0.36ms earlier — the first-ever deploy of ollamaQuotaAlertGen2 shipped memory 256MiB while its cold-start import graph resident-sets at 266 MiB, so the container was killed before it could bind PORT=8080 and the whole CreateFunction deploy failed.

**Mechanism.** packages/functions/src/handlers/exports/cronFunctions.js:29-31 declares ollamaQuotaAlertGen2 = onSchedule({timeoutSeconds: 60, memory, schedule: '*/15 * * * *'}, ollamaQuotaAlert). The deployed revision spec in the audit log carries resources.limits.memory '256Mi', containerConcurrency 80, startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, failureThreshold:1}. Loading the function target pulls handlers/cron/ollamaQuotaAlert.js:12 → services/ollama/quotaAlert.js:2 → services/ollama/index.js, which at import time loads zodv4 (index.js:2) and helpers/openAI/metaData with cheerio (index.js:6). That graph is resident before the target is registered, so the Node process exceeded 256 MiB during module load. GCP log order proves the chain to the millisecond: 09:29:31.013352Z 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT'; 09:29:51.821092Z ERROR 'Memory limit of 256 MiB exceeded with 266 MiB used'; 09:29:51.821449Z ERROR — the alerted line — 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status CANCELLED.' The status is CANCELLED, not DEADLINE_EXCEEDED, and the gap to the probe line is 357µs, so the probe did not time out on its 240s budget — it was cancelled because the container had already died. 09:29:52.476581Z the Cloud Run system_event flips Ready=False with reason HealthCheckContainerError, and 09:29:57.606565589Z the cloudfunctions.v2 CreateFunction audit log (principal tuannv@avadagroup.com) fails with code 3 'Container Healthcheck failed. Revision ollamaquotaalertgen2-00001-tiw is not ready and cannot serve traffic'. No application log line exists for this instance (stderr read = 0 entries), which is what an OOM before listen() looks like (P3). This is infra class: the cap is the defect, not the code. It is also NOT yet resolved — the cap was raised to 512MiB (cronFunctions.js:30, commit 3ab8e29892) and the service still dies: 'Memory limit of 512 MiB exceeded' with 520-540 MiB used at 2026-08-22T01:30:29Z, 01:45:28Z and 03:01:07Z, i.e. the */15 cron has still never executed in prod. Suggested tier is 1GiB, matching resumeStuckBulkFixJobsGen2 (cronFunctions.js:94-95), which runs the same */15 schedule over a superset of this import graph. Same underlying condition already recorded as fingerprint 1mk9y60 (infra, no MR) — this alert is the probe-failure line of the same 09:29:51Z event, so it is one cause, not a second.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:29` — ollamaQuotaAlertGen2 onSchedule export — the service whose cold start was OOM-killed before binding :8080
- `packages/functions/src/handlers/exports/cronFunctions.js:30` — memory: '512MiB' today, '256MiB' at the alerted deploy — the cap the 266 MiB (then 520-540 MiB) cold start exceeds
- `packages/functions/src/handlers/cron/ollamaQuotaAlert.js:12` — handler body calling checkOllamaQuotaAndAlert — never reached; produces zero stdout/stderr entries in prod
- `packages/functions/src/services/ollama/quotaAlert.js:2` — imports services/ollama, dragging the whole AI module graph into the cold-start RSS just to read quota
- `packages/functions/src/services/ollama/index.js:2` — zodv4 loaded at import time, before the function target is registered
- `packages/functions/src/services/ollama/index.js:6` — helpers/openAI/metaData pulls cheerio — the bulk of the startup RSS
- `packages/functions/src/handlers/exports/cronFunctions.js:94` — resumeStuckBulkFixJobsGen2 runs the same */15 schedule at 1GiB over a superset import graph — the precedent tier to suggest

## Evidence
- 12 matching entries: `(resource.labels.service_name="ollamaquotaalertgen2" OR resource.labels.function_name="ollamaquotaalertgen2") AND timestamp>="2026-08-19T09:16:12Z" AND timestamp<="2026-08-19T09:46:12Z"`
- 1 matching entries: `resource.labels.service_name="ollamaquotaalertgen2" AND timestamp>="2026-08-19T09:16:12Z" AND timestamp<="2026-08-19T09:46:12Z" AND textPayload:"Memory limit of 256 MiB exceeded"`
- 1 matching entries: `resource.labels.function_name="ollamaQuotaAlertGen2" AND timestamp>="2026-08-19T09:16:12Z" AND timestamp<="2026-08-19T09:46:12Z" AND protoPayload.status.message:"Container Healthcheck failed"`
- 3 matching entries: `resource.labels.service_name="ollamaquotaalertgen2" AND timestamp>="2026-08-21T00:00:00Z" AND textPayload:"Memory limit of 512 MiB exceeded"`

## Job
- analyze rounds: 1
- cost: $1.79

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
