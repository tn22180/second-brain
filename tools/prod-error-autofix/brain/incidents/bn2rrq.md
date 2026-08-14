fingerprint: bn2rrq
service: weeklybrokenlinksreportpublishergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:39:23.372Z
status: infra
attempt: 1

# SEO · weeklybrokenlinksreportpublishergen2 · bn2rrq

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision weeklybrokenlinksreportpublishergen2-00319-veq, whose container never bound :8080 and was killed at the default 240s startup TCP probe deadline — one of 500+ identical startup-probe failures across 78 distinct avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** weeklyBrokenLinksReportPublisherGen2 is declared onSchedule({timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * 1', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:55-58, a weekly Monday-00:00 cron with no minInstances, so it holds no warm instance and every deploy replaces a cold service. At 2026-08-14T04:27:28.881034Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' for revision -00319-veq. The container never reached listen(): at 04:31:29.192186Z it logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.311s after the instance-start line, matching the Default startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, failureThreshold:1} to within log granularity (P4: the latency identifies which limit fired). The revision Ready condition flipped False at 04:31:34.346916Z, the Service at 04:31:34.498114Z, and the Cloud Functions v2 UpdateFunction call by tuannv@avadagroup.com failed with code 3 'Could not create or update Cloud Run service weeklybrokenlinksreportpublishergen2, Container Healthcheck failed' at 04:31:37.067802882Z. Rules out code: the same commit hash (firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1) started clean 45 minutes later — 'Default STARTUP TCP probe succeeded after 1 attempt' at 05:16:39.839848Z on the retry rollout, with no source change. Rules out P3 OOM: zero 'Memory limit' lines on this service in the window and the container died before module load, so no application log exists (stderr read = 0 entries, requests read = 0 entries; per P7 this app's bare-console logger would not reach severity>=ERROR anyway). Rules out anything service-specific: the identical probe-failure line fired 500+ times (query limit) across 78 unrelated avada-seo services in 04:00–05:30Z — authgen2 ×103, handleproderroralertgen2 ×79, apigen2 ×52, onupdateshopgen2 ×45, proxygen2 ×37 — on different revisions and images, the same fault already recorded under fingerprints jj7ibe / 3ma0sz / 1s70qli / 58n8b8 / 1wpcrz3 and others for this deploy window. Blast radius here is zero merchant impact: the failed deploy left the previous revision serving, the cron only fires Monday 00:00 (2026-08-14 is a Thursday), and getBrokenLinksReport work re-selects on the next weekly tick.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:55` — weeklyBrokenLinksReportPublisherGen2 export — the service whose new revision failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:56` — {timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * 1'} — no minInstances, so every deploy is a cold container start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/cron/publicHandleWeeklyBrokenLinksReport.js:14` — the cron body that never ran — fires only Monday 00:00, so the failed Thursday deploy cost no scheduled execution

## Evidence
- 4 matching entries: `(resource.labels.service_name="weeklybrokenlinksreportpublishergen2" OR resource.labels.function_name="weeklybrokenlinksreportpublishergen2") AND timestamp>="2026-08-14T04:21:36.844Z" AND timestamp<="2026-08-14T04:51:36.844Z" AND severity>=ERROR`
- 500 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 12 matching entries: `resource.labels.service_name="weeklybrokenlinksreportpublishergen2" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T05:30:00Z"`

## Job
- analyze rounds: 1
- cost: $1.20

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
