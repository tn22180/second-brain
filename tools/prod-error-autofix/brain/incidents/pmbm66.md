fingerprint: pmbm66
service: apiv2
message: [createFeaturedImageNode] LylRebxQAvTJOmxKsfp2 Failed to build featured image brief AbortError: Request was aborted.
app: BLOG
repo: blogs
date: 2026-08-03T13:40:25.117Z
status: mr_open
attempt: 1

# BLOG · apiv2 · pmbm66

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/825

**Root cause.** OpenRouter returned its 429 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream' as an in-band error frame inside an already-200 SSE stream, which killed the LangGraph run; the reported createFeaturedImageNode AbortError is not a second fault but the cascade — LangGraph's PregelRunner aborts its exception signal on the first node error, and the featured-image chatModel.invoke() started inside that node's async context inherits that signal through ensureConfig's AsyncLocalStorage lookup, so its in-flight OpenRouter request is cancelled (APIUserAbortError → name 'AbortError').

**Mechanism.** callModelNode consumes the model stream (packages/functions/src/langgraph/nodes/callModelNode.js:437); each text chunk goes through appendText → onBlogChunk (callModelNode.js:397), which is LangGraphService's wrapper that fires startFeatured (LangGraphService.js:52) and launches createFeaturedImageNode inside the running graph task (LangGraphService.js:36). That node calls chatModel.invoke(promptTemplate) with no explicit config (createFeaturedImageNode.js:45), so @langchain/core's ensureConfig pulls the implicit RunnableConfig — including `signal` — out of AsyncLocalStorage (node_modules/@langchain/core/dist/runnables/config.cjs:76, forwarded at :157). Meanwhile OpenRouter emitted `data.error` (code 429) into the 200 SSE body, and openai-node throws APIError from Stream.iterator (node_modules/@langchain/openai/node_modules/openai/core/streaming.js:50) — exactly the frame in the [generate] stack. That error propagates out of the callModel node, PregelRunner calls exceptionSignalController.abort() (node_modules/@langchain/langgraph/dist/pregel/runner.cjs:66), the combined signal fires, and the featured-image request in flight is cancelled: openai-node raises APIUserAbortError, which wrapOpenAIClientError renames to 'AbortError' (node_modules/@langchain/openai/dist/utils/client.cjs:18) with the p-retry/p-queue frames the alert shows. createFeaturedImageNode's catch logs that cancellation at logger.error as 'Failed to build featured image brief' (createFeaturedImageNode.js:54), which is what paged. Timing confirms the order: AbortError at 12:30:52.657514Z, the causing 429 at 12:30:52.658270Z, same generation id LylRebxQAvTJOmxKsfp2, 0.756 ms apart. requests=0 in the window because the SSE response was already committed at status 200 (langGraphController.js:88), so no 5xx request log exists — that is why round 1's httpRequest.status>=500 query matched nothing.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:45` — chatModel.invoke() with no config — inherits the graph run's abort signal via AsyncLocalStorage
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:54` — catch logs the cancellation at logger.error as 'Failed to build featured image brief' — the alert text
- `packages/functions/src/langgraph/services/LangGraphService.js:36` — startFeatured launches the featured-image node from inside the running graph task
- `packages/functions/src/langgraph/services/LangGraphService.js:52` — onBlogChunk wrapper is what triggers startFeatured, so it runs in callModelNode's async context
- `packages/functions/src/langgraph/nodes/callModelNode.js:437` — the stream loop whose APIError (in-band 429) fails the node and triggers the graph abort
- `packages/functions/src/langgraph/nodes/callModelNode.js:397` — onBlogChunk emitted from inside the node body — the async-context link
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — streaming: true on every model, so the 429 arrives as an SSE error frame instead of an HTTP status
- `packages/functions/src/controllers/langGraphController.js:88` — ctx.status = 200 before streaming — why no httpRequest.status>=500 entry exists for this failure
- `node_modules/@langchain/openai/dist/utils/client.cjs:18` — APIUserAbortError is the only path that produces name 'AbortError'; a timeout would be 'TimeoutError'
- `node_modules/@langchain/langgraph/dist/pregel/runner.cjs:66` — PregelRunner aborts the exception signal on the first node error — the cancel source
- `node_modules/@langchain/core/dist/runnables/config.cjs:76` — ensureConfig reads the implicit config (incl. signal) from AsyncLocalStorage for a bare invoke()

## Evidence
- 2 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-08-03T12:15:54.082Z" AND timestamp<="2026-08-03T12:45:54.082Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T13:00:00Z" AND jsonPayload.error.name="AbortError"`
- 6 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T13:00:00Z" AND jsonPayload.message:"temporarily rate-limited upstream"`

## Job
- analyze rounds: 2
- cost: $5.58
- branch: `fix/prod-blog-pmbm66`
- fix commit: `b629f1709d40daa58791c2cbb664b93b04409101`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/825
- tests: 272 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../functions/src/langgraph/nodes/callModelNode.js | 224 ++++++++++++---------
 .../src/langgraph/nodes/createFeaturedImageNode.js |   6 +-
 2 files changed, 136 insertions(+), 94 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
