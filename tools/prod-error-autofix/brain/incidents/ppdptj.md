fingerprint: ppdptj
service: apiv2
message: [startImageGeneration] Zak8jfdr45njfdw0ogBU Failed to generate image Error: 400 The response was filtered due to the prompt triggering our content management policy.
app: BLOG
repo: blogs
date: 2026-09-04T22:09:13.804Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · ppdptj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: OpenRouter's meta/muse-image provider rejected one content-image prompt with HTTP 400 'The response was filtered due to the prompt triggering our content management policy', and startImageGeneration's catch already handles that per-image miss (pushes an {error} descriptor onto the SSE stream) but logs it at logger.error, so a handled, non-fatal event reaches the severity>=ERROR alert sink.

**Mechanism.** callModelNode streams the blog and fires one startImageGeneration per image descriptor; generateImageForDescriptor calls generateOpenRouterImage with model meta/muse-image (OPENROUTER_MUSE_IMAGE). Inside singleCall the OpenRouter POST /images returned an openai-SDK APIError with status 400; isRetryable only accepts 429/5xx/retryableEmptyImage, so image.js:86 throws immediately (correct fail-fast). The throw lands in startImageGeneration's catch at callModelNode.js:195, which logs at logger.error (:196) and then reports the failure back through onImageGenerated as {...descriptor, error} (:202-207) — the generation continues. The prod stack confirms containment: 'at async Promise.allSettled (index 1)' means this was one settled branch of a multi-image fan-out, and the requests read for the same window has 0 entries with httpRequest.status>=500, so no HTTP request failed. logger.error emits severity=ERROR (helpers/logger.js header comment), so the alert sink matched it.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:196` — logger.error on an already-handled per-image failure — the line that fired the alert
- `packages/functions/src/langgraph/nodes/callModelNode.js:202` — same catch reports the failure to the client via onImageGenerated({...descriptor, error}) — proof the failure is contained, not fatal
- `packages/functions/src/langgraph/nodes/callModelNode.js:138` — generateImageForDescriptor issues the failing call with model OPENROUTER_MUSE_IMAGE, matching the stack frame generateImageForDescriptor -> generateOpenRouterImage
- `packages/functions/src/services/openrouter/image.js:86` — non-retryable branch: a 400 is rethrown on attempt 0, matching stack frame singleCall
- `packages/functions/src/services/openrouter/image.js:12` — isRetryable accepts only 429/5xx/retryableEmptyImage, so the provider content-filter 400 is never retried
- `packages/functions/src/const/aiModels.js:24` — OPENROUTER_MUSE_IMAGE = 'meta/muse-image' — the image model whose provider content filter returned the 400

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-09-04T21:50:29.641Z" AND timestamp<="2026-09-04T22:20:29.641Z" AND severity>=ERROR`
- 2 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-09-04T21:50:29.641Z" AND timestamp<="2026-09-04T22:20:29.641Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $2.21

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
