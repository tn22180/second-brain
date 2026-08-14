fingerprint: kjv3nd
service: extensiongen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T06:20:17.802Z
status: infra
attempt: 1

# SEO · extensiongen2 · kjv3nd

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 1r74ll6 (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 made extensiongen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 15 Shopify Flow POSTs /extension/flow/optimize-alt waiting on those cold starts were answered 503 'instance failed the readiness check' (plus 2 fast 500s from 'no available instance').

**Mechanism.** This alert's pulled window (04:08:39–04:38:39Z) covers the identical event already recorded as 1r74ll6 (window 04:03:16–04:33:16Z): the same 17 failed requests, timestamp for timestamp — 15× 503 from 04:13:58.342401Z to 04:23:01.628639Z plus 2× 500 at 04:16:12.949873Z and 04:16:27.986504Z, all POST /extension/flow/optimize-alt, all on revision extensiongen2-00318-kiv. Only the alert text differs ('instance failed the readiness check' here vs the STARTUP-probe line there), so the HTTP-fallback fingerprint differs while the incident does not. Mechanism unchanged: extensionGen2 is declared onRequest({timeoutSeconds: 60, memory: '1GiB', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:130-133), so every Shopify Flow burst at zero warm instances pays a full cold start. 29 of the 49 error entries in this window are 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' across 30 distinct instanceIds and TWO revisions of unchanged code (00318-kiv ×36, 00319-jax ×11). Every 503 carries latency 241.107–246.123s — the 240s probe deadline plus scheduling (P4: the latency identifies which limit fired). Not this service's code: fleet-wide the same probe-failure line fired across 46 avada-seo services in the 04:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, …) against just 2 entries in the whole 03:00Z hour — a bounded platform window already recorded under 1r74ll6, muzsov, 1470mjt, 8g3u6t, e9i6k0, 1bwfmw9, 1mprni. P3 OOM ruled out: zero 'Memory limit' lines on extensiongen2, and stderr for the window is 0 entries because the container dies before module load; the same service logged 13 successful startup probes the same day, so the image boots. Blast radius: Shopify Flow's optimize-alt action failed for the affected shops for ~9 minutes; the handler at packages/functions/src/routes/extension.js:7 was never entered, so no partial writes, and Flow retries the action.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:130` — extensionGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:131` — {timeoutSeconds: 60, memory: '1GiB', ...vpcSettings} — no minInstances, so each Shopify Flow burst pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/routes/extension.js:7` — POST /flow/optimize-alt — the only path in all 17 failed requests; never reached, the container died before listen()

## Evidence
- 17 matching entries: `(resource.labels.service_name="extensiongen2") AND timestamp>="2026-08-14T04:08:39.980Z" AND timestamp<="2026-08-14T04:38:39.980Z" AND httpRequest.status>=500`
- 49 matching entries: `(resource.labels.service_name="extensiongen2") AND timestamp>="2026-08-14T04:08:39.980Z" AND timestamp<="2026-08-14T04:38:39.980Z" AND severity>=ERROR`
- 578 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 13 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
