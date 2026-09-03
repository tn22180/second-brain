fingerprint: htf1kk
service: apiv2
message: [generate] fcB9MDSytK3792236pnM LangGraph generation failed Error: google/gemini-2.5-flash-lite is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-09-02T22:08:11.450Z
status: fix_disabled
attempt: 2

# BLOG · apiv2 · htf1kk

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** OpenRouter answered HTTP 200 and then emitted an in-band 429 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream' error frame inside the already-streaming SSE completion, and callModelNode consumes that stream with a single unwrapped `chatModel.stream()` + bare `for await` — no maxRetries, no OpenRouter `models` fallback array — so the whole LangGraph blog generation aborts mid-flight.

**Mechanism.** langGraphController.generate writes SSE headers with status 200 before generating, so both alerted failures show as 200 in the request log and surface only as a log line. Timing ties them one-to-one: request POST /apiV2/langgraph/blog at 2026-09-02T22:04:40.457525Z with latency 6.916235516s → 22:04:47.3737, and the alerted error line lands at 22:04:47.375031Z (Δ≈1.7ms); second request at 22:04:09.017670Z latency 7.421609488s → 22:04:16.4393 against the error at 22:04:16.440525Z (Δ≈1.2ms). Both are shop fcB9MDSytK3792236pnM, 31s apart — a user retry that failed the same way. Path: generate → streamBlogWithLangGraph → callModelNode. createChatModel builds a plain ChatOpenAI({streaming: true}) against https://openrouter.ai/api/v1 with no maxRetries and no OpenRouter `models` fallback (grep for maxRetries / `models: [` across packages/functions/src/langgraph/ returns nothing). callModelNode.js:334 issues `await chatModel.stream(lcMessages)` once, unwrapped; callModelNode.js:433 iterates with `for await` and no try/catch. Because the HTTP request itself succeeded, request-scoped client retries never apply — openai-node's Stream.iterator (openai/core/streaming.js, exactly where the prod stack lands) converts the in-band {error:{code:429}} frame into a throw, unwinding the for-await. langGraphController.js:191 emits the alerted line. Model named is flash-lite because DEFAULT_TEXT_MODEL (aiModels.js:19) = google/gemini-2.5-flash-lite. Same defect and same code as recorded fingerprint htf1kk (2026-07-31, 2026-08-03); no fix shipped, master unchanged.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:334` — single-shot `await chatModel.stream(lcMessages)` — no retry wrapper, no fallback model
- `packages/functions/src/langgraph/nodes/callModelNode.js:433` — `for await (const chunk of stream)` with no try/catch; the mid-stream 429 throws out of here and kills the generation
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no maxRetries and no OpenRouter `models` fallback array, so an in-band provider 429 has no recovery path
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — streaming: true — every call takes the SSE path where a provider 429 arrives after HTTP 200
- `packages/functions/src/controllers/langGraphController.js:191` — the catch that emitted the alerted log line; response is already 200 SSE so the failure only surfaces as this log
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model named in the error

## Evidence
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T21:49:18.279Z" AND timestamp<="2026-09-02T22:19:18.279Z" AND "temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T21:49:18.279Z" AND timestamp<="2026-09-02T22:19:18.279Z" AND jsonPayload.message:"LangGraph generation failed"`
- 6 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T21:49:18.279Z" AND timestamp<="2026-09-02T22:19:18.279Z" AND httpRequest.requestUrl:"langgraph/blog"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T00:00:00Z" AND timestamp<="2026-09-03T00:00:00Z" AND "temporarily rate-limited upstream"`

## Job
- analyze rounds: 2
- cost: $2.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
