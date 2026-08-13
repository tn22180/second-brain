fingerprint: 1cjpk7d
service: authsagen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-12T20:09:18.248Z
status: infra
attempt: 1

# SEO · authsagen2 · 1cjpk7d

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint z46hx6 (already recorded infra, no MR): the same three authsagen2 cold-start containers on revision authsagen2-00313-qeh (instances …e6fba1ade3, …411e61c790, …c739bc924d) never bound :8080 and were killed when Cloud Run's startup TCP probe hit its configured 240s deadline, so the three GET /authSa/a/login requests waiting on those cold starts were answered 503 'instance failed the readiness check' — one of 15 startup-probe failures across 5 unrelated avada-seo services in the same 45 minutes, i.e. a platform-side container-start stall, not a defect in this repo.

**Mechanism.** authSaGen2 is declared onRequest({memory: '1GiB', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:86) — unlike apiGen2/apiSaGen2/apiV2Gen2 at :31/:46/:56 and handleProdErrorAlert at :112, which do set minInstances — so a CRM login arriving at a scaled-to-zero service pays a full cold start. `gcloud run services describe authsagen2` shows startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}; the three 503s carry latencies 240.592098s, 241.195124s and 244.245699s — the probe deadline plus scheduling, matching P4 (the latency identifies which limit fired). Each 503 is followed ~120–158s later by the Cloud Run line 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' on the same instanceId (09:09:50→09:13:51 for …e6fba1ade3, 09:10:50→09:15:46 for …411e61c790, 09:11:39→09:17:31 for …c739bc924d). The container never reached listen(): the stderr read is 0 entries and no application log exists for these instances, consistent with a process killed before module load finished. P3 OOM is ruled out — zero 'Memory limit' lines on this service in the full 24h. The fault is not service-specific and not code-specific: in 08:45–09:30Z the identical probe-failure line fired 15 times across handleproderroralertgen2 (6), lighthouseauditrunnergen2 (3), authsagen2 (3), bulkauditfixapplyproductgen2 (2) and retriggeroptimizepublishergen2 (1), on different revisions and images with unchanged code — the same window already recorded infra under fingerprints z46hx6 / 1ufg1uu / pcaoyd / 15d5t6z. Same-day baseline on this service is 33 successful probes against 3 failures (8.3%). Blast radius: the affected user is the CRM support login (token claim isCrmLogin:true, shopID dFkkJwzADFbNmdKJrBAc) retrying the same link — merchant-facing /auth is a different service (authGen2, :81), so no merchant OAuth was affected.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:86` — authSaGen2 = onRequest({memory: '1GiB', ...vpcSettings}) — no minInstances, so every CRM login on a scaled-to-zero service pays a full cold start; 1GiB with zero 'Memory limit' lines that day rules out P3
- `packages/functions/src/handlers/exports/httpFunctions.js:46` — apiSaGen2 sets minInstances: isProduction ? 3 : 0 — shows the repo's warm-instance convention that authSaGen2 does not follow
- `packages/functions/src/handlers/authSa.js:58` — prefix '/authSa' — the Koa router mounted on this service, confirming the failing GET /authSa/a/login belongs to authsagen2 and not merchant-facing authGen2

## Evidence
- 6 matching entries: `(resource.labels.service_name="authsagen2" OR resource.labels.function_name="authsagen2") AND timestamp>="2026-08-12T08:59:48.442Z" AND timestamp<="2026-08-12T09:29:48.442Z" AND severity>=ERROR`
- 15 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T08:45:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 39 matching entries: `resource.labels.service_name="authsagen2" AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Memory limit")`

## Job
- analyze rounds: 1
- cost: $1.23

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
