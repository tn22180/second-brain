fingerprint: 1gbu5l7
service: partnerintegrationsubscribergen2
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-09-01T17:46:08.474Z
status: infra
attempt: 1

# SEO · partnerintegrationsubscribergen2 · 1gbu5l7

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem fault swept avada-seo/us-central1 during 2026-09-01T17:15–17:45Z — cold-start containers got `EIO: i/o error, read` from readFileSync while Node loaded node_modules, so the functions-framework aborted before binding :8080 and Cloud Run failed the STARTUP TCP probe.

**Mechanism.** All 112 app-side log entries in the window belong to one revision, partnerintegrationsubscribergen2-00350-jed — no deploy, no code change. 6 cold-start containers each printed the identical sequence `Provided module can't be loaded.` → `Detailed stack trace: Error: EIO: i/o error, read` → `at Object.readFileSync (node:fs:440:20)` → `Could not load the function, shutting down.` The failing frame is a DIFFERENT third-party module every time — googleapis/build/src/apis/indexing/index.js:18, @shopify/koa-shopify-webhooks/build/cjs/index.js:5, @avada/core/build/services/authService.js:85, @avada/shopify-api/dist/index.js:7, firebase-admin/lib/database/index.js:20, @avada/shopify-api/dist/auth/session/index.js:4 — and zero frames land in /workspace/lib (this repo's babel output). A code or syntax defect would fail deterministically at the same module; a read error at random offsets in the image layer is the container filesystem. Each aborted load is followed 1–2s later by `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080` (9 in the window), and the Pub/Sub push for topic partnerIntegration then gets the alerted 500/503 `The request failed because the instance could not start successfully` / `failed the readiness check` (17 request-log 5xx). The fault is not confined to this service: a project-wide query over the same 31 minutes returns 76 EIO lines across 14 distinct Cloud Run services (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, …). Nothing in this repo is shared by those 14 services except the GCP zone. Same family as recorded fingerprint 13ojanr (same service, same day, 15:02–17:xx window).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:317` — The only declaration of partnerIntegrationSubscriberGen2 (topic 'partnerIntegration', memory 1GiB, timeoutSeconds 540). Its handler never ran — the container died during module load — so no config here is implicated; cited to show the alerted service is an ordinary gen2 Pub/Sub subscriber with no startup work of its own.
- `packages/functions/src/controllers/auditController.js:14` — Only producer for the partnerIntegration topic (dispatchWork). Confirms the failed POSTs are ordinary Pub/Sub pushes, not merchant traffic, and that they are redelivered — no data lost.

## Evidence
- 6 matching entries: `(resource.labels.service_name="partnerintegrationsubscribergen2") AND timestamp>="2026-09-01T17:15:35.365Z" AND timestamp<="2026-09-01T17:45:35.365Z" AND textPayload:"EIO: i/o error"`
- 6 matching entries: `(resource.labels.service_name="partnerintegrationsubscribergen2") AND timestamp>="2026-09-01T17:15:35.365Z" AND timestamp<="2026-09-01T17:45:35.365Z" AND textPayload:"Could not load the function, shutting down."`
- 76 matching entries: `timestamp>="2026-09-01T17:15:00Z" AND timestamp<="2026-09-01T17:46:00Z" AND textPayload:"EIO: i/o error"`
- 9 matching entries: `(resource.labels.service_name="partnerintegrationsubscribergen2") AND timestamp>="2026-09-01T17:15:35.365Z" AND timestamp<="2026-09-01T17:45:35.365Z" AND textPayload:"STARTUP TCP probe failed"`
- 17 matching entries: `(resource.labels.service_name="partnerintegrationsubscribergen2") AND timestamp>="2026-09-01T17:15:35.365Z" AND timestamp<="2026-09-01T17:45:35.365Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.45

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
