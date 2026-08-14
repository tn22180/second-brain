fingerprint: 18hglhi
service: onrevertinternallinkupdategen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:05:28.465Z
status: infra
attempt: 1

# SEO · onrevertinternallinkupdategen2 · 18hglhi

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:31:56Z prod deploy of avada-seo created revision onrevertinternallinkupdategen2-00319-xub, whose container never bound :8080 within the 240s default startup TCP probe, so Cloud Run rejected the revision (HealthCheckContainerError) — one of 69 distinct avada-seo functions that failed the identical healthcheck in the same 04:00–05:30Z deploy window, with unchanged code.

**Mechanism.** onRevertInternalLinkUpdateGen2 is an onDocumentUpdated Firestore trigger declared memory:'1GiB', timeoutSeconds:120 with vpcSettings (packages/functions/src/handlers/exports/pubsubFunctions.js:479-487). The 04:31:56.443166Z deploy built revision -00319-xub (containerConcurrency 80, cpu 1, memory 1024Mi, startupProbe {tcpSocket:8080, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}, vpc-access-connector seo-connector). At 04:36:03.851366Z Cloud Run flipped the revision Ready=False with reason HealthCheckContainerError, message 'The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout' — 247s after revision creation, matching the 240s probe window plus scheduling (P4: the latency identifies which limit fired). The service condition followed at 04:36:03.982750Z and the Cloud Functions v2 UpdateFunction call failed at 04:36:05.204474593Z with code 3. Not a code defect: the same 'Container Healthcheck failed' status appeared 69 times on 69 distinct avada-seo function names in 04:00–05:30Z (weeklyBrokenLinksPublisherGen2, webhookImageGen2, proxyGen2, toolsGen2, sidekickGen2, onUpdateShopGen2 …), spanning HTTP, Pub/Sub, cron and Firestore triggers on different revisions and images — a platform-side container-start fault, already recorded under fingerprints 1n75rs6, 3tnrcs, 145obvc and ~40 more for this same window. P3 OOM is ruled out: no 'Memory limit' line and no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. Blast radius is zero for merchants: the service kept 100% traffic on the previously-ready revision -00318-lep (status.traffic[0].revisionName), no httpRequest.status>=500 exists for this service in 04:00–06:00Z, and the deploy self-healed — -00320-zuf became ready at 05:17:21Z, -00321-puf at 05:34:27Z, and the service now serves -00322-nov.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:479` — onRevertInternalLinkUpdateGen2 export — the onDocumentUpdated trigger whose Cloud Run revision failed the startup healthcheck
- `packages/functions/src/handlers/exports/pubsubFunctions.js:481` — memory:'1GiB' — matches the revision's 1024Mi limit; zero 'Memory limit' log lines in the window rules out P3 OOM
- `packages/functions/src/handlers/exports/pubsubFunctions.js:484` — ...vpcSettings — the seo-connector VPC attachment present on the failed revision -00319-xub; unchanged from the healthy -00318-lep
- `packages/functions/src/handlers/trigger/onRevertInternalLinkUpdateHandler.js:8` — handler body — never executed; container died before listen(), so no application log exists for this alert

## Evidence
- 4 matching entries: `(resource.labels.service_name="onrevertinternallinkupdategen2" OR resource.labels.function_name="onRevertInternalLinkUpdateGen2") AND timestamp>="2026-08-14T04:26:06Z" AND timestamp<="2026-08-14T04:56:06Z" AND severity>=ERROR`
- 69 matching entries: `timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"Container Healthcheck failed"`
- 4 matching entries: `resource.labels.service_name="onrevertinternallinkupdategen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T07:00:00Z" AND protoPayload.response.status.latestReadyRevisionName!=""`

## Job
- analyze rounds: 1
- cost: $1.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
