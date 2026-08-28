fingerprint: 5goz7t
service: apiv2
message: [createFeaturedImageNode] ZSk8lHDhVcOaEjA0BZDZ Failed to build featured image brief Error: Failed to parse featured image brief: Given the lack of specific brand information, I will infer a neutral, editorial aesthetic suitable for a general e-commerce brand.
app: BLOG
repo: blogs
date: 2026-08-28T02:00:43.860Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · 5goz7t

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** createFeaturedImageNode asks OpenRouter for the featured-image brief as a free-text completion (no response_format / structured output), and the model prefixed its JSON with a prose sentence — 'Given the lack of specific brand information, I will infer a neutral, editorial aesthetic suitable for a general e-commerce brand.' — which stripCodeFences does not remove, so the bare JSON.parse in parseJsonString threw.

**Mechanism.** LangGraphService builds the node's model with createChatModel (packages/functions/src/langgraph/models/openAiChatModel.js:10): apiKey, model, temperature, streaming, streamUsage — no response_format:{type:'json_object'}, no withStructuredOutput. PROMPT_FEATURED_IMAGE only *asks* for an OUTPUT FORMAT object (packages/functions/src/const/genAIBlog.js:731), and its own instruction to 'infer reasonable brand aesthetics when context is sparse' is exactly what the model narrated out loud. chatModel.invoke returns the raw text; contentToString passes it through; stripCodeFences (json.js:2) only strips ``` fences, so the leading prose survives; parseJsonString does a bare JSON.parse (json.js:10) which throws on the leading 'G', and the catch rethrows with the entire raw completion embedded in the message (json.js:12). createFeaturedImageNode's catch logs it at logger.error (createFeaturedImageNode.js:60) and returns {featuredImage: undefined} — the article generation itself continued and the request answered 200, so the alert is a handled degradation, not a request failure. The JSON that followed the prose was well-formed and would have parsed if the preamble had been stripped.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/utils/json.js:10` — bare JSON.parse on the raw completion — the throw site named in the stack (lib/langgraph/utils/json.js:15)
- `packages/functions/src/langgraph/utils/json.js:12` — rethrow interpolates the whole raw completion into the message, which is why the alert text carries the model's prose and the JSON body; also puts merchant-derived AI output in logs
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:53` — stripCodeFences is the only sanitisation before parse — it removes ``` fences but not a prose preamble
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:54` — parseJsonString call with errorMessage 'Failed to parse featured image brief', the exact prefix in the alert
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:60` — catch logs at logger.error (severity ERROR → sink) even though the failure is handled: it emits an SSE error frame and returns featuredImage: undefined
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — options object passed to ChatOpenAI has no response_format and the node never calls withStructuredOutput, so nothing constrains the completion to JSON
- `packages/functions/src/const/genAIBlog.js:731` — PROMPT_FEATURED_IMAGE relies on a prose 'OUTPUT FORMAT' instruction only, and its 'infer sensibly when sparse' rule is what the model narrated in the preamble

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-08-26T03:22:02.759Z" AND timestamp<="2026-08-26T03:52:02.759Z" AND "Failed to parse featured image brief"`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-26T03:30:00Z" AND timestamp<="2026-08-26T03:45:00Z" AND httpRequest.requestMethod!=""`
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-08-19T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND "createFeaturedImageNode"`

## Job
- analyze rounds: 2
- cost: $2.34

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
