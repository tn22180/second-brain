fingerprint: 5nsp1i
service: apiv2
message: [createFeaturedImageNode] FiNnkxsSJ96AC1ZWnaz8 Failed to build featured image brief Error: google/gemini-2.5-flash is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: <https://openrouter.ai/settings/integrations>
app: BLOG
repo: blogs
date: 2026-08-03T10:34:34.081Z
status: mr_open
attempt: 1

# BLOG · apiv2 · 5nsp1i

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/824

**Root cause.** createFeaturedImageNode's single-shot `chatModel.invoke()` runs against a ChatOpenAI built with `streaming: true`, so it consumes an SSE stream; OpenRouter answered HTTP 200 for google/gemini-2.5-flash and then emitted a 429 'temporarily rate-limited upstream' error frame mid-stream, which throws outside every request-level retry, and the node's catch gives up on the first failure and returns featuredImage: undefined.

**Mechanism.** LangGraphService.streamBlogWithImages builds the featured-image node with a dedicated createChatModel(this.config) (LangGraphService.js:36). createChatModel sets streaming: true unconditionally and passes no maxRetries and no OpenRouter `models` fallback array (openAiChatModel.js:14), so ChatOpenAI.invoke routes _generate -> _streamResponseChunks instead of a plain completion — exactly the frames in the logged stack (chat_models.cjs:85 invoke -> :309 _generateUncached -> completions.cjs:76 _generate -> completions.cjs:189 _streamResponseChunks -> openai/core/streaming.js:50 Stream.iterator). The HTTP POST itself succeeded: OpenRouter returned 200 and delivered {error:{code:429,message:'google/gemini-2.5-flash is temporarily rate-limited upstream…'}} as an SSE data frame, and openai-node's Stream.iterator rethrows that frame as an Error. Because the throw happens while iterating an already-established stream, AsyncCaller/maxRetries never applies — no retry, no model fallback, no backoff on this path. The throw unwinds into the try at createFeaturedImageNode.js:44-52, logger.error emits the alerted line (createFeaturedImageNode.js:54, tag [createFeaturedImageNode], shop FiNnkxsSJ96AC1ZWnaz8), an SSE featured-image event with status 'error' is pushed, and the node returns featuredImage: undefined (createFeaturedImageNode.js:65) — the deployed stack's last app frame lib/langgraph/nodes/createFeaturedImageNode.js:65:24 is src line 45's chatModel.invoke. The caller swallows it (.catch(() => undefined), LangGraphService.js:47), so the blog still completes and requests=0 in the window: the article ships with no hero image on one transient upstream 429. Model id is DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20), matching the message. Same defect family as fingerprints wyd91p/yt88f3, different call site: MR 822 (open, unmerged) wrapped callModelNode's stream() in a retry loop and added only maxRetries:2 to openAiChatModel — maxRetries does not cover a mid-stream error frame, so this invoke path is untouched by it. The three 16 UNAUTHENTICATED stderr lines at 10:13:45/10:25:24 are the unrelated avada-feature-request eventLogService cold-instance Firestore failure (pattern P6).

Confidence: `high`

## Code
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:45` — the single-shot chatModel.invoke(promptTemplate) that threw — last app frame in the logged stack (lib/.../createFeaturedImageNode.js:65 in the deployed bundle); no retry, no fallback
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — streaming: true set for every LangGraph chat model, which is why a plain .invoke() consumes SSE and can be killed by an in-band 429 error frame; no maxRetries and no OpenRouter `models` fallback here
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:54` — the logger.error that produced the alerted message '[createFeaturedImageNode] <shopId> Failed to build featured image brief'
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:65` — catch returns featuredImage: undefined — one transient upstream 429 permanently drops the hero image for that generation
- `packages/functions/src/langgraph/services/LangGraphService.js:36` — featured-image node constructed with its own createChatModel(this.config), inheriting streaming: true
- `packages/functions/src/langgraph/services/LangGraphService.js:47` — .catch(() => undefined) on the featured-image promise — the failure only ever surfaces as this log line, never as a 5xx
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the model named in the error message

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-03T10:10:39.730Z" AND timestamp<="2026-08-03T10:40:39.730Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T10:40:39Z" AND timestamp<="2026-08-03T10:40:39Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T10:40:39Z" AND timestamp<="2026-08-03T10:40:39Z" AND jsonPayload.tag="[createFeaturedImageNode]"`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-02T10:40:39Z" AND timestamp<="2026-08-03T10:40:39Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.88
- branch: `fix/prod-blog-5nsp1i`
- fix commit: `02e551cda05efd781f9e0c713f7290c07c966cf4`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/824
- tests: 264 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../src/langgraph/models/openAiChatModel.js        | 12 ++++++++-
 .../src/langgraph/nodes/createFeaturedImageNode.js | 30 +++++++++++++++++++++-
 2 files changed, 40 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
