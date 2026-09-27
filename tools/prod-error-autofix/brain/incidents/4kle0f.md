fingerprint: 4kle0f
service: mcpgen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-09-26T21:41:33.131Z
status: fix_disabled
attempt: 1

# SEO · mcpgen2 · 4kle0f

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** audit_resource runs its whole 10-resource batch inline on the MCP HTTP request with no deadline on an in-flight resource, so one resource that stalled burned the remaining 114s of mcpGen2's timeoutSeconds: 120 and Cloud Run terminated the POST /mcp with 504 after only 2 of 10 resources were written.

**Mechanism.** The alerted request log is POST https://mcpgen2-.../mcp, userAgent openai-mcp/1.0.0, requestSize 11035 B, latency 119.999570012s — equal to mcpGen2's declared timeoutSeconds: 120 (handlers/exports/httpFunctions.js:103) to the millisecond, so Cloud Run killed it; no application log line belongs to it. audit_resource is the only MCP tool that does resource work inline on the request (writeTools.js:494 awaits runAuditBatch; start_image_optimize / start_alt_optimize / fix_issue_with_ai all return a jobId and queue), it takes up to MAX_BATCH = 10 resources (writeTools.js:462, auditResource.js:13), and runAuditBatch iterates them strictly sequentially (auditResource.js:23-36). Its only deadline is a check taken BEFORE each iteration — BATCH_BUDGET_MS 90s minus elapsed vs MIN_RESOURCE_MS 15s (auditResource.js:15,17,24) — which never bounds an auditOne already in flight; inside auditOne only the storefront HTML crawl is capped (fetch timeout: 10000, helpers/seoSpeed.js:614), while shopify.shop.get (seoSpeed.js:579), getAllMetafields, and the Shopify writes in updateByType are unbounded. Measured pace on this same instance (0010dd86077a97c8…, revision mcpgen2-00026-mez): identical ~11 KB batches of 10 resources complete in 41-46s (21:13:26.035 → 200 in 46.452s, 21:13:26.804 → 200 in 45.799s, 21:15:06.212 → 200 in 41.006s), i.e. under 3x headroom against the 120s cap. The alerted request wrote resource 1 at 21:12:26.557 and resource 2 at 21:12:31.452 ([upsertTranslationSubcollection] success 270012252230, then 269722714182 — the same first two ids the retries wrote), then emitted nothing for the remaining 114s: zero stderr lines between 21:12:31.452 and 21:13:26.954. Nothing dedupes an identical in-flight tool call — every POST builds a fresh McpServer and runs the tool (handlers/mcp.js:198-221) and the only limiter is 120 calls/60s (mcp.js:33-34,166-178), which bounds neither concurrency nor runtime — so the client retried the same body twice (11073 B at 21:13:26.035, 11034 B at 21:13:26.804) and each of the batch's 10 ids was written TWICE, 0.05-0.88s apart, from 21:13:26.954/27.830 through 21:14:08.856/08.934. So the merchant's AI client got a 504 with no result for a call that had already written to the live store, and the retries double-wrote every resource in the batch.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:103` — mcpGen2 declared timeoutSeconds: 120 — the exact 119.999570012s cutoff that turned the stall into a 504.
- `packages/functions/src/services/mcp/auditResource.js:24` — The batch's only deadline: a pre-iteration budget check. It skips resources not yet started but cannot interrupt the auditOne that is already running, which is what overran here.
- `packages/functions/src/services/mcp/auditResource.js:35` — Unbounded `await auditOne(...)` — no Promise.race, no per-resource timeout; a single stalled resource holds the whole HTTP request.
- `packages/functions/src/services/mcp/auditResource.js:15` — BATCH_BUDGET_MS = 90s, chosen against a 120s function limit while a normal 10-resource batch measures 41-46s — under 3x headroom for work with no per-call cap.
- `packages/functions/src/services/mcp/writeTools.js:494` — audit_resource awaits runAuditBatch inline on the MCP request instead of queueing like the other write tools, so all batch latency is request latency.
- `packages/functions/src/services/mcp/writeTools.js:462` — Schema allows up to MAX_BATCH (10) resources per call — the batch size measured at 41-46s.
- `packages/functions/src/helpers/seoSpeed.js:579` — shopify.shop.get inside the per-resource re-score path has no timeout; only the storefront crawl below it is capped.
- `packages/functions/src/helpers/seoSpeed.js:614` — The one capped outbound call in the chain (fetch timeout 10000) — proof the cap is per-call and ad hoc, not a request deadline.
- `packages/functions/src/handlers/mcp.js:217` — Every POST constructs a fresh McpServer and runs the tool; nothing dedupes an identical in-flight call, so the client's two retries re-ran the same batch and double-wrote all 10 resources.

## Evidence
- 1 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-26T21:12:00Z" AND timestamp<="2026-09-26T21:13:00Z" AND httpRequest.status=504`
- 2 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-26T21:13:00Z" AND timestamp<="2026-09-26T21:14:00Z" AND httpRequest.requestSize>="11000"`
- 22 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-26T21:12:20Z" AND timestamp<="2026-09-26T21:14:20Z" AND logName:"stderr" AND textPayload:"upsertTranslationSubcollection] success"`
- 158 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-26T21:00:00Z" AND timestamp<="2026-09-26T21:30:00Z" AND logName:"stderr" AND textPayload:"upsertTranslationSubcollection] success"`
- 50 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-26T21:11:00Z" AND timestamp<="2026-09-26T21:16:30Z" AND httpRequest.requestMethod="POST"`

## Job
- analyze rounds: 2
- cost: $7.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
