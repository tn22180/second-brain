fingerprint: oljzqs
service: handleapproveallsuggestinternallinkgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:36:05.552Z
status: infra
attempt: 1

# SEO · handleapproveallsuggestinternallinkgen2 · oljzqs

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo rolled out revision handleapproveallsuggestinternallinkgen2-00318-nom into a platform-side container-start fault sweeping avada-seo/us-central1, so that cold-start container never bound :8080 and Cloud Run killed it on the 240s startup TCP probe deadline, failing the UpdateFunction with 'Container Healthcheck failed'.

**Mechanism.** handleApproveAllSuggestInternalLinkGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'approveAllSuggestInternalLink', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:449-452 with no minInstances, so a deploy rollout must cold-start a fresh container before shifting traffic. The audit log shows tuannv@avadagroup.com issuing google.cloud.functions.v2.FunctionService.UpdateFunction on resource projects/avada-seo/locations/us-central1/functions/handleApproveAllSuggestInternalLinkGen2 (operation-1786681545871-658fa36de4f71), and Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on that revision at 2026-08-14T04:27:43.071176Z. The container never reached listen(): at 04:31:43.701820Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.63s after the instance-start line, matching the default 240s startup TCP probe deadline to within log granularity (P4: the latency identifies which limit fired). The UpdateFunction then returned status code 3 'Could not create or update Cloud Run service handleapproveallsuggestinternallinkgen2, Container Healthcheck failed. The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout.' This is not specific to this function or to this repo's code: in 2026-08-14T04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services, on different revisions and different images — the same platform fault already recorded as infra under fingerprints 1kyn3ri, 5dup6h, 1r74ll6, mr1olj and others. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished — the note that the round-1 stderr query 'matched nothing' is itself the expected state here, so it is not usable as evidence and is not repeated. Unchanged code proves it was transient: the identical function redeployed successfully three times later the same morning, logging 'Default STARTUP TCP probe succeeded after 1 attempt' at 05:16:39.771610Z, 05:33:22.754898Z and 06:53:00.275174Z. Blast radius is zero merchant-facing: requests read = 0 (this is a Pub/Sub-triggered function, no HTTP callers), the failed revision never took traffic, and the prior revision kept serving the approveAllSuggestInternalLink topic until the 05:16 redeploy landed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:449` — handleApproveAllSuggestInternalLinkGen2 export — the service whose deploy-rollout cold start failed the startup TCP probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:450` — {memory:'1GiB', timeoutSeconds:540, topic:'approveAllSuggestInternalLink'} — no minInstances, so every rollout pays a full cold start; 1GiB with zero 'Memory limit' lines in 24h rules out P3 OOM

## Evidence
- 3 matching entries: `resource.labels.service_name="handleapproveallsuggestinternallinkgen2" AND timestamp>="2026-08-14T04:21:32.708Z" AND timestamp<="2026-08-14T04:51:32.708Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.service_name="handleapproveallsuggestinternallinkgen2" AND timestamp>="2026-08-14T04:27:00Z" AND timestamp<="2026-08-14T04:35:00Z" AND textPayload:"Starting new instance"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="handleapproveallsuggestinternallinkgen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T07:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 2
- cost: $2.29

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
