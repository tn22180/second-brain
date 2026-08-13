fingerprint: yo3dfr
service: lighthouseauditrunnergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-12T20:13:36.922Z
status: mr_open
attempt: 2

# SEO · lighthouseauditrunnergen2 · yo3dfr

**Outcome.** duplicate of 1445nxy — MR https://gitlab.com/avada/seo/-/merge_requests/2102

**Root cause.** Two distinct causes share this 30-minute window: the 2 alerted 503s are infra (cold-start containers exceeding Cloud Run's 240s startup TCP probe deadline), while the 500 in the same window is a code defect — `launchBrowser()` sits OUTSIDE performAudit's try block, so puppeteer's 30s launch timeout escapes the controller's catch and reaches errorHandler, which then throws `TypeError: ctx.render is not a function` because lightHouseAuditHandler registers no view engine.

**Mechanism.** GET /lighthouse/auditNew → runAuditNew → performAudit (controllers/lightHouseController.js:101). Line 102 `const browser = await launchBrowser();` is evaluated BEFORE `try {` at :103, so a rejection from puppeteer.launch (helpers/launchBrowser at :38, no `timeout` option → puppeteer default 30000ms) can never be caught by the `catch (e) { return handleAuditError(ctx, e) }` at :127, and the `finally { await browser.close() }` at :129 is never entered either. The rejection propagates to createErrorHandler's `await next()` (middleware/errorHandler.js:11). The caller is the SEO app itself (`userAgent: node`) and does not send `Accept: application/json`, so the JSON branch at :22 is skipped and execution reaches `await ctx.render('error', ...)` at :30. lightHouseAuditHandler.js builds a bare Koa app with only createErrorHandler + a router (no koa-views) — ctx.render is undefined — so the handler itself throws `TypeError: ctx.render is not a function` inside the catch, Koa's default handler answers a bodiless 500, and the caller gets no parseable error instead of the intended 200 `{data: [], error: <message>}`. Counted in 24h on 2026-08-12: 8 'waiting for the WS endpoint URL' stderr lines = 4 occurrences (each writes an `[unhandledError]` line plus a stack line), 4 `ctx.render is not a function` lines — exact 1:1 — against 5 total 500s. Two of those 500s carry latency 30.111s and 30.186s, matching puppeteer's 30000ms launch default to the millisecond. SEPARATELY, and NOT fixed by this: the 2 alerted 503s (latency 241.155s and 245.144s) match the service's `startupProbe.timeoutSeconds: 240 / failureThreshold: 1` (verified via `gcloud run services describe`); 225 'Default STARTUP TCP probe failed ... DEADLINE_EXCEEDED' entries in the same 24h against 289 total requests, on a revision configured `cpu: "1"`, `memory: 4Gi`, `containerConcurrency: 1`, no minScale — so every audit cold-starts a fresh 1-vCPU container that must boot the full src/ graph plus Chrome. That half is infra: suggest cpu 1→2 and minInstances 1 on lighthouseauditrunnerGen2, Tuan's call.

Confidence: `high`

## Code
- `packages/functions/src/controllers/lightHouseController.js:102` — `const browser = await launchBrowser();` is outside the try that starts at :103 — a launch rejection bypasses handleAuditError entirely
- `packages/functions/src/controllers/lightHouseController.js:127` — the catch that was meant to answer 200 {data: [], error} never sees the launch failure
- `packages/functions/src/controllers/lightHouseController.js:38` — puppeteer.launch called with no `timeout` option, so the 30000ms default fires — matches the two 30.11s/30.19s 500 latencies
- `packages/functions/src/middleware/errorHandler.js:30` — `await ctx.render('error', ...)` — the second TypeError; this is lib/middleware/errorHandler.js:40 in the prod stack
- `packages/functions/src/handlers/lightHouseAuditHandler.js:9` — the Koa app mounts createErrorHandler but registers no view engine, so ctx.render is undefined on every non-JSON error on this service
- `packages/functions/src/handlers/exports/httpFunctions.js:73` — lighthouseauditrunnerGen2 declared concurrency: 1 with no minInstances — the infra half: every request cold-starts a container that must clear the 240s startup probe

## Evidence
- 4 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND textPayload:"ctx.render is not a function"`
- 8 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND textPayload:"waiting for the WS endpoint URL"`
- 5 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND httpRequest.status=500`
- 225 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 2 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-12T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND httpRequest.status=503`

## Job
- analyze rounds: 1
- cost: $1.93
- MR: https://gitlab.com/avada/seo/-/merge_requests/2102

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
