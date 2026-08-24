fingerprint: 1ix55ri
service: mcp
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: BLOG
repo: blogs
date: 2026-08-22T07:14:04.887Z
status: fix_disabled
attempt: 1

# BLOG · mcp · 1ix55ri

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Cloud Run revisions mcp-00017-bex and mcp-00018-fiz (hand-deployed 2026-08-21 04:42:14Z → replaced 08:27:11Z) never write a response for an authenticated POST /mcp, so every JSON-RPC call is held open until Cloud Run's own timeoutSeconds:300 fires and returns 504; the exact source line cannot be named because that build is not in this repo (origin/master ends at 0c2482b28, 2026-08-14, ≈revision mcp-00007-hix) and prod already moved past it.

**Mechanism.** Unauthenticated POST /mcp on the same revision answers 401 in 0.0093s (07:18:48.811Z, python-httpx) and 0.0536s (07:02:24.523Z, curl), and every /mcp/oauth/* and /.well-known/* GET answers 200/302 in 0.007–0.43s — so createErrorHandler, rateLimiter, the public OAuth router and validateMcpToken (packages/functions/src/mcp/mcp.middleware.js:38) all complete normally. Only requests that pass the bearer check and reach McpController.handleRpc hang. handleRpc sets ctx.respond = false (mcp.controller.js:30), which hands all response writing to the SDK transport, then awaits transport.handleRequest (mcp.controller.js:38). That await neither resolves with a write nor throws — its catch at mcp.controller.js:40 logs via logger.error, and across both bad revisions and all 4 cold-started instances the entire application stdout/stderr is 4 lines, all '[redis.service] connected 34.60.93.33'. With no write and no Koa fallback, the socket stays open until the function's configured timeoutSeconds: 300 (packages/functions/src/functions/http.js:76), which the latency matches to the millisecond: 300.000s on every one of the 142 failures (P4). Client-independent: Claude-User (117), curl/8.7.1 (15) and openai-mcp/1.0.0 (10) all hang identically.

Confidence: `medium`

## Code
- `packages/functions/src/functions/http.js:76` — timeoutSeconds: 300 on the mcp function — the exact limit the 300.000s 504 latency matches
- `packages/functions/src/mcp/mcp.controller.js:30` — ctx.respond = false hands response writing wholly to the SDK transport; no deadline and no fallback write, so any non-writing path becomes a full-timeout hang
- `packages/functions/src/mcp/mcp.controller.js:38` — awaited transport.handleRequest is the only place a POST /mcp response is produced; the hang is inside this await
- `packages/functions/src/mcp/mcp.controller.js:40` — the catch logs via logger.error and never fired — no exception was thrown, the await simply never completed
- `packages/functions/src/mcp/mcp.middleware.js:38` — bearer validation; its 401 path answers in 9ms on the same revision, isolating the hang to code after this middleware

## Evidence
- 142 matching entries: `resource.labels.service_name="mcp" AND httpRequest.status=504 AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 3 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00017-bex" AND httpRequest.status=401 AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 4 matching entries: `(resource.labels.revision_name="mcp-00017-bex" OR resource.labels.revision_name="mcp-00018-fiz") AND (logName:"stdout" OR logName:"stderr") AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 115 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00019-qas" AND httpRequest.status=200 AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 5 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00017-bex" AND httpRequest.requestUrl:"/mcp/oauth/" AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $2.91

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
