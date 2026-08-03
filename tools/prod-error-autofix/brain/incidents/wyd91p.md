fingerprint: wyd91p
service: apiv2
message: [generate] g5mOGoG51iC7JORewQnh LangGraph generation failed Error: google/gemini-2.5-flash is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-08-03T09:40:52.467Z
status: mr_open
attempt: 1

# BLOG · apiv2 · wyd91p

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/822

**Root cause.** OpenRouter answers HTTP 200 and then emits a 429 'temporarily rate-limited upstream' error frame inside the already-open SSE stream, and callModelNode iterates that stream with a bare `for await` — no stream-level retry, no OpenRouter `models` fallback list — so the whole LangGraph blog generation aborts.

**Mechanism.** langGraphController.generate writes SSE headers and sets ctx.status = 200 (langGraphController.js:88) before any model call, then runs the LangGraph workflow → callModelNode. createChatModel builds a plain ChatOpenAI against openrouter.ai/api/v1 with streaming: true and no maxRetries and no modelKwargs.models fallback array (openAiChatModel.js:10-20). callModelNode awaits chatModel.stream() at callModelNode.js:338 and consumes it at callModelNode.js:437 with no try/catch around the iteration. OpenRouter returns 200 for the POST, then delivers {error:{code:429, message:'<model> is temporarily rate-limited upstream'}} as a data frame; openai-node's Stream.iterator (openai/core/streaming.js:50) throws that frame as an Error — the stack terminating exactly there proves the HTTP request itself succeeded, so request-scoped client retries never applied. The throw unwinds the for-await, the workflow rejects, and langGraphController.js:183 logs the alerted line. Both entries in the window carry jsonPayload.error.code=429: 09:23:30.227 for google/gemini-2.5-flash-lite (execution d0uivp36qwj6) and 09:32:12.557 for google/gemini-2.5-flash (execution d14zh2npjnmu) — two different model ids, one defect, because neither has a fallback path. Model ids come from payload.aiModel through resolveModel (openAi.service.js:41) with DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20). requests=0 in the window confirms no HTTP 5xx: the response was already 200 SSE, so the merchant only sees a type:error event. The two `16 UNAUTHENTICATED` stderr lines at 09:23:20 and 09:31:28 are the unrelated avada-feature-request eventLogService cold-instance Firestore failure (pattern P6, fingerprint 1xqxz29/1efiw8j), not this generation.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:338` — single-shot chatModel.stream() — no retry wrapper, no fallback model
- `packages/functions/src/langgraph/nodes/callModelNode.js:437` — `for await (const chunk of stream)` with no try/catch; the mid-stream 429 throws out of here and kills the generation
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no maxRetries and no OpenRouter `models` fallback array, so an upstream provider 429 has no recovery path
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the model in the alerted entry
- `packages/functions/src/const/aiModels.js:2` — OPENROUTER_GEMINI_2_5_FLASH_LITE — the model in the second 429 at 09:23:30, same defect, different model id
- `packages/functions/src/services/openAi.service.js:41` — resolveModel maps the FE aliases onto those model ids for the LangGraph path
- `packages/functions/src/controllers/langGraphController.js:88` — ctx.status = 200 set before streaming, which is why this failure produces no HTTP 500 (requests read is empty)
- `packages/functions/src/controllers/langGraphController.js:183` — the catch that emitted the alerted log line

## Evidence
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T09:17:14.769Z" AND timestamp<="2026-08-03T09:47:14.769Z" AND "temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T09:17:14.769Z" AND timestamp<="2026-08-03T09:47:14.769Z" AND jsonPayload.message:"LangGraph generation failed"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T09:17:14.769Z" AND timestamp<="2026-08-03T09:47:14.769Z" AND severity>=ERROR`
- 6 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T09:17:14.769Z" AND timestamp<="2026-08-03T09:47:14.769Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $3.23
- branch: `fix/prod-blog-wyd91p`
- fix commit: `578a42bb03a44b76117b6fa3d40e22b8c1df0c58`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/822
- tests: 264 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../src/langgraph/models/openAiChatModel.js        |  3 ++
 .../functions/src/langgraph/nodes/callModelNode.js | 58 ++++++++++++++++++----
 2 files changed, 51 insertions(+), 10 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
