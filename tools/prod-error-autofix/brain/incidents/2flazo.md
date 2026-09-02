fingerprint: 2flazo
service: auth
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: BLOG
repo: blogs
date: 2026-09-01T15:46:56.132Z
status: infra
attempt: 1

# BLOG · auth · 2flazo

**Outcome.** infra class — reported, no MR

**Root cause.** Not a code defect: auth is declared with concurrency 10 and no minInstances, so at its ~0.9 rps / 0.17s median it runs on exactly one warm instance — when that instance (…ef94c3, 482 consecutive 200s) stopped at 15:28:58.873Z the service had zero ready instances for 74 seconds and Cloud Run shed 108 Shopify webhook deliveries (75×429 + the 33 alerted 500 'no available instance').

**Mechanism.** packages/functions/src/functions/http.js:49 sets auth to {memory:'512MiB', cpu:1, timeoutSeconds:120, maxInstances:5, concurrency:10} with no minInstances, and packages/functions/src/globalOptions.js:5 sets only region/VPC — `grep -rn minInstances packages/functions/src` returns zero hits, so nothing supplies a warm floor. Traffic is 785 requests / 15 min (0.87 rps) at 0.173s median, i.e. ~0.15 concurrent slots against 50 available (5×10), so the autoscaler keeps one instance. Instance …ef94c3 served every request from 15:15:02.185Z to 15:28:58.873Z (482 requests, all 200). It then stopped; the next request at 15:29:02.559Z had no instance to land on and every request until 15:30:16.559Z was rejected at the frontend with httpRequest.latency '0s' and no instanceId label — 75 got 429, 33 got the alerted 500 'no available instance'. Replacements only began accepting at 15:30:10.456Z (…9734cd) and their first requests ran 61.0–67.6s (accepted 15:30:19–15:30:25, application stdout for them flushing at 15:31:27–15:31:28 alongside '[redis.service] connected 34.60.93.33'), i.e. full cold-start of the auth handler's import graph (packages/functions/src/handlers/auth.js:36 shopifyAuth + Firestore/redis init) under a 10-deep queued burst. Peak real concurrency across the whole window was 8 — maxInstances 5 was never approached, so this is a cold-start gap, not saturation. All 33 are POST /auth/webhook/shop/update from Shopify-Captain-Hook, which retries, so merchant-visible impact is bounded.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:49` — auth runtime options — concurrency 10, maxInstances 5, and no minInstances: the only place a warm floor could be set for this service
- `packages/functions/src/functions/http.js:48` — the `export const auth = onRequest(` declaration whose options object above governs the auth Cloud Run service that shed the 33 requests
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions supplies only region and VPC connector — no fleet-wide minInstances, confirming nothing else keeps an auth instance warm
- `packages/functions/src/handlers/auth.js:36` — the shopifyAuth mount that every cold start must build (Firestore, redis, plans, install/uninstall services) — why the replacement containers needed ~60s before their first response

## Evidence
- 114 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-09-01T15:29:02Z" AND timestamp<="2026-09-01T15:30:17Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests"`
- 482 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-09-01T15:15:00Z" AND timestamp<="2026-09-01T15:29:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests" AND httpRequest.status=200`
- 785 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-09-01T15:20:00Z" AND timestamp<="2026-09-01T15:35:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests"`
- 33 matching entries: `(resource.labels.service_name="auth") AND timestamp>="2026-09-01T15:15:35.872Z" AND timestamp<="2026-09-01T15:45:35.872Z" AND textPayload:"no available instance"`
- 60 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-09-01T15:31:20Z" AND timestamp<="2026-09-01T15:31:35Z" AND logName:"stdout"`

## Job
- analyze rounds: 2
- cost: $3.29

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
