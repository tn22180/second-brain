fingerprint: 1jqc0d4
service: weeklybrokenlinkspublishergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:33:55.070Z
status: infra
attempt: 1

# SEO · weeklybrokenlinkspublishergen2 · 1jqc0d4

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision weeklybrokenlinkspublishergen2-00318-tig from the wrong Cloud Build artifact — the revision carries build-function-target {"worker":"changelogTriggers.shops"} and image avada--seo__us--central1__changelog_triggers--shops:version_1 while its container env sets FUNCTION_TARGET=weeklyBrokenLinksPublisherGen2 — so the container never bound :8080 and Cloud Run failed it with HealthCheckContainerError; it was 1 of 59 avada-seo services hit by the same platform fault in that deploy window, and it self-healed on the 05:16Z redeploy.

**Mechanism.** weeklyBrokenLinksPublisherGen2 is a plain onSchedule('0 0 * * 1', memory '1GiB', timeoutSeconds 540) export (packages/functions/src/handlers/exports/cronFunctions.js:50-53) — no custom entrypoint, no port binding of its own; Firebase functions-framework serves it. At 2026-08-14T04:25:47.848004Z Cloud Run created revision weeklybrokenlinkspublishergen2-00318-tig. The revision's own annotations name a foreign build: run.googleapis.com/build-function-target = {"worker":"changelogTriggers.shops"}, build-source-location = gs://gcf-v2-sources-838085742353-us-central1/changelogTriggers-shops/function-source.zip#1786681152120006, build-id e7eb0c1a-6660-449b-b388-45ccc232bc56, and the container image is us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__changelog_triggers--shops:version_1 — while the same container's env still carries FUNCTION_TARGET=weeklyBrokenLinksPublisherGen2 and FUNCTION_SIGNATURE_TYPE=http, and the service-level annotation build-function-target correctly reads weeklyBrokenLinksPublisherGen2. Target/image mismatch means the process never reached listen(:8080); at 04:31:40.062206Z the Ready condition flipped to False with reason HealthCheckContainerError, 'The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout' (startupProbe tcpSocket:8080, timeoutSeconds 240, periodSeconds 240, failureThreshold 1 — the deadline the alert's DEADLINE_EXCEEDED refers to, P4). The UpdateFunction audit entry followed at 04:31:41.597367405Z with code 3. This is not specific to this function: the identical 'failed to start and listen on the port' message fired 118 times across 59 distinct avada-seo/us-central1 services between 04:00Z and 05:30Z — including changelogtriggers-shops itself, apigen2, apiv2gen2, authsagen2, handleoptimizeimagegen2 — with unchanged repo code, matching the ~40 fingerprints already recorded as infra for this same deploy window. Blast radius is zero merchant impact: traffic stayed pinned to the last ready revision weeklybrokenlinkspublishergen2-00317-koj (status.traffic revisionName, 100%), the cron fires Mondays 00:00 UTC so no invocation was due, and redeploys at 05:16:40Z (00319-hay), 05:33:51Z (00320-git) and 06:52:19Z (00321-gis) all logged INFO with no ERROR entry. P3 OOM is ruled out — zero 'Memory limit' lines and no application log at all (stderr read = 0 entries), consistent with a process killed before module load, and the 1024Mi limit was never approached.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:50` — weeklyBrokenLinksPublisherGen2 export — the function whose revision 00318-tig failed the container health check
- `packages/functions/src/handlers/exports/cronFunctions.js:51` — {timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 * * 1', ...vpcSettings} — weekly Monday 00:00 UTC schedule means no invocation was due in the 04:2x–04:3xZ deploy window, so the failed revision cost nothing; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/exports/cronFunctions.js:52` — publicHandleWeeklyBrokenLinks is the only handler wired here — no custom server, no port binding in repo code, so a :8080 bind failure cannot originate in this source

## Evidence
- 4 matching entries: `(resource.labels.service_name="weeklybrokenlinkspublishergen2" OR resource.labels.function_name="weeklybrokenlinkspublishergen2" OR resource.labels.job_name="weeklybrokenlinkspublishergen2") AND timestamp>="2026-08-14T04:22:52.190Z" AND timestamp<="2026-08-14T04:52:52.190Z" AND severity>=ERROR`
- 118 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 26 matching entries: `resource.labels.service_name="weeklybrokenlinkspublishergen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T14:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.84

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
