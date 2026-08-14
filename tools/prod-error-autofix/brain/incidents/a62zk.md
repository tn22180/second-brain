fingerprint: a62zk
service: tapaffiliateprocessgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:22:00.836Z
status: infra
attempt: 1

# SEO · tapaffiliateprocessgen2 · a62zk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision tapaffiliateprocessgen2-00318-bir, whose DEPLOYMENT_ROLLOUT health-check container never bound :8080 and was killed at the 240s default startup TCP probe deadline — one of 593 identical startup-probe failures across 78 distinct avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** tapAffiliateProcessGen2 is declared onSchedule({timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * *', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:44-46, so its only real traffic is one daily 00:00 tick — which ran fine that day ('STARTUP TCP probe succeeded' at 2026-08-14T00:01:13.080381Z). The alerted event is a deploy, not a job run: the Firebase CLI UpdateFunction operation (principalEmail tuannv@avadagroup.com, operation-1786681545799-…) created revision -00318-bir at 04:25:47.509629Z; Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:27:29.951286Z, and at 04:31:33.112315Z logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' — 243.16s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} in the audit payload to within log granularity (P4: the latency identifies which limit fired). Cloud Run then flipped Ready=False with reason HealthCheckContainerError at 04:31:39.406223Z and the CLI surfaced code 3 at 04:31:41.762197559Z. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h against its declared 1024Mi, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished — expected on this app anyway, since helpers/logger.js is bare console.* and the sink filters severity>=ERROR (P7). The fault is not service-specific and not code-specific: in 04:00–05:30Z the same probe-failure line fired 593 times across 78 distinct avada-seo services (authgen2 ×103, handleproderroralertgen2 ×79, apigen2 ×52, … tapaffiliateprocessgen2 ×1), on different revisions and different images, with the same source tree — the same window already recorded as infra under fingerprints dw8unc / 1udmr73 / s01pkg and ~50 others. Blast radius is zero: latestReadyRevisionName stayed tapaffiliateprocessgen2-00317-quh with 100% traffic, and the next three cold starts of this service (05:16:31Z, 05:33:27Z, 06:52:34Z) all logged 'STARTUP TCP probe succeeded' with unchanged code, so the 00:00 cron tick was never at risk.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:44` — tapAffiliateProcessGen2 export — the service whose deploy-rollout container failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:45` — {timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * *'} — 1GiB with zero 'Memory limit' lines in 24h rules out P3; a daily-only schedule means the 04:31 event was a deploy health check, not a job run
- `packages/functions/src/handlers/schedule/processTapAffiliateReferrals.js:62` — the handler body (tapAffiliateProcessed: true) never executed — no application log line exists for this instance, consistent with a kill before listen()

## Evidence
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="tapaffiliateprocessgen2" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T05:00:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `(resource.labels.service_name="tapaffiliateprocessgen2" OR resource.labels.function_name="tapAffiliateProcessGen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe")`
- 4 matching entries: `(resource.labels.service_name="tapaffiliateprocessgen2" OR resource.labels.function_name="tapAffiliateProcessGen2") AND timestamp>="2026-08-14T04:26:22.097Z" AND timestamp<="2026-08-14T04:56:22.097Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
