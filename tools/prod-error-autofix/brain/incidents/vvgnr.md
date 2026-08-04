fingerprint: vvgnr
service: apiv2
message: [createFeaturedImageNode] 0M9YQS84AXIMb4Tvh6CL Failed to build featured image brief Error: AbortError
app: BLOG
repo: blogs
date: 2026-08-03T14:12:38.502Z
status: inconclusive
attempt: 1

# BLOG · apiv2 · vvgnr

**Outcome.** fix blocked at agent_failed

**Root cause.** OpenRouter answered HTTP 200 for the callModel stream and then emitted a 429 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream' error frame in-band; that killed the LangGraph run, and the featured-image side-task — started from inside the callModel node so it inherits the graph's composed abort signal — was cancelled and logged its cancellation as an application error.

**Mechanism.** callModelNode calls chatModel.stream() (callModelNode.js:338). The openai SDK throws on the in-band error frame at core/streaming.js:50 (`if (data && data.error) throw new APIError(...)`) — matching the 429 stack, which lands on Stream.iterator, not on an HTTP status. PregelRunner.tick sees the node error and aborts exceptionSignalController (node_modules/@langchain/langgraph/dist/pregel/runner.cjs:66), which is combined into composedAbortSignal (runner.cjs:94) and set as config.signal for every running task (retry.cjs:41). Meanwhile LangGraphService wraps onBlogChunk to fire startFeatured() (LangGraphService.js:51), so createFeaturedImageNode's chatModel.invoke() (createFeaturedImageNode.js:45, prod lib line 65 in the stack) is created inside the callModel node's AsyncLocalStorage context and picks up that same signal via ensureConfig (@langchain/core/dist/runnables/config.cjs:76). Because createChatModel sets streaming: true (openAiChatModel.js:14), invoke() runs the streaming path, and @langchain/openai throws bare `new Error("AbortError")` when the signal is aborted after the chunk loop (completions.cjs:217 locally = :251 in the prod bundle). createFeaturedImageNode's catch logs that cancellation at logger.error. Timestamps agree: AbortError at 12:53:02.910766Z, the 429 at 12:53:02.911654Z, same shop 0M9YQS84AXIMb4Tvh6CL, and these are the only two application errors in the 30-minute window. requests=0 because langGraphController.generate has already written ctx.status=200 for the SSE stream, so no HTTP 500 exists.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:338` — chatModel.stream() — the call that received the in-band 429 error frame and threw
- `packages/functions/src/langgraph/services/LangGraphService.js:51` — onBlogChunk wrapper fires startFeatured() from inside the callModel node, so the featured-image task inherits the graph's RunnableConfig (and its abort signal) via AsyncLocalStorage
- `packages/functions/src/langgraph/services/LangGraphService.js:36` — featured-image node built and invoked as a detached side-task with no signal of its own
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:45` — chatModel.invoke() — prod stack frame lib/langgraph/nodes/createFeaturedImageNode.js:65 — throws Error('AbortError') when the inherited signal aborts
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:54` — the catch logs the cancellation at logger.error, which is what fired the alert
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — streaming: true forces invoke() down _streamResponseChunks, the only path that throws bare 'AbortError'

## Evidence
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-03T12:38:05.107Z" AND timestamp<="2026-08-03T13:08:05.107Z" AND jsonPayload.error.message:"temporarily rate-limited upstream"`
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-03T12:38:05.107Z" AND timestamp<="2026-08-03T13:08:05.107Z" AND jsonPayload.message:"Failed to build featured image brief"`
- 2 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-03T12:38:05.107Z" AND timestamp<="2026-08-03T13:08:05.107Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.97

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
