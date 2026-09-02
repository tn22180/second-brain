fingerprint: 7zue8o
service: savealtversionsubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T17:27:01.217Z
status: infra
attempt: 1

# SEO · savealtversionsubscribergen2 · 7zue8o

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 18882z (same service, same revision savealtversionsubscribergen2-00343-rad, same five cold-start instances, same 17:13–17:24Z window): a platform-side container-filesystem fault in avada-seo/us-central1 made Node's readFileSync return `EIO: i/o error` while loading the function bundle, so cold-start containers never bound :8080 and Cloud Run answered the waiting saveAltVersion Pub/Sub pushes 503 'instance failed the readiness check'.

**Mechanism.** This alert's window (17:02:45–17:32:45Z) is a superset of the window already recorded as 18882z (17:02:32–17:32:32Z): same 5 requests (503 at 17:13:18.004807Z, 17:17:54.618962Z, 17:22:14.828854Z, 17:23:31.834192Z, 17:23:57.032462Z), same 5 STARTUP-probe failures, same revision -00343-rad, same instance ids (00a41e8c1db0f7, …1dcfab, …1d1f0f, …1d2d2c, …1d4299). Only the alerted message differs — 'The request failed because the instance failed the readiness check' (the httpRequest line) vs 'Default STARTUP TCP probe failed…' (the probe line) — so the HTTP-fallback fingerprint differs while the incident does not (P7: the fingerprint is derived from the alerted text, not the cause). Chain: saveAltVersionSubscriberGen2 is declared onMessagePublished({memory:'2GiB', timeoutSeconds:540, topic:'saveAltVersion', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:402-404 with no minInstances, so every saveAltVersion message arriving at zero warm instances pays a full cold start. Three of those cold starts printed, in the stderr read, `Provided module can't be loaded.` / `Is there a syntax error in your code?` / `Detailed stack trace: Error: EIO: i/o error, read` with frames `at Object.readFileSync (node:fs:440:20)` → `defaultLoadImpl (node:internal/modules/cjs/loader:1122:17)` → `loadSource (…:1808:20)` → `Object..js (…:1906:44)` → `Module.load` → `Function._load` → `wrapModuleLoad` → `Module.require` → `require (node:internal/modules/helpers:147:16)`, bottoming out in third-party module loads only — /workspace/node_modules/@avada/shopify-api/dist/index.js:5:39 (17:23:09.436Z), .../dist/auth/oauth/oauth.js:7:41 (17:23:33.613Z), .../dist/auth/oauth/oauth.js:8:17 (17:24:04.496Z) — followed by 'Could not load the function, shutting down.'. No frame from this repo's src/ appears: the read fails inside Node's CJS loader before any application module executes, so no code in this worktree can produce it. The containers therefore never reached listen(); Cloud Run's startup TCP probe killed each ('Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' ×5, two with DEADLINE_EXCEEDED at 17:17:30.782971Z / 17:21:54.866324Z, three with CANCELLED). The two long 503s carry latency 252.192768s and 243.314122s ≈ the 240s startup-probe deadline plus scheduling (P4: the latency identifies which limit fired); the three short ones (55.147772s, 2.221084s, 8.249111s) are pushes that arrived after the probe had already started failing and were cut when the container aborted. Not service-specific: in 16:50–17:40Z the same `EIO: i/o error` line fired 16 times across 11 distinct avada-seo services on different revisions and images — savealtversionsubscribergen2 ×3, handlehooksubscribergen2 ×4, changelogtriggers-subscriptions ×2, bulkauditfixapplygen2 ×2, proxygen2, oncreateusergen2, scanspeedscoresubscriberv2gen2, resumestuckbulkfixjobsgen2, apigen2 — and the apigen2 one at 17:22:56.229834Z came from a warm dynamic require(), which proves the bad reads are the container filesystem, not this bundle. P3 OOM ruled out: zero 'Memory limit' lines on this service in the full 24h against a declared 2GiB, and an OOM leaves no log at all whereas here the loader printed its EIO stack. Revision -00343-rad was deployed 2026-08-28, 4 days before the alert, so no deploy is involved, and 9 cold starts of this same service succeeded elsewhere on 2026-09-01 (00:19Z through 13:51Z). Blast radius bounded: Pub/Sub redelivers a 503'd push, so alt-text version snapshots are delayed by minutes, not lost. Same platform window already recorded under 18882z / 1v639fk / vzfm82 / 2p53oz / 1esj5e / 1qrdito.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:402` — saveAltVersionSubscriberGen2 export — the Cloud Run service whose cold starts failed the readiness check
- `packages/functions/src/handlers/exports/pubsubFunctions.js:403` — {memory:'2GiB', timeoutSeconds:540, topic:'saveAltVersion', ...vpcSettings} — no minInstances, so every saveAltVersion message at zero warm instances pays a full cold start; 2GiB with zero 'Memory limit' lines in 24h rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:404` — wrapPubSub(subscribeSaveAltVersion) — the handler the failed containers would have run; never entered, the EIO fired in Node's CJS loader before any app module executed
- `packages/functions/src/handlers/exports/pubsubFunctions.js:60` — import of subscribeSaveAltVersion — this repo's only entry into the saveAltVersion path, absent from every stack frame in the window

## Evidence
- 5 matching entries: `(resource.labels.service_name="savealtversionsubscribergen2") AND timestamp>="2026-09-01T17:02:45.136Z" AND timestamp<="2026-09-01T17:32:45.136Z" AND httpRequest.status>=500`
- 10 matching entries: `(resource.labels.service_name="savealtversionsubscribergen2") AND timestamp>="2026-09-01T17:02:45.136Z" AND timestamp<="2026-09-01T17:32:45.136Z" AND severity>=ERROR`
- 42 matching entries: `(resource.labels.service_name="savealtversionsubscribergen2") AND timestamp>="2026-09-01T17:02:45.136Z" AND timestamp<="2026-09-01T17:32:45.136Z" AND logName:"stderr"`
- 16 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T16:50:00Z" AND timestamp<="2026-09-01T17:40:00Z" AND textPayload:"EIO: i/o error"`
- 9 matching entries: `resource.labels.service_name="savealtversionsubscribergen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
