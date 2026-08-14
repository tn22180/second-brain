fingerprint: 1upz9gb
service: dailyjobssynccrisponestarshops
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:43:00.676Z
status: infra
attempt: 1

# SEO · dailyjobssynccrisponestarshops · 1upz9gb

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision dailyjobssynccrisponestarshops-00188-dur, whose container never bound :8080 and was killed when Cloud Run's 240s startup TCP probe hit DEADLINE_EXCEEDED — one of 573+ identical container-start failures across 40+ unrelated avada-seo/us-central1 services in the same 04:00–05:30Z deploy window, with zero merchant impact because traffic stayed on the already-ready revision -00187-huq.

**Mechanism.** dailyJobsSyncCrispOneStarShops is declared onSchedule({timeoutSeconds: 540, memory: '1GiB', schedule: '30 0 * * *'}, syncCrispOneStarShops) at packages/functions/src/handlers/exports/cronFunctions.js:34-37. At 2026-08-14T04:25:47.632069Z a firebase deploy (audit log methodName google.cloud.functions.v2.FunctionService.UpdateFunction, principalEmail tuannv@avadagroup.com) created revision -00188-dur. Cloud Run started its first container at 04:27:25.045706Z ('Starting new instance. Reason: DEPLOYMENT_ROLLOUT'). The process never reached listen(): at 04:31:31.771349Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 246.7s after instance start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} carried in the same audit payload (P4: the latency identifies which limit fired). The revision was then marked HealthCheckContainerError at 04:35:46.096983Z and the deploy failed at 04:35:50.481219389Z. P3 OOM is ruled out: the revision is 1024Mi with zero 'Memory limit' lines all day, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. The fault is not this function's: in 04:00–05:30Z the same startup-probe/HealthCheckContainerError signature fired 573+ times across 40+ distinct avada-seo services (authgen2 133, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 46 …), on different revisions and images — the same window already recorded as infra under fingerprints 1s70qli / 3ma0sz / bn2rrq / jj7ibe and others. The identical code deployed clean three times later the same day (revisions -00189-diy 05:16:22, -00190-wut 05:33:24, -00191-qek 06:52:21, each 'STARTUP TCP probe succeeded after 1 attempt'), which a code-level module-load defect could not do. Blast radius is zero: the service's status block shows latestReadyRevisionName -00187-huq still holding 100% traffic, and the cron fires at 00:30 UTC — it ran normally on -00187-huq at 2026-08-14T00:30:24Z, ~4h before the failed deploy, so no tick was lost. Separate note, not this alert's cause and belonging to its own fingerprint: that 00:30 run logged '[getData:getConversations] not_subscribed' → '[syncCrispOneStarShops] fetch failed for segment 1-star aborting without save', i.e. the Crisp plugin credential is unsubscribed from the website — the same defect family already recorded on BLOG as n9axd7 / 1dh1r4k.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:34` — dailyJobsSyncCrispOneStarShops export — the service whose deploy-time cold start failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:35` — {timeoutSeconds: 540, memory: '1GiB', schedule: '30 0 * * *'} — 1GiB with zero 'Memory limit' lines rules out P3, and the 00:30 UTC schedule is 4h clear of the 04:25–04:35Z deploy window, so no cron tick was lost
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:1` — the handler body the failed container was loading — it emitted no log line at all during the failed start, consistent with a kill before module load completed

## Evidence
- 4 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops" OR resource.labels.function_name="dailyJobsSyncCrispOneStarShops") AND timestamp>="2026-08-14T04:21:48Z" AND timestamp<="2026-08-14T04:51:48Z" AND severity>=ERROR`
- 573 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND (textPayload:"STARTUP TCP probe failed" OR protoPayload.status.message:"Container failed to become healthy")`
- 27 matching entries: `resource.labels.service_name="dailyjobssynccrisponestarshops" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.60

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
