fingerprint: 1wpcrz3
service: publishbulkfaqsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:26:19.932Z
status: infra
attempt: 1

# SEO · publishbulkfaqsgen2 · 1wpcrz3

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14 04:31–04:47Z prod deploy of avada-seo hit a platform-side container-start fault in us-central1 — publishbulkfaqsgen2 revision -00222-qod never bound :8080 and Cloud Run failed it on the default 240s startup TCP probe, aborting the UpdateFunction; the identical source redeployed clean at 05:17Z, 05:34Z and 06:53Z with no code change.

**Mechanism.** publishBulkFaqsGen2 is onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'publishBulkFaqs', ...vpcSettings}) (packages/functions/src/handlers/exports/pubsubFunctions.js:333-335). At 2026-08-14T04:32:01.716166Z Cloud Run created revision publishbulkfaqsgen2-00222-qod (generation 222, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1, deployer tuannv@avadagroup.com via cli-firebase). At 04:32:07.220135Z it logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT'; the container never reached listen(), and at 04:36:07.666554Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.45s after instance start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} in the audit payload (P4: the latency identifies which limit fired). Cloud Run then flipped Ready=False with reason HealthCheckContainerError at 04:36:12.881128Z and the Functions v2 UpdateFunction failed with status code 3 at 04:36:15.377083739Z. Not a module-load crash: the failed revision emitted zero application log lines (stderr read = 0 entries) — no stack, no 'Container called exit(1)' — only the probe timeout. Not a code defect: all 180 functions in this deploy ship the SAME image (us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__changelog_triggers--shops:version_1, build e7eb0c1a-6660-449b-b388-45ccc232bc56) and the outcome split 69 failed / 111 succeeded on identical bytes — a module-scope throw would have failed all 180 identically. Decisive: the same function, same source, redeployed at 05:16:43Z, 05:33:40Z and 06:52:55Z and each time logged 'Default STARTUP TCP probe succeeded after 1 attempt', with UpdateFunction at NOTICE. The fault is also not project-scoped: avada-blog-app — a different GCP project, different codebase, with no deploy running — logged 31 'STARTUP TCP probe failed' lines in the same 04:00–06:00Z window (proxy, handleproderroralert, syncsubscribeactivecharge), against 593 in avada-seo. P3 OOM is excluded: no 'Memory limit' line on this service, and an OOM kill would not leave the port unbound for the full 240s probe. Blast radius is nil for merchants: latestReadyRevisionName stayed publishbulkfaqsgen2-00221-kix with 100% traffic, so the Pub/Sub topic 'publishBulkFaqs' kept being served by the previous revision throughout. Same platform window already recorded as infra under fingerprints 1kyn3ri, 1ymh1bc, 10vnojp, zod1y3, 5dup6h, q12jxx and others.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:333` — publishBulkFaqsGen2 export — the function whose deploy failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:334` — {memory:'1GiB', timeoutSeconds:540, topic:'publishBulkFaqs', ...vpcSettings} — matches the failed revision's 1024Mi limit and 540s timeout in the audit payload; unchanged across the failed 00222 and the successful 00223+ deploys, so config is not the variable
- `packages/functions/src/handlers/pubsub/subscribePublishBulkFaqs.js:249` — the handler body — never executed; the container died before listen(), so no code in this file can be the cause

## Evidence
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="publishbulkfaqsgen2" AND resource.labels.revision_name="publishbulkfaqsgen2-00222-qod" AND timestamp>="2026-08-14T04:30:00Z" AND timestamp<="2026-08-14T04:45:00Z"`
- 69 matching entries: `protoPayload.status.message:"Container Healthcheck failed" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 111 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND operation.last=true AND NOT severity>=ERROR AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 28 matching entries: `(protoPayload.resourceName:"functions/publishBulkFaqsGen2" OR resource.labels.service_name="publishbulkfaqsgen2") AND timestamp>="2026-08-14T04:36:00Z" AND timestamp<="2026-08-14T23:59:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
