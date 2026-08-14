fingerprint: 10vnojp
service: webhookbulkoperationgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:16:17.337Z
status: infra
attempt: 1

# SEO · webhookbulkoperationgen2 · 10vnojp

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault that swept avada-seo/us-central1 during 2026-08-14T04:00–05:30Z killed three cold-start containers of webhookbulkoperationgen2 revision -00319-cod, so the 04:25 firebase deploy of that revision failed Cloud Run's 240s startup TCP probe and UpdateFunction returned INVALID_ARGUMENT — no merchant request failed, traffic stayed on the healthy prior revision -00318-kul.

**Mechanism.** webhookBulkOperationGen2 is declared onRequest({timeoutSeconds: 60, memory: '1GiB', minInstances: 1, ...vpcSettings}) at packages/functions/src/handlers/exports/httpFunctions.js:110-115, so every new revision must bring up a warm instance and pass the default startup probe (startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} — read from the revision spec in the pulled logs.json:487-494) before the deploy can complete. Timeline on one instance chain: at 04:25:48.239Z revision webhookbulkoperationgen2-00319-cod was created by a firebase UpdateFunction call (principalEmail tuannv@avadagroup.com, logs.json:17-20); Cloud Run logged 'Starting new instance. Reason: MANUAL_OR_CUSTOMER_MIN_INSTANCE' at 04:27:29Z, 04:27:41Z, 04:29:42Z, 04:31:45Z and 04:33:45Z; none of them ever bound :8080, and 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. Connection failed with status DEADLINE_EXCEEDED' fired at 04:31:41.355Z, 04:33:43.434Z and 04:35:45.214Z — each ~240s after its instance-start line, matching the configured probe timeout to the log's own granularity (P4: the latency identifies which limit fired). At 04:35:51.240Z the revision Ready condition flipped to False ('Container failed to become healthy. Startup probes timed out after 4m'), and at 04:35:56.184Z the audit log recorded the UpdateFunction failure with status code 3. The fault is not this service's: the identical 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services in the same 04:00–05:30Z window (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, …), on unrelated revisions and unrelated images, with unchanged code — the same window already recorded as infra under fingerprints 5dup6h / q12jxx / 1i16r90 / pva4gd and ~20 others. The one image oddity is a red herring and was checked: revision -00319-cod runs image avada--seo__us--central1__changelog_triggers--shops with build-function-target {"worker":"changelogTriggers.shops"} (logs.json:473, 585) — but so do the *healthy* revisions (-00318-kul runs sidekick_gen2 / sidekickGen2, -00321-qux runs the same changelog_triggers--shops image and deployed successfully in 2m11s at 05:33:28Z), so firebase's shared build artifact is normal here and not causal. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h and no application log at all from the dead containers. Blast radius is zero merchant impact — status.traffic stayed 100% on latestReadyRevisionName webhookbulkoperationgen2-00318-kul (logs.json:536, 542), the single Shopify bulk-finish webhook that arrived in the alert window (POST /webhook/bulk-operation at 04:37:34.036Z) was answered 200, and the service logged zero httpRequest.status>=500 in the whole 24h. It self-healed: probes succeeded again at 04:35:15Z and 04:37:37Z, and the next two deploys (-00320-vig at 05:16:42Z, -00321-qux at 05:33:28Z) both came up in ~2m.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:110` — webhookBulkOperationGen2 export — the service whose revision -00319-cod failed its startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:113` — {timeoutSeconds: 60, memory: '1GiB', minInstances: 1} — minInstances:1 is why the deploy had to pass a startup probe to complete (instance-start reason logged as MANUAL_OR_CUSTOMER_MIN_INSTANCE); 1GiB with zero 'Memory limit' lines in 24h rules out P3

## Evidence
- 3 matching entries: `resource.labels.service_name="webhookbulkoperationgen2" AND timestamp>="2026-08-14T04:21:09Z" AND timestamp<="2026-08-14T04:51:09Z" AND textPayload:"STARTUP TCP probe failed"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `resource.labels.service_name="webhookbulkoperationgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 1 matching entries: `resource.labels.service_name="webhookbulkoperationgen2" AND timestamp>="2026-08-14T04:21:09Z" AND timestamp<="2026-08-14T04:51:09Z" AND httpRequest.status>=200`

## Job
- analyze rounds: 1
- cost: $1.80

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
