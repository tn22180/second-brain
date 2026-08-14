fingerprint: s01pkg
service: dailyjobspublishergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:10:40.754Z
status: infra
attempt: 1

# SEO · dailyjobspublishergen2 · s01pkg

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision dailyjobspublishergen2-00319-qay, whose container never bound :8080 and was killed when Cloud Run's 240s startup TCP probe expired — one of 460+ identical probe failures across 30+ unrelated avada-seo services in the same 04:00–05:30Z hour, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** dailyJobsPublisherGen2 is declared onSchedule({timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * *', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:24-27. The 04:25Z prod deploy built revision -00319-qay (creationTimestamp 2026-08-14T04:25:47.517923Z, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1). Cloud Run started the container at 04:27:47.761510Z ('Starting new instance. Reason: DEPLOYMENT_ROLLOUT'); at 04:31:48.241899Z it logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.48s after instance start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} carried in the audit payload (P4: the latency identifies which limit fired). 3s later the Ready condition flipped False (HealthCheckContainerError) and the UpdateFunction call returned code 3. The container emitted zero application log lines (stderr read = 0 entries), consistent with a process killed before module load finished; P3 OOM is ruled out — no 'Memory limit' line on this service and the kill is a probe deadline, not a 1024 MiB exceed. The code is exonerated by re-deploy: the same firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1 deployed clean twice later the same hour — revision -00320-nuc 'Deploying revision succeeded in 2m13.9s' at 05:16:43Z and -00321-lif 'succeeded in 2m7.31s' at 05:33:24Z, both with 'Default STARTUP TCP probe succeeded after 1 attempt'. The fault is not service-specific: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 460+ times across 30+ distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37, extensiongen2 31 …), on different revisions and different images — the same window already recorded as infra under fingerprints 1udmr73 / 18hglhi / 5dup6h and ~50 others. Blast radius is zero merchant impact: the failed revision never took traffic (status.traffic stayed 100% on dailyjobspublishergen2-00318-puz, latestReadyRevisionName -00318-puz), and this is a 0 0 * * * daily cron whose next tick at 2026-08-15T00:00Z runs on the successfully deployed -00321-lif.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:24` — dailyJobsPublisherGen2 export — the service whose deploy revision failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:25` — {timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * *', ...vpcSettings} — 1GiB with zero 'Memory limit' lines rules out P3; the daily schedule bounds blast radius since the deploy did not coincide with a cron tick and traffic never left -00318-puz
- `packages/functions/src/handlers/cron/handleDailyJobs.js:1` — the handler bound to this export — never ran; the container died before module load, so no application code is implicated

## Evidence
- 24 matching entries: `(resource.labels.service_name="dailyjobspublishergen2" OR resource.labels.function_name="dailyJobsPublisherGen2") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 460 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 15 matching entries: `(resource.labels.service_name="dailyjobspublishergen2" OR resource.labels.function_name="dailyJobsPublisherGen2") AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 4 matching entries: `(resource.labels.service_name="dailyjobspublishergen2" OR resource.labels.function_name="dailyJobsPublisherGen2") AND timestamp>="2026-08-14T04:26:09.081Z" AND timestamp<="2026-08-14T04:56:09.081Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
