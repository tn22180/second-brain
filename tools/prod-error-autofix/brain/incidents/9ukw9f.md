fingerprint: 9ukw9f
service: apiv2
message: [createFeaturedImageNode] oLdA3vaMrRgKECuG3K09 Failed to build featured image brief Error: Failed to parse featured image brief: Given the extremely sparse knowledge base, I will infer a neutral, photo-realistic editorial scene with a warm and inviting mood, common for e-commerce.
app: BLOG
repo: blogs
date: 2026-08-12T17:54:52.404Z
status: deferred
attempt: 1

# BLOG · apiv2 · 9ukw9f

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** The OpenRouter model prefixed its featured-image JSON with a prose sentence ("Given the extremely sparse knowledge base, I will infer a neutral, photo-realistic editorial scene..."), and createFeaturedImageNode's parse path only strips code fences before calling bare JSON.parse, so the otherwise-valid JSON object was thrown away and the node returned featuredImage: undefined.

**Mechanism.** buildFeaturedImagePrompt renders PROMPT_FEATURED_IMAGE, whose OUTPUT FORMAT block shows a JSON skeleton but never forbids surrounding prose (packages/functions/src/const/genAIBlog.js:763); the prompt in fact instructs the model to 'infer reasonable brand aesthetics' when context is sparse, and the model narrated that inference in plain text before emitting the object. createFeaturedImageNode calls chatModel.invoke, converts to string, then stripCodeFences (createFeaturedImageNode.js:53) — which only removes ``` markers, not a leading sentence — and hands the still-prose-prefixed string to parseJsonString, which is a bare JSON.parse in a try/catch (langgraph/utils/json.js:10). JSON.parse fails on the leading 'G', parseJsonString rethrows with the whole raw completion interpolated into the message (json.js:12), and the node's catch logs it at logger.error (createFeaturedImageNode.js:60) and returns featuredImage: undefined. The logged payload in the alert shows the JSON body was complete and well-formed — a first-'{' to last-'}' extraction would have parsed it. This is not P1: no truncation, no finish_reason=length; the document is intact, just not at position 0.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/utils/json.js:10` — bare JSON.parse with no object extraction — the actual failing call, matching stack frame lib/langgraph/utils/json.js:15
- `packages/functions/src/langgraph/utils/json.js:12` — rethrows with the full raw completion interpolated, which is why the alert message carries the whole model output (also dumps AI content into logs, against packages/functions/CLAUDE.md)
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:53` — stripCodeFences is the only sanitization before parse; it removes ``` markers but not a prose preamble
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:60` — logger.error on this already-handled path is what fired the sink; the request itself did not 500 (requests read = 0)
- `packages/functions/src/const/genAIBlog.js:763` — OUTPUT FORMAT block shows the JSON shape but never says 'return only the JSON object, no prose', so a chatty completion is allowed by the prompt
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI is built with no response_format / structured output, so nothing at the transport layer constrains the completion to JSON
- `packages/functions/src/langgraph/nodes/createArticleMetadataNode.js:118` — second caller of the same unguarded parse — same defect, different node
- `packages/functions/src/langgraph/nodes/formatResponseNode.js:167` — third caller of the same unguarded parse

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-08-11T01:15:47.035Z" AND timestamp<="2026-08-11T01:45:47.035Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-08-11T01:15:47.035Z" AND timestamp<="2026-08-11T01:45:47.035Z" AND logName:"stderr"`
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.service_name="apisav2") AND timestamp>="2026-08-04T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND "Failed to parse featured image brief"`

## Job
- analyze rounds: 3
- cost: $2.97

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
