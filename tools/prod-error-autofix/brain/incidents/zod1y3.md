fingerprint: zod1y3
service: webhookpublishthemegen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T08:07:24.511Z
status: infra
attempt: 1

# SEO · webhookpublishthemegen2 · zod1y3

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault in avada-seo/us-central1 during the 2026-08-14 04:00–05:00Z hour made webhookpublishthemegen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 3 Shopify themes/publish webhook POSTs waiting on those cold starts were answered 503 'instance failed the readiness check'.

**Mechanism.** webhookPublishThemeGen2 is declared onRequest({memory: '1GiB', ...vpcSettings}, themeHook) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:122), so every Shopify themes/publish delivery at zero warm instances pays a full cold start. In the pulled window all 3 failures are POST /webhook/publishTheme with latency 241.132166s, 243.156307s and 243.375765s — the 240s Cloud Run startup-probe deadline plus scheduling (P4: the latency identifies which limit fired), each on a distinct instanceId (…cd8387313f, …0d7c830cc5, …6abb760334) that had just logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_'. 4 such probe failures appear across 4 distinct instanceIds and TWO revisions of unchanged code (00318-zaz ×3, 00319-cop ×1), which rules out a code regression in either revision. Not this service's code: fleet-wide the identical probe-failure line fired 593 times across ~46 avada-seo services in that one hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, …, webhookpublishthemegen2 4) against just 2 entries in the whole preceding 03:00Z hour — a bounded platform window already recorded under 1r74ll6, muzsov, 1470mjt, 8g3u6t, e9i6k0, 1bwfmw9, 1mprni, 1tesetr. P3 OOM ruled out: zero 'Memory limit' lines on this service for the whole day. The stderr read is 0 entries because the container dies before module load, and the same service logged 20 successful startup probes the same day, so the image boots. Blast radius: the handler at packages/functions/src/handlers/webhook/themeHook.js:9 was never entered, so no partial writes — the theme-backup state check in publishTheme simply did not run for those 3 publishes; Shopify retries themes/publish webhooks.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:122` — webhookPublishThemeGen2 export — the Cloud Run service whose cold starts failed the startup probe; {memory: '1GiB', ...vpcSettings} with no minInstances, so each Shopify webhook delivery pays a full cold start, and 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/webhook/themeHook.js:9` — the request handler for POST /webhook/publishTheme — never reached; the container died before listen()
- `packages/functions/src/handlers/webhook/themeHook.js:24` — publishTheme() — the backup-state reconcile that did not run for the 3 dropped webhook deliveries; blast radius is bounded to that, no partial write

## Evidence
- 3 matching entries: `(resource.labels.service_name="webhookpublishthemegen2") AND timestamp>="2026-08-14T04:20:57.580Z" AND timestamp<="2026-08-14T04:50:57.580Z" AND httpRequest.status>=500`
- 10 matching entries: `(resource.labels.service_name="webhookpublishthemegen2") AND timestamp>="2026-08-14T04:20:57.580Z" AND timestamp<="2026-08-14T04:50:57.580Z" AND severity>=ERROR`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 20 matching entries: `resource.labels.service_name="webhookpublishthemegen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.33

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
