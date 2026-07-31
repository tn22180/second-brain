fingerprint: htf1kk
service: apiv2
message: [generate] fKUMrHXwtJca3KNWMU6X LangGraph generation failed Error: google/gemini-2.5-flash-lite is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-07-31T10:40:17.461Z
status: deferred
attempt: 1

# BLOG · apiv2 · htf1kk

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** OpenRouter delivers a 429 'temporarily rate-limited upstream' error frame inside the already-200 SSE stream for google/gemini-2.5-flash-lite, and callModelNode consumes that stream with a bare `for await` — no retry, no model fallback — so the whole LangGraph blog generation aborts.

**Mechanism.** langGraphController.generate writes SSE headers and status 200, then calls streamBlogWithLangGraph → LangGraphService → createCallModelNode. createChatModel builds a plain ChatOpenAI({streaming: true}) against https://openrouter.ai/api/v1 with no `models` fallback list and no stream-level retry. callModelNode iterates `chatModel.stream(...)` at callModelNode.js:437. OpenRouter answers HTTP 200 and then emits `{error:{code:429,...}}` as an SSE data frame; openai-node's Stream.iterator (openai/core/streaming.js:50) converts that frame into a thrown Error — the stack in the log lands exactly there, not in the request layer, which proves the HTTP request itself succeeded and client-side maxRetries (request-scoped only) never applied. The throw unwinds the `for await`, the workflow rejects, and langGraphController.js:183 logs '[generate] <shopId> LangGraph generation failed'. The failing model is flash-lite because DEFAULT_TEXT_MODEL (aiModels.js:19) is google/gemini-2.5-flash-lite and LEGACY_MODEL_MAP maps the FE alias 'gpt-4.1'/'gpt-4o-mini' onto it.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:338` — single-shot chatModel.stream() call — no retry wrapper, no fallback model
- `packages/functions/src/langgraph/nodes/callModelNode.js:437` — `for await (const chunk of stream)` with no try/catch; the mid-stream 429 throws out of here and kills the generation
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no maxRetries and no OpenRouter `models` fallback array (modelKwargs), so upstream provider 429 has no server-side or client-side recovery path
- `packages/functions/src/controllers/langGraphController.js:183` — the catch that emitted the alerted log line; response is already 200 SSE so the failure only surfaces as this log plus a `type:error` event
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model named in the error

## Evidence
- 3 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-07-30T09:50:00Z" AND timestamp<="2026-07-31T09:50:24Z" AND "temporarily rate-limited upstream"`
- 3 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-07-30T09:50:00Z" AND timestamp<="2026-07-31T09:50:24Z" AND jsonPayload.message:"LangGraph generation failed"`
- 16 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-07-30T09:50:00Z" AND timestamp<="2026-07-31T09:50:24Z" AND httpRequest.requestUrl:"/apiV2/langgraph/blog"`
- 3 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-31T09:20:24.495Z" AND timestamp<="2026-07-31T09:50:24.495Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
