fingerprint: 1rv4tdz
service: apiv2
message: [createFeaturedImageNode] sd120NQwTxuuD9ytMdWk Failed to generate featured image Error: 400 The response was filtered due to the prompt triggering our content management policy.
app: BLOG
repo: blogs
date: 2026-09-27T03:55:41.035Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · 1rv4tdz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: OpenRouter's meta/muse-image provider rejected this shop's image prompts with HTTP 400 "The response was filtered due to the prompt triggering our content management policy", and both catch sites that already handle that per-image miss (createFeaturedImageNode's hero-image catch and callModelNode's startImageGeneration catch) log it at logger.error, so a handled, non-fatal event reaches the severity>=ERROR alert sink.

**Mechanism.** One LangGraph blog run for shop sd120NQwTxuuD9ytMdWk produced 5 content-filter 400s in 33 seconds (03:51:14.497Z → 03:51:47.141Z), all from the same provider call: client.post('/images') inside singleCall (services/openrouter/image.js:82). isRetryable (image.js:12) only accepts 429/5xx/retryableEmptyImage, so a 400 is rethrown on attempt 0 at image.js:86 — correct fail-fast, matching stack frame `async singleCall (/workspace/lib/services/openrouter/image.js:92)`. Two callers catch it. (a) The alerted one: generateHeroImage calls generateOpenRouterImage with model OPENROUTER_MUSE_IMAGE (createFeaturedImageNode.js:13, stack frame generateHeroImage at lib/.../createFeaturedImageNode.js:29); the throw lands in the catch at createFeaturedImageNode.js:103, which logs at logger.error (:104) and then emits {status:'error'} to the client over SSE (:110-115) while `heroImage` stays the text-only `fallback` built at :83, so the node still returns a featuredImage (:127) and the graph continues. (b) 4 sibling entries with tag [startImageGeneration] are the inline content images, same model (callModelNode.js:141), caught at callModelNode.js:196 and reported to the client via onImageGenerated({...error}) (:203); their stack frames read `Promise.allSettled (index 0/1/2/5)`, and the awaited fan-out is Promise.allSettled (callModelNode.js:480), so no branch can reject the run. logger.error emits severity=ERROR (helpers/logger.js:5-9 header), which is exactly what the prod-error-alerts sink matches. The requests read for the same 30-minute window returned 0 entries with httpRequest.status>=500 — no HTTP request failed, consistent with apiv2 setting ctx.status=200 before streaming SSE.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:104` — logger.error on an already-handled featured-image failure — the line that fired this alert
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:110` — same catch reports the failure to the client as {status:'error'} over SSE — proof the failure is contained, not fatal
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:127` — node still returns featuredImage (the text-only fallback parsed at :83), so the blog run completes without a hero image
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:13` — generateHeroImage issues the failing call with OPENROUTER_MUSE_IMAGE, matching stack frame generateHeroImage -> generateOpenRouterImage
- `packages/functions/src/services/openrouter/image.js:86` — non-retryable branch: the content-filter 400 is rethrown on attempt 0, matching stack frame singleCall
- `packages/functions/src/services/openrouter/image.js:12` — isRetryable accepts only 429/5xx/retryableEmptyImage, so a provider content-filter 400 is never retried
- `packages/functions/src/const/aiModels.js:24` — OPENROUTER_MUSE_IMAGE = 'meta/muse-image' — the image model whose provider content filter returned the 400
- `packages/functions/src/langgraph/nodes/callModelNode.js:196` — the 4 sibling [startImageGeneration] entries in the same window come from this second logger.error on the same handled provider 400
- `packages/functions/src/langgraph/nodes/callModelNode.js:480` — the image fan-out is awaited with Promise.allSettled, so no rejected image branch can fail the run — matches the 'Promise.allSettled (index N)' stack frames
- `packages/functions/src/helpers/logger.js:5` — logger.error writes JSON with severity, which is why a handled event matches the severity>=ERROR prod-error-alerts sink

## Evidence
- 5 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-09-27T03:36:47.955Z" AND timestamp<="2026-09-27T04:06:47.955Z" AND jsonPayload.message:"content management policy"`
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-09-27T03:36:47.955Z" AND timestamp<="2026-09-27T04:06:47.955Z" AND jsonPayload.tag="[createFeaturedImageNode]"`
- 5 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-09-27T03:36:47.955Z" AND timestamp<="2026-09-27T04:06:47.955Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
