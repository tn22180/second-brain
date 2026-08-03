fingerprint: cv8rrq
service: apisav2
message: [generate] FiNnkxsSJ96AC1ZWnaz8 LangGraph generation failed Error: LangGraph format node failed to parse blog JSON: {
app: BLOG
repo: blogs
date: 2026-08-03T07:34:24.485Z
status: infra
attempt: 1

# BLOG · apisav2 · cv8rrq

**Outcome.** infra class — reported, no MR

**Root cause.** The OpenRouter model emitted a raw unescaped double quote inside the JSON string value of `body` (`Implement a "one in, one out" rule`, byte offset 5578 of a 14211-byte, structurally complete document), and formatResponseNode parses that completion with a bare JSON.parse that has no repair, no retry and no schema enforcement, so the whole LangGraph blog generation aborted.

**Mechanism.** callModelNode streams the completion into `blogContent` and returns it as `rawBlogResponse` (packages/functions/src/langgraph/nodes/callModelNode.js:474). formatResponseNode strips code fences and calls parseJsonString (packages/functions/src/langgraph/nodes/formatResponseNode.js:167), whose only body is `JSON.parse(raw)` inside a try/catch that rethrows the raw string (packages/functions/src/langgraph/utils/json.js:10). Nothing constrains the model to valid JSON: createChatModel builds ChatOpenAI with only apiKey/model/temperature/streaming/maxTokens and never sets `response_format` (packages/functions/src/langgraph/models/openAiChatModel.js:14), and the `responseFormat = 'json'` field produced by buildLangGraphConfig (packages/functions/src/langgraph/config/index.js:8) is dead — it is never read anywhere in packages/functions/src. So a single unescaped `"` inside the prose is enough to throw. Replaying the exact logged payload confirms it: `node -e JSON.parse` fails with `Expected ',' or '}' after property value in JSON at position 5578`, and the document is NOT truncated — it ends with a complete `"images": [ ... ]\n}`, so pattern P1 (finish_reason=length) does not apply here. The throw propagates to langGraphController.generate's catch (packages/functions/src/controllers/langGraphController.js:183), which logs and writes an `{type:'error'}` SSE frame; the response was already 200 before streaming, which is why the requests read for this window returned 0 entries with httpRequest.status>=500.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/utils/json.js:10` — bare JSON.parse on the model completion — no repair, no retry, no re-issue; the sole failure point
- `packages/functions/src/langgraph/nodes/formatResponseNode.js:167` — the call site that produced the exact logged message 'LangGraph format node failed to parse blog JSON'
- `packages/functions/src/langgraph/models/openAiChatModel.js:14` — ChatOpenAI options carry no response_format / json_schema, so the model is only prompted to emit JSON, never constrained
- `packages/functions/src/langgraph/config/index.js:8` — buildLangGraphConfig emits responseFormat:'json' but createChatModel never destructures it — dead config that hides the missing constraint
- `packages/functions/src/langgraph/nodes/callModelNode.js:474` — returns the unvalidated streamed text as rawBlogResponse, the input to the failing parse
- `packages/functions/src/controllers/langGraphController.js:183` — catch that logged this alert; SSE is already 200 so the failure never becomes an HTTP 5xx

## Evidence
- 1 matching entries: `resource.labels.service_name="apisav2" AND timestamp>="2026-08-03T07:12:25.606Z" AND timestamp<="2026-08-03T07:42:25.606Z" AND "LangGraph format node failed to parse blog JSON"`
- 1 matching entries: `"LangGraph format node failed to parse blog JSON" AND timestamp>="2026-07-27T00:00:00Z"`
- 1 matching entries: `"rule to prevent future accumulation" AND timestamp>="2026-08-03T07:12:25.606Z" AND timestamp<="2026-08-03T07:42:25.606Z"`

## Job
- analyze rounds: 2
- cost: $2.77

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
