fingerprint: dlfokk
service: apiv2
message: [generate] HbzRIyEKvdcCYB8lSaNE LangGraph generation failed Error: LangGraph format node failed to parse blog JSON: {
app: BLOG
repo: blogs
date: 2026-08-12T08:12:09.195Z
status: infra
attempt: 1

# BLOG · apiv2 · dlfokk

**Outcome.** infra class — reported, no MR

**Root cause.** The OpenRouter model emitted a raw unescaped double quote inside the JSON string value of `body` (`Our tagline, "The Rich Taste of Healthy Living," ...`, byte offset 14477 of a 18649-byte, structurally complete document), and formatResponseNode parses that completion with a bare JSON.parse that has no repair, no retry and no schema constraint, so the whole LangGraph blog generation for shop HbzRIyEKvdcCYB8lSaNE aborted.

**Mechanism.** callModelNode streams the completion into `blogContent` and returns it as `rawBlogResponse` (packages/functions/src/langgraph/nodes/callModelNode.js:482). formatResponseNode strips code fences and hands the text to parseJsonString (packages/functions/src/langgraph/nodes/formatResponseNode.js:167), whose entire body is `JSON.parse(raw)` in a try/catch that rethrows the raw string as the error message (packages/functions/src/langgraph/utils/json.js:10-12) — which is why the alert message is 18KB of blog prose. Nothing forces valid JSON: createChatModel builds ChatOpenAI with only apiKey/model/temperature/streaming/streamUsage/baseURL/maxTokens and never sets `response_format` (packages/functions/src/langgraph/models/openAiChatModel.js:10), while buildLangGraphConfig's `responseFormat = 'json'` (packages/functions/src/langgraph/config/index.js:8) is dead config that createChatModel never destructures. So one unescaped `"` in the prose is fatal. Replay of the exact logged payload confirms it: node `JSON.parse` fails with `Expected ',' or '}' after property value in JSON at position 14477`, and the document is NOT truncated — it ends with a complete `"images": [ ... ]\n}`, so P1 (finish_reason=length) does not apply. The throw reaches langGraphController.generate's catch (packages/functions/src/controllers/langGraphController.js:183), which logs this line and writes an `{type:'error'}` SSE frame; headers were already 200 before streaming, which is why the requests read returned 0 entries at httpRequest.status>=500. The two `16 UNAUTHENTICATED` stderr lines 27s earlier are eventLogService/appGid (P6), a separate non-fatal path, not this failure.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/langgraph/utils/json.js:10` — bare JSON.parse on the model completion — no repair, no retry, no re-issue; the sole failure point
- `packages/functions/src/langgraph/nodes/formatResponseNode.js:167` — call site that produced the exact logged message 'LangGraph format node failed to parse blog JSON'
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no response_format / json_schema — the model is prompted for JSON, never constrained to it
- `packages/functions/src/langgraph/config/index.js:8` — buildLangGraphConfig emits responseFormat:'json' but createChatModel never reads it — dead config hiding the missing constraint
- `packages/functions/src/langgraph/nodes/callModelNode.js:482` — returns the unvalidated streamed text as rawBlogResponse, the input to the failing parse
- `packages/functions/src/controllers/langGraphController.js:183` — catch that logged this alert; SSE is already 200 so the failure never becomes an HTTP 5xx

## Evidence
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-05T20:35:44.915Z" AND timestamp<="2026-08-05T21:05:44.915Z" AND "LangGraph format node failed to parse blog JSON"`
- 2 matching entries: `"The Rich Taste of Healthy Living" AND timestamp>="2026-08-05T20:35:44.915Z" AND timestamp<="2026-08-05T21:05:44.915Z"`
- 8 matching entries: `"LangGraph format node failed to parse blog JSON" AND timestamp>="2026-07-27T00:00:00Z"`

## Job
- analyze rounds: 3
- cost: $2.77

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
