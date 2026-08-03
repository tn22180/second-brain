fingerprint: htf1kk
service: apiv2
message: [generate] 7731Lu8E10hYamKC7NTQ LangGraph generation failed Error: google/gemini-2.5-flash-lite is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-08-03T08:44:08.201Z
status: inconclusive
attempt: 1

# BLOG · apiv2 · htf1kk

**Outcome.** fix blocked at agent_failed

**Root cause.** OpenRouter answers HTTP 200 then emits a 429 'temporarily rate-limited upstream' error frame inside the already-streaming SSE response for google/gemini-2.5-flash-lite, and callModelNode consumes that stream with a bare `for await` with no retry and no fallback model, so the whole LangGraph blog generation aborts.

**Mechanism.** langGraphController.generate writes SSE headers with status 200 before generating, so the request log for the alerted call is 200/5.256s (2026-08-03T08:29:37.413704Z) and the failure surfaces only as a log line. generate → streamBlogWithLangGraph → LangGraphService → callModelNode: createChatModel builds a plain ChatOpenAI({streaming: true}) against https://openrouter.ai/api/v1 with no maxRetries and no OpenRouter `models` fallback array (openAiChatModel.js:10-20 — grep for maxRetries/models fallback across packages/functions/src/langgraph/ returns nothing). callModelNode.js:338 calls `chatModel.stream(lcMessages)` once, unwrapped; callModelNode.js:437 iterates it with `for await` and no try/catch. Because the HTTP request itself succeeded, request-scoped client retries never apply; openai-node's Stream.iterator (openai/core/streaming.js:50, exactly where the prod stack lands) converts the in-band `{error:{code:429}}` frame into a throw. That unwinds the for-await, the workflow rejects, and langGraphController.js:183 emits the alerted '[generate] 7731Lu8E10hYamKC7NTQ LangGraph generation failed' at 08:29:42.671388Z — start + 5.258s, matching the request latency to ~2ms. The model named is flash-lite because DEFAULT_TEXT_MODEL (aiModels.js:19) = google/gemini-2.5-flash-lite. Same defect and same citations as fingerprint htf1kk of 2026-07-31 (deferred, no MR shipped); code unchanged on master.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:338` — single-shot `await chatModel.stream(lcMessages)` — no retry wrapper, no fallback model
- `packages/functions/src/langgraph/nodes/callModelNode.js:437` — `for await (const chunk of stream)` with no try/catch; the mid-stream 429 throws out of here and kills the generation
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no maxRetries and no OpenRouter `models` fallback array, so an in-band provider 429 has no recovery path
- `packages/functions/src/controllers/langGraphController.js:183` — the catch that emitted the alerted log line; response is already 200 SSE so the failure only surfaces as this log
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model named in the error

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T08:44:44Z" AND timestamp<="2026-08-03T08:44:44Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T08:44:44Z" AND timestamp<="2026-08-03T08:44:44Z" AND jsonPayload.message:"LangGraph generation failed"`
- 8 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T08:44:44Z" AND "temporarily rate-limited upstream"`
- 18 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T08:44:44Z" AND timestamp<="2026-08-03T08:44:44Z" AND httpRequest.requestUrl:"/apiV2/langgraph/blog"`

## Job
- analyze rounds: 1
- cost: $0.79

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
