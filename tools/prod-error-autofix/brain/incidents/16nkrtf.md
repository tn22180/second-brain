fingerprint: 16nkrtf
service: apiv2
message: [generate] jnlrp1DhV9hLnC72iGTh LangGraph generation failed Error: Failed to parse article metadata JSON: {
app: BLOG
repo: blogs
date: 2026-08-17T08:52:07.318Z
status: mr_open
attempt: 1

# BLOG · apiv2 · 16nkrtf

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/887

**Root cause.** The OpenRouter model closed its metadata object with a trailing comma (`"...today!",\n}`), and createArticleMetadataNode parses that completion with a bare JSON.parse that has no schema constraint, no repair and no retry, so the LangGraph blog generation for shop jnlrp1DhV9hLnC72iGTh (attrangi.in) aborted.

**Mechanism.** createArticleMetadataNode streams the completion into `raw`, calls stripCodeFences, then parseJsonString (packages/functions/src/langgraph/nodes/createArticleMetadataNode.js:118), whose entire body is `JSON.parse(raw)` in a try/catch that rethrows the raw text (packages/functions/src/langgraph/utils/json.js:10) — the prod stack confirms this pair: `at parseJsonString (/workspace/lib/langgraph/utils/json.js:15:11)` ← `at RunnableCallable.func (/workspace/lib/langgraph/nodes/createArticleMetadataNode.js:105:46)`. Replaying the logged 675-byte payload gives `Illegal trailing comma before end of object: line 4 column 249 (char 672)`; the document ends with a complete `}` and carries all three requested string fields, so it is NOT truncated — P1 (finish_reason=length) does not apply. Nothing forces valid JSON: createChatModel builds ChatOpenAI with only apiKey/model/temperature/streaming/streamUsage/maxTokens and never sets response_format (packages/functions/src/langgraph/models/openAiChatModel.js:10); articleMetadataSchema is applied only after the parse succeeds (createArticleMetadataNode.js:177). The throw propagates through the Pregel loop to langGraphController.generate's catch (packages/functions/src/controllers/langGraphController.js:185), which emitted this alert and wrote an `{type:'error'}` SSE frame — headers were already 200, which is why the requests read at httpRequest.status>=500 returned 0 entries. Same defect family as fingerprint b4q91z (MR 872, still open/unmerged — json.js on master is still the bare 14-line version), different call site and different malformation. Note: the 4 `Failed to log event for domain attrangi.in / selforia.fr: 16 UNAUTHENTICATED` stderr lines in the same window are a separate, already-caught fire-and-forget event-logger failure, not this alert.

Confidence: `high`

## Code
- `packages/functions/src/langgraph/utils/json.js:10` — bare JSON.parse on the model completion — no repair, no re-issue, no retry; the sole failure point, matched by the prod frame lib/langgraph/utils/json.js:15
- `packages/functions/src/langgraph/nodes/createArticleMetadataNode.js:118` — call site that produced the exact logged message 'Failed to parse article metadata JSON', matched by the prod frame lib/.../createArticleMetadataNode.js:105
- `packages/functions/src/langgraph/models/openAiChatModel.js:10` — ChatOpenAI options carry no response_format / json_schema — the model is only prompted to emit JSON, never constrained
- `packages/functions/src/langgraph/nodes/createArticleMetadataNode.js:112` — extractPartialMetadata already recovers excerpt/meta_title/meta_description from the same raw text during streaming, and that recovered value is thrown away when the final parse fails
- `packages/functions/src/langgraph/nodes/createArticleMetadataNode.js:177` — articleMetadataSchema validation runs only after JSON.parse — it cannot rescue a malformed document
- `packages/functions/src/controllers/langGraphController.js:185` — catch that logged this alert; SSE is already 200 so the failure never becomes an HTTP 5xx

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-17T08:14:29.773Z" AND timestamp<="2026-08-17T08:44:29.773Z" AND "Failed to parse article metadata JSON"`
- 2 matching entries: `"Failed to parse article metadata JSON" AND timestamp>="2026-08-01T00:00:00Z"`
- 1 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-17T08:14:29.773Z" AND timestamp<="2026-08-17T08:44:29.773Z" AND "Shruti Haasan"`

## Job
- analyze rounds: 1
- cost: $2.71
- branch: `fix/prod-blog-16nkrtf`
- fix commit: `2cb61df61dc0e70c4e665e51a0c03e4aefaa3c19`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/887
- tests: 387 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/langgraph/utils/json.js | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
