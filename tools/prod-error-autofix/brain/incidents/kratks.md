fingerprint: kratks
service: scanissuessubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:52:49.939Z
status: infra
attempt: 1

# SEO · scanissuessubscribergen2 · kratks

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:43:15Z prod deploy of avada-seo (UpdateFunction by tuannv@avadagroup.com) created revision scanissuessubscribergen2-00310-gej, whose first container never bound :8080 before Cloud Run's 240s startup TCP probe deadline — one of 593 identical 'STARTUP TCP probe failed' events across ~40 unrelated avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** scanIssuesSubscriberGen2 is declared onMessagePublished({memory: '4GiB', timeoutSeconds: 540, topic: 'scanIssues', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:234-237, so every revision inherits Cloud Run's Default startup probe — the deployed spec in the audit log shows startupProbe {tcpSocket:{port:8080}, failureThreshold:1, periodSeconds:240, timeoutSeconds:240}. The deploy sequence is fully in the audit trail: revision -00310-gej created 04:43:16.470412Z; 'Container image import completed' 04:43:17.328966Z; 'Provisioning imported containers completed in 25.08s. Checking container health. This will wait for up to 4m for the configured startup probe, including an initial delay of 0s' at 04:43:42.412258Z. Exactly 240.4s later, at 04:47:42.817121Z, instance 001548f7296cacea42… logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' — the latency matches the configured timeoutSeconds: 240 to within the log's granularity (P4: the number identifies which limit fired). Cloud Run then flipped Ready=False with reason HealthCheckContainerError at 04:47:44.019256Z (revision) and 04:47:44.127246Z (service), and the GCF UpdateFunction operation failed at 04:47:45.872647701Z with 'Could not create or update Cloud Run service scanissuessubscribergen2, Container Healthcheck failed'. Three exclusions: (1) not app code — the stderr read for the whole 30-minute window returned 0 entries, so no module-load or handler line ran; the process died before any logger call, and this app's logger is bare console.* (P7), so an empty severity>=ERROR app-side set is the expected state anyway. (2) Not P3 OOM — no 'Memory limit' line appears in the window and the spec's resources.limits are cpu:2 / memory:4Gi. (3) Not an image or config regression — every revision of this service, including the healthy -00309-gok (2026-08-13) and -00308-boz before it, is built from the same shared gcf-artifacts repo path avada--seo__us--central1__lighthouseauditrunner_gen2 (a GCF artifact-repo naming artefact, identical before and after the failure), and the same source hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1 is on the failing revision. Blast radius is zero for merchants: status.traffic stayed pinned at 100% on latestReadyRevisionName scanissuessubscribergen2-00309-gok throughout, the revision's own Retry condition logged 'System will retry after 00:00 … for attempt 0', and -00310-gej now reports Ready=True, with -00311/-00312/-00313 deployed cleanly by 06:58Z. No scanIssues Pub/Sub message was 500'd — the requests read (httpRequest.status>=500) returned 0 entries.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:234` — scanIssuesSubscriberGen2 export — the function whose revision -00310-gej failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:235` — {memory: '4GiB', timeoutSeconds: 540, topic: 'scanIssues'} — matches the deployed spec's 4Gi limit, and 4GiB with zero 'Memory limit' lines rules out P3 OOM
- `packages/functions/src/handlers/exports/pubsubFunctions.js:236` — wrapPubSub(subscribeScanIssues) is the only body — the container died before this handler could run, matching the 0-entry stderr read
- `packages/functions/src/handlers/pubsub/subscribeScanIssues.js:1` — the handler module that would have logged had the failure been in app code; no line from it appears in the window

## Evidence
- 4 matching entries: `(resource.labels.service_name="scanissuessubscribergen2" OR resource.labels.function_name="scanissuessubscribergen2" OR resource.labels.job_name="scanissuessubscribergen2") AND timestamp>="2026-08-14T04:32:44.720Z" AND timestamp<="2026-08-14T05:02:44.720Z" AND severity>=ERROR`
- 1 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="scanissuessubscribergen2" AND timestamp>="2026-08-14T04:40:00Z" AND timestamp<="2026-08-14T05:05:00Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `logName="projects/avada-seo/logs/cloudaudit.googleapis.com%2Factivity" AND resource.labels.function_name="scanIssuesSubscriberGen2" AND timestamp>="2026-08-14T04:32:44Z" AND timestamp<="2026-08-14T05:02:44Z"`

## Job
- analyze rounds: 2
- cost: $2.72

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
