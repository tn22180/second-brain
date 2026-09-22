fingerprint: da9qai
service: api
message: [getVisionCompletion] Error: 413 Request body exceeds the provider maximum size: 23234402 bytes exceeds the 20000000 byte limit for Google AI Studio
app: BLOG
repo: blogs
date: 2026-09-21T15:17:22.977Z
status: fix_disabled
attempt: 1

# BLOG · api · da9qai

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** No request failed: the alerted 413 is a per-image vision failure that getVisionCompletion swallows — it catches, logs at logger.error, and returns null, so generateImageAltText skips that one image and POST /api/audit-agent/fix-issue still answers 200 with the image's alt text silently still missing.

**Mechanism.** generateImageAltText scrapes <img src> out of the article HTML and hands each src straight to getVisionCompletion with no size or content-type guard (chains.js:499-502). getVisionCompletion sends it as image_url.url (openAi.service.js:241) on model resolveModel('gpt-4o-mini'), which LEGACY_MODEL_MAP rewrites to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (openAi.service.js:32) — a Google AI Studio route, which is exactly the provider the error names. OpenRouter inlines the image for that provider and the upstream body reaches 23,234,402 bytes against Google AI Studio's 20,000,000 byte cap → HTTP 413. The catch at openAi.service.js:250 logs '[getVisionCompletion]' at logger.error and returns null (openAi.service.js:252); the `if (altText)` guard at chains.js:504 is false, so bodyHtml is returned with that img tag untouched, the loop continues to the next image, and fixAuditIssue's handler map (auditAgentController.js:96) resolves normally. Confirmed against the request log: the 413 at 15:13:17.905512Z falls inside the fix-issue request that started at 15:13:11.30Z and finished 200 in 18.327195518s at 15:13:29.628542Z, and all 16 /api/audit-agent/fix-issue calls in the 30-minute window returned 200 (0 entries with status>=500).

Confidence: `high`

## Code
- `packages/functions/src/services/auditAgent/chains.js:499` — generateImageAltText passes img.src from the article HTML into getVisionCompletion with no size, extension or content-type pre-check — the call that produced the 413
- `packages/functions/src/services/auditAgent/chains.js:504` — `if (altText)` — null from the swallowed 413 makes the image silently keep its missing alt; bodyHtml is returned unchanged for it
- `packages/functions/src/services/auditAgent/chains.js:486` — up to 18 images per call, each an unguarded vision request; explains the 42.4s and 18.3s fix-issue latencies in the window
- `packages/functions/src/services/openAi.service.js:241` — the image_url content part OpenRouter inlines for the Google AI Studio provider, producing the 23,234,402-byte upstream body
- `packages/functions/src/services/openAi.service.js:32` — LEGACY_MODEL_MAP maps the default 'gpt-4o-mini' to DEFAULT_TEXT_MODEL (google/gemini-2.5-flash-lite) — why a vision call lands on Google AI Studio and its 20MB body cap
- `packages/functions/src/services/openAi.service.js:251` — logger.error on a fully handled, non-fatal per-image path — this line is what fired the ERROR sink and the Slack alert
- `packages/functions/src/services/openAi.service.js:252` — returns null, so the 413 never reaches the caller and the request completes 200
- `packages/functions/src/services/openrouter/vision.js:10` — the sibling vision helper already has a shouldSkip guard (.svg/.ico) and retry classification; the audit-agent path does not use it
- `packages/functions/src/controllers/auditAgentController.js:96` — TEXT_IMAGES dispatches to generateImageAltText; its resolved value is treated as success regardless of how many images were skipped

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getVisionCompletion]" AND timestamp>="2026-09-14T00:00:00Z" AND timestamp<="2026-09-21T16:00:00Z"`
- 16 matching entries: `resource.labels.service_name="api" AND logName:"requests" AND httpRequest.requestUrl:"audit-agent/fix-issue" AND timestamp>="2026-09-21T14:58:00Z" AND timestamp<="2026-09-21T15:28:00Z"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-21T15:13:10Z" AND timestamp<="2026-09-21T15:13:31Z"`

## Job
- analyze rounds: 1
- cost: $2.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
