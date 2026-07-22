---
name: seo-prod-error-slack-pipeline
description: "seo prod error-log → Slack alert pipeline; errorHandler didn't log so alerts showed [no message]; temp fixes shipped, root fixes pending"
metadata: 
  node_type: memory
  type: project
  originSessionId: c766cfbf-4c65-453b-933f-26cc4c2ce992
---

seo repo (avada-seo). Prod errors route: Cloud Logging sink (`prod-error-alerts`, severity>=ERROR) → Pub/Sub `prod-error-logs` → `handleProdErrorAlertGen2` → Slack. Core: `services/prodErrorAlertService.js`, infra `scripts/setup-prod-error-alerts.sh`.

**Root gotcha:** `middleware/errorHandler.js` caught every uncaught error but never `logger.error`d it — only `emit('error')`. So message/stack never reached Cloud Logging; the only ERROR signal was the payload-less `run.googleapis.com/requests` HTTP 5xx entry → alert fingerprinted to one useless `app error[no message] ×N` bucket. Also 504 = timeout kills process, NOT an exception → errorHandler.catch never runs; only the request-log surfaces it.

**Shipped 2026-07-22 (merged + deployed prod):**
- MR `fix/prod-error-alert-no-message`: errorHandler logs uncaught (5xx→error feeds sink, 4xx→warn stays below threshold); `extractMessage` falls back to `entry.httpRequest` → `HTTP 500 POST /api/x`, fingerprint per route.
- MR `fix/optimize-endpoints-500-504`: temp-wrapped `getCountData` + `getPreview` (no try/catch → raw 500; getPreview `products[0].image` no optional-chain crashes empty-product shops) in try/catch returning graceful 200; `scanFeaturePageSpeedWorking` Puppeteer capped with 60s Promise.race (was hanging to 540s fn timeout → gateway 504).

**Pending root fixes** (temp only — now that logs carry the real message): identify the actual throw in getCountData/getPreview from prod logs; move pageSpeed scan to async queue (`dispatchWork`) instead of inline Puppeteer. `/api/*` and `/apiSa/*` share one router (`getRoutes(prefix)` in routes/api.js) — one handler fix covers both.

**Packaged for all 5 apps (2026-07-22, tony-wf):** new lib `~/Documents/second-brain/projects/Falcon/avada-prod-error-alert/` (`@avada/prod-error-alert`, own git, NOT yet pushed/published). DI core (createErrorAlertHandler injects appName/firestore/sendSlack/channelId), 7 units + 27 jest tests, builds CJS. Adds: httpRequest fallback, **cloud_run_job** support (resolveService + sink `NOT service_name="self"` not `!=`), appName-first Slack label for one shared `#prod-errors` channel. Includes parametrized `scripts/setup-prod-error-alerts.sh` + porting skill `skill/SKILL.md` (gen1/gen2 auto-detect, errorHandler patch, image-optimizer has no slackService gap). All 5 apps wired onto the lib (dep `^0.1.0`), each on branch `feat/prod-error-alert` (SEO: `feat/prod-error-alert-lib`), all pushed to their GitLab, MRs not yet created:
- SEO `seo` — routed through lib, sink +cloud_run_job, bespoke prodErrorAlertService.js + errorAlertRepository.js DELETED (const/prodErrorAlert.js kept for PROD_ERROR_TOPIC). gen2.
- BLOG `blogs`, APC `ai-product-copy` — gen2 `onMessagePublished`, registered in functions/pubsub.js (BLOG) / index.js (APC).
- AEO `llm-ai-search-seo` — **gen1** `functions.runWith().pubsub.topic().onPublish()` in index.js (repo is gen1); index.js change → CI deploy-all.
- IMG-OPT `avada-image-optimizer` — had NO Slack; added config/slack.js + services/slack/slackService.js (axios). gen2.
- BLOG/APC/AEO slackService gained optional `blocks` passthrough. All errorHandler.js patched (5xx→error, 4xx→warn).
Spec+plan in `avada-prod-error-alert/docs/`. Lib repo has NO remote yet. Out-of-session: create lib remote + publish to registry.avada.io, then `yarn`/deploy each app; create Slack `#prod-errors` + shared bot, set SLACK_ERROR_CHANNEL_ID + SLACK_BOT_TOKEN per app; run `PROJECT=<id> APP_NAME=<name> scripts/setup-prod-error-alerts.sh` per project.

glab has no token on this machine → create MRs via the push-time GitLab URL, can't use `glab mr create`. See [[seo-master-no-detect-worker]] for GLAB_TOKEN note (not found in speed-up-report .env this session).
