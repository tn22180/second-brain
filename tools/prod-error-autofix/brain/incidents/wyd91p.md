fingerprint: wyd91p
service: apiv2
message: [generate] kHaMBG9NlTv1MucqsHED LangGraph generation failed Error: google/gemini-2.5-flash is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-07-31T14:59:36.456Z
status: deferred
attempt: 1

# BLOG · apiv2 · wyd91p

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** OpenRouter answers HTTP 200 then emits a 429 'temporarily rate-limited upstream' error frame inside the SSE stream for the Gemini 2.5 model, and callModelNode consumes that stream with a bare `for await` — no stream-level retry and no OpenRouter `models` fallback list — so the whole LangGraph blog generation aborts.

**Mechanism.** langGraphController.generate writes SSE headers and sets ctx.status = 200 (langGraphController.js:86-89) before any model call, then calls streamBlogWithLangGraph → callModelNode. The model id comes from payload.aiModel through resolveModel (openAi.service.js:41); LEGACY_MODEL_MAP sends the FE aliases 'gpt-5.1'/'gpt-5.2'/'claude-3-7-sonnet-latest' to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20) — the exact model named in the alert. createChatModel builds a plain ChatOpenAI({streaming: true}) against openrouter.ai/api/v1 with no maxRetries and no modelKwargs.models fallback (openAiChatModel.js:10). callModelNode awaits chatModel.stream() at line 338 and iterates it at line 437 with no try/catch. OpenRouter returns 200 and then delivers {error:{code:429}} as a data frame; openai-node's Stream.iterator (openai/core/streaming.js:50) turns that frame into a thrown Error — the stack lands exactly there, which proves the HTTP request itself succeeded and request-scoped client retries never applied. The throw unwinds the for-await, the workflow rejects, and langGraphController.js:183 logs the alerted line. Because the response is already 200 SSE, the failure only reaches the merchant as a `type:error` event; the single HTTP 500 in the window (13:36:39, latency 1.153s) is a separate event — a Firestore `16 UNAUTHENTICATED` on a cold instance logged at 13:36:40.224 (pattern P6), not this generation, which failed 7 minutes later at 13:43:45.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:338` — single-shot chatModel.stream() — no retry wrapper, no fallback model
- `packages/functions/src/langgraph/nodes/callModelNode.js:437` — `for await (const chunk of stream)` with no try/catch; the mid-stream 429 throws out of here and kills the generation
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no maxRetries and no OpenRouter `models` fallback array, so an upstream provider 429 has no recovery path
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the model named in the error
- `packages/functions/src/services/openAi.service.js:41` — resolveModel maps the FE aliases onto that model id for the LangGraph path
- `packages/functions/src/controllers/langGraphController.js:183` — the catch that emitted the alerted log line; response is already 200 SSE so the failure surfaces only as this log plus a type:error event

## Evidence
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-30T13:58:46Z" AND timestamp<="2026-07-31T13:58:46Z" AND "temporarily rate-limited upstream"`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-30T13:58:46Z" AND timestamp<="2026-07-31T13:58:46Z" AND jsonPayload.message:"LangGraph generation failed"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-31T13:28:46.660Z" AND timestamp<="2026-07-31T13:58:46.660Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-31T13:28:46.660Z" AND timestamp<="2026-07-31T13:58:46.660Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $0.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
