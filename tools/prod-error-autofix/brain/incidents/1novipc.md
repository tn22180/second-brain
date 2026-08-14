fingerprint: 1novipc
service: handlegenfaqsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:31:39.704Z
status: infra
attempt: 1

# SEO · handlegenfaqsgen2 · 1novipc

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:2xZ prod deploy of avada-seo hit a platform-side container-start fault that swept the whole project — revision handlegenfaqsgen2-00318-mel never bound :8080, failed its 240s startup TCP probe at 04:32:29Z, and Cloud Run rejected the UpdateFunction; traffic stayed on the healthy prior revision, so no merchant request failed.

**Mechanism.** handleGenFaqsGen2 is a plain onMessagePublished export (packages/functions/src/handlers/exports/pubsubFunctions.js:328-331, memory '1GiB', timeoutSeconds 540, topic 'handleGenFaqs', vpcSettings) — nothing in it touches startup behaviour, and the firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1 is the same build hash carried by every function in this deploy. Deploy timeline from the audit logs: revision handlegenfaqsgen2-00318-mel created 2026-08-14T04:28:21.915337Z; Cloud Run's Default startup probe is tcpSocket:8080, failureThreshold 1, periodSeconds 240, timeoutSeconds 240; at 04:32:29.323258Z (247.4s later, i.e. the probe deadline) run.googleapis.com/varlog/system logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' on instance 001548f7290d563f…; at 04:32:31.686375Z the service Ready condition flipped False with reason HealthCheckContainerError; at 04:32:33.316871Z the Cloud Functions v2 UpdateFunction by tuannv@avadagroup.com returned code 3 'Could not create or update Cloud Run service handlegenfaqsgen2, Container Healthcheck failed'. The container produced zero application output — the stderr read is 0 entries and the whole errors read is 4 platform lines — which is the expected shape for a process killed before module load finishes (P3 note: absence of an app log is consistent, not exculpatory; but P3 OOM is ruled out — no 'Memory limit' line anywhere on this service, and the kill is a probe DEADLINE_EXCEEDED, not an OOM). The fault is not this function's: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo/us-central1 services (authgen2 103, handleproderroralertgen2 79, apigen2 52, …, handlegenfaqsgen2 1), and 70 UpdateFunction operations failed with severity>=ERROR in the same window — one repo-wide deploy meeting a platform-side container-start stall, already recorded under fingerprints 1s88080 / p7he52 / 3wv547 / 17rms13 and ~40 more from this same window. One corroborating platform-side artifact on this revision: its image is us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__changelog_triggers--shops:version_1 with run.googleapis.com/build-function-target {"worker":"changelogTriggers.shops"} and source gs://…/changelogTriggers-shops/function-source.zip, while the container env sets FUNCTION_TARGET=handleGenFaqsGen2 — the Firebase/Cloud Run build layer stamped this revision from another function's build; changelogtriggers-shops itself took 17 probe failures in the same window. Blast radius: none merchant-side. status.traffic pinned 100% to the last healthy revision handlegenfaqsgen2-00317-lav, this service logged zero httpRequest.status>=500 in the full 24h, and a later deploy landed handlegenfaqsgen2-00321-wid which was serving normally by 08:58:01Z. The only cost is the failed deploy attempt.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:328` — handleGenFaqsGen2 export — the function whose revision 00318-mel failed its startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:329` — {memory: '1GiB', timeoutSeconds: 540, topic: 'handleGenFaqs', ...vpcSettings} — matches the revision spec in the audit log (1024Mi, timeoutSeconds 540, vpc-access-connector seo-connector); no minInstances, no concurrency override, nothing that affects container start
- `packages/functions/src/handlers/pubsub/subscribeGenFaq.js:354` — the handler body wrapped by this export — never executed, container died before module load (0 stderr entries)

## Evidence
- 4 matching entries: `(resource.labels.service_name="handlegenfaqsgen2" OR resource.labels.function_name="handleGenFaqsGen2") AND timestamp>="2026-08-14T04:22:47.801Z" AND timestamp<="2026-08-14T04:52:47.801Z" AND severity>=ERROR`
- 1 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handlegenfaqsgen2" AND timestamp>="2026-08-14T04:22:47Z" AND timestamp<="2026-08-14T04:52:47Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 70 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND severity>=ERROR`
- 10 matching entries: `resource.labels.service_name="handlegenfaqsgen2" AND timestamp>="2026-08-14T04:52:47Z" AND timestamp<="2026-08-14T23:59:59Z" AND labels."goog-drz-cloudfunctions-id"="handlegenfaqsgen2"`

## Job
- analyze rounds: 2
- cost: $2.76

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
