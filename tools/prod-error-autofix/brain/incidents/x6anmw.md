fingerprint: x6anmw
service: webhookpublishthemegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:08:53.849Z
status: infra
attempt: 1

# SEO · webhookpublishthemegen2 · x6anmw

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint zod1y3 (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 during the 2026-08-14 04:00–05:00Z hour made webhookpublishthemegen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 3 Shopify themes/publish webhook POSTs waiting on those cold starts were answered 503 'instance failed the readiness check'.

**Mechanism.** webhookPublishThemeGen2 is declared onRequest({memory: '1GiB', ...vpcSettings}, themeHook) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:122), so every Shopify themes/publish delivery arriving at zero warm instances pays a full cold start. All 3 pulled 500-class requests are POST /webhook/publishTheme, userAgent Shopify-Captain-Hook, with latencies 241.132166s, 243.156307s and 243.375765s — `gcloud run services describe webhookpublishthemegen2` returns startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}, so the latency is the 240s probe deadline plus scheduling and identifies exactly which limit fired (P4). Each 503 carries a distinct instanceId (…cd8387313f3ef4, …0d7c830cc5ee4e, …6abb7603340286), and each of those instanceIds first logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — the container never reached listen(), so themeHook.js:9 was never entered and publishTheme() never ran. The failures span two revisions of unchanged code (webhookpublishthemegen2-00318-zaz and -00319-cop), which rules out a regression in either. It is not this service at all: the identical probe-failure line fired across ~80 distinct avada-seo services in 2026-08-14T03:30–06:00Z (authgen2 56, handleproderroralertgen2 44, apigen2 40, proxygen2 20, extensiongen2 17, …, webhookpublishthemegen2 4) — a bounded platform-wide window already recorded as infra under zod1y3, 1r74ll6, muzsov, 1470mjt, e9i6k0, 1tesetr and others. P3 OOM ruled out: zero 'Memory limit' lines on this service that day, and an OOM would not produce a startup-probe DEADLINE_EXCEEDED. The stderr read is 0 entries because the process dies before module load (P7 also applies — this app's logger is bare console). Blast radius bounded: 3 themes/publish deliveries dropped, no partial write, Shopify retries the webhook.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:122` — webhookPublishThemeGen2 export — {memory: '1GiB', ...vpcSettings} with no minInstances, so every Shopify webhook delivery pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/webhook/themeHook.js:9` — the POST /webhook/publishTheme request handler — never entered, container died before listen()
- `packages/functions/src/handlers/webhook/themeHook.js:24` — publishTheme() — the backup-state reconcile that did not run for the 3 dropped deliveries; bounds blast radius, no partial write

## Evidence
- 3 matching entries: `(resource.labels.service_name="webhookpublishthemegen2") AND timestamp>="2026-08-14T04:20:57.625Z" AND timestamp<="2026-08-14T04:50:57.625Z" AND httpRequest.status>=500`
- 10 matching entries: `(resource.labels.service_name="webhookpublishthemegen2") AND timestamp>="2026-08-14T04:20:57.625Z" AND timestamp<="2026-08-14T04:50:57.625Z" AND severity>=ERROR`
- 300 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 20 matching entries: `resource.labels.service_name="webhookpublishthemegen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.29

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
