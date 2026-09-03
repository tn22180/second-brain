fingerprint: vvgnr
service: apiv2
message: [createFeaturedImageNode] fcB9MDSytK3792236pnM Failed to build featured image brief Error: AbortError
app: BLOG
repo: blogs
date: 2026-09-02T22:17:39.475Z
status: fix_disabled
attempt: 2

# BLOG · apiv2 · vvgnr

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** OpenRouter answered HTTP 200 for the callModel stream then emitted an in-band 429 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream' error frame; that killed the LangGraph run, and the detached featured-image side-task — started from inside the callModel node, so it inherits the graph's composed abort signal — was cancelled and logged its own cancellation as an application ERROR.

**Mechanism.** callModelNode calls chatModel.stream(lcMessages) (callModelNode.js:334). The openai SDK throws on the in-band error frame at core/streaming.js:94 — the 429 stack lands on Stream.iterator, not on an HTTP status, so no retry path in the app sees it. LangGraph's PregelRunner aborts its exceptionSignalController on the node error and that signal is composed into config.signal for every task still running. LangGraphService wraps onBlogChunk to fire startFeatured() (LangGraphService.js:51-52), so the featured-image node built at LangGraphService.js:36 is created inside the callModel node's AsyncLocalStorage context and picks up that same signal via ensureConfig; it is launched detached with no signal of its own. Because createChatModel sets streaming: true (openAiChatModel.js:14), createFeaturedImageNode's chatModel.invoke() (createFeaturedImageNode.js:51) runs the streaming path, and @langchain/openai throws bare Error('AbortError') from _streamResponseChunks (prod frame completions.cjs:254) when the signal aborts after the chunk loop. The catch at createFeaturedImageNode.js:59-65 logs that cancellation at logger.error — the alerted line. Timestamps agree to sub-millisecond: AbortError 22:15:29.335384Z, the 429 22:15:29.336025Z, same shop fcB9MDSytK3792236pnM. requests=0 because langGraphController.generate has already written ctx.status=200 for the SSE stream, so no HTTP 500 exists.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/callModelNode.js:334` — chatModel.stream() — the call that received the in-band 429 frame and threw, aborting the graph
- `packages/functions/src/langgraph/services/LangGraphService.js:51` — onBlogChunk wrapper fires startFeatured() from inside the callModel node, so the side-task inherits the graph RunnableConfig and its abort signal via AsyncLocalStorage
- `packages/functions/src/langgraph/services/LangGraphService.js:36` — featured-image node built and invoked as a detached side-task with no signal of its own
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:51` — chatModel.invoke() — throws Error('AbortError') when the inherited signal aborts; prod frame completions.cjs:254
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:60` — the catch logs the cancellation at logger.error — this is the alerted line
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — streaming: true forces invoke() down _streamResponseChunks, the only path that throws bare 'AbortError'
- `packages/functions/src/controllers/langGraphController.js:191` — the paired '[generate] … LangGraph generation failed' ERROR carrying the real 429 cause

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T22:00:31.264Z" AND timestamp<="2026-09-02T22:30:31.264Z" AND severity>=ERROR AND jsonPayload.message:"Failed to build featured image brief"`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T22:00:31.264Z" AND timestamp<="2026-09-02T22:30:31.264Z" AND severity>=ERROR AND jsonPayload.error.message:"temporarily rate-limited upstream"`
- 5 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-09-02T22:00:31.264Z" AND timestamp<="2026-09-02T22:30:31.264Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.26

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
