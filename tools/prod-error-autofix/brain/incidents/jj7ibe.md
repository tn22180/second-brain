fingerprint: jj7ibe
service: resetproductoptimizepublishergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:37:58.608Z
status: infra
attempt: 1

# SEO · resetproductoptimizepublishergen2 · jj7ibe

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision resetproductoptimizepublishergen2-00319-veh, whose container never bound :8080 before Cloud Run's 240s startup TCP probe deadline, so the deploy was rejected with HealthCheckContainerError — one of 713 identical container-start failures across ~40 unrelated avada-seo/us-central1 services in the 04:00–05:30Z window, i.e. a platform-side fault, not a defect in this repo.

**Mechanism.** resetProductOptimizePublisherGen2 is onSchedule({memory:'1GiB', timeoutSeconds:540, schedule:'0 0 1 * *', ...vpcSettings}) (packages/functions/src/handlers/exports/cronFunctions.js:61-64). The 04:25:46.712Z UpdateFunction by tuannv@avadagroup.com rolled out revision -00319-veh (creationTimestamp 2026-08-14T04:25:47.490715Z, generation 319). Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:27:32.877553Z; the container never reached listen() and at 04:31:39.404744Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 246.5s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} in the audit payload (P4: the latency names which limit fired). Cloud Run then flipped Ready→False with reason HealthCheckContainerError at 04:31:42.632683Z and UpdateFunction returned code 3 at 04:31:44.966768147Z. Traffic never moved: latestReadyRevisionName stayed resetproductoptimizepublishergen2-00318-xoy at 100%, so no merchant request and no cron tick was served by the broken revision (schedule is monthly, '0 0 1 * *' — next fire 2026-09-01). Not app code: zero application log lines exist for the revision (stderr read = 0 entries), consistent with a process killed before module load finished; the identical source (firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1, same image us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/…changelog_triggers--shops:version_1 that Firebase reuses across all functions of one deploy) was redeployed unchanged at 05:14:28Z, 05:31:15Z and 06:50:52Z and each time logged 'Default STARTUP TCP probe succeeded after 1 attempt' within ~20s. P3 OOM is ruled out: no 'Memory limit' line on this service, and the container never started. The fault is fleet-wide, not service-specific — 713 startup-probe/health-check failures over 04:00–05:30Z spread across authgen2 (72), handleproderroralertgen2 (59), apigen2 (49), proxygen2 (26), onupdateshopgen2 (24), extensiongen2 (24) and ~34 more, including resetproductoptimizepublishergen2 (3), which is the same platform window already recorded under fingerprints 1s70qli / oljzqs / 3ma0sz / 58n8b8 and others.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:61` — resetProductOptimizePublisherGen2 export — the function whose revision -00319-veh failed the container health check
- `packages/functions/src/handlers/exports/cronFunctions.js:62` — {memory:'1GiB', timeoutSeconds:540, schedule:'0 0 1 * *'} — monthly cron, no minInstances; 1GiB with zero 'Memory limit' lines rules out P3, and the monthly schedule bounds blast radius to zero missed ticks in this window
- `packages/functions/src/handlers/cron/resetProductOptimize.js:11` — the handler body — unchanged code that deployed clean on the 05:14Z, 05:31Z and 06:50Z retries, proving the 04:25Z failure was not source-side

## Evidence
- 32 matching entries: `(resource.labels.service_name="resetproductoptimizepublishergen2" OR resource.labels.function_name="resetProductOptimizePublisherGen2") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T12:00:00Z"`
- 713 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND (protoPayload.status.message:"failed to start and listen on the port" OR textPayload:"STARTUP TCP probe failed")`
- 4 matching entries: `(resource.labels.service_name="resetproductoptimizepublishergen2" OR resource.labels.function_name="resetProductOptimizePublisherGen2") AND timestamp>="2026-08-14T04:21:35.052Z" AND timestamp<="2026-08-14T04:51:35.052Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
