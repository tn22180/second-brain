fingerprint: 1lsn5wc
service: mcp
message: HTTP 504 POST /mcp
app: BLOG
repo: blogs
date: 2026-08-22T07:08:24.274Z
status: fix_disabled
attempt: 1

# BLOG · mcp · 1lsn5wc

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The build deployed as Cloud Run revision mcp-00017-bex at 2026-08-21T04:42:35Z never writes a response for an authenticated POST /mcp, so every such request hangs until the function's own timeoutSeconds: 300 fires as a 504; the regression persisted through mcp-00018-fiz and was gone in mcp-00019-qas.

**Mechanism.** The mcp function is declared timeoutSeconds: 300 (packages/functions/src/functions/http.js:76) and every one of the 142 504s carries latency 299.999-300.003s — an exact match to that configured limit (P4). Split by revision, POST /mcp on mcp-00017-bex answered 114x 504 + 3x 401 and zero 2xx/400; mcp-00018-fiz answered 28x 504 + 1x 401 and zero 2xx; mcp-00019-qas (deployed 08:27:11Z) answered 115x 200 / 8x 202 / 7x 400 / 17x 401 and zero 504. Revisions 15 and 16 before the break were likewise healthy (0.045-0.40s). The 401s prove the app booted and validateMcpToken (packages/functions/src/mcp/mcp.module.js:23) rejected unauthenticated calls in milliseconds, and the OAuth routes on the same broken revision served 200/302 normally — so the hang is downstream of auth, on the single route router.all('/', mcpController.handleRpc) (packages/functions/src/mcp/mcp.routes.js:43). handleRpc sets ctx.respond = false (mcp.controller.js:30) and hands the raw req/res to StreamableHTTPServerTransport.handleRequest (mcp.controller.js:38); when that promise never settles nothing responds and nothing logs, which matches the logs exactly: across all 142 hung requests the only application output from those two revisions was three '[redis.service] connected 34.60.93.33' lines at cold start — no logger.error from the catch at mcp.controller.js:40, no OOM, no container kill. Healthy revisions always produce a 400 (transport rejecting the client's first probe) before the 200/202/200 handshake quartet; mcp-00017-bex produced not one 400, so the hang begins at the transport handshake, before any tool runs. The defect line itself cannot be cited: origin has no commit touching packages/functions/src/mcp after 2026-08-14 (HEAD 0c2482b28), while revisions 15 through 22 were all deployed on 08-19..08-21 from source that was never pushed.

Confidence: `medium`

## Code
- `packages/functions/src/functions/http.js:76` — timeoutSeconds: 300 — the exact limit every one of the 142 504s hit (299.999-300.003s)
- `packages/functions/src/mcp/mcp.routes.js:43` — router.all('/', mcpController.handleRpc) is the only /mcp route, and the only one that 504'd while /mcp/oauth/* on the same revision returned 200/302
- `packages/functions/src/mcp/mcp.controller.js:30` — ctx.respond = false hands the response entirely to the transport; if handleRequest never settles, Koa writes nothing and the request hangs to the platform cap
- `packages/functions/src/mcp/mcp.controller.js:38` — await transport.handleRequest(...) has no deadline — the awaited promise not settling is the only path that produces 300.000s with zero log output
- `packages/functions/src/mcp/mcp.controller.js:40` — the catch logs at logger.error, and this app's logger emits severity; zero such lines across 142 requests proves the promise never rejected, it never settled
- `packages/functions/src/mcp/mcp.module.js:23` — validateMcpToken runs before the router — its 3 fast 401s on the broken revision place the hang after auth

## Evidence
- 117 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00017-bex" AND httpRequest.requestUrl="https://mcp-arodugkrmq-uc.a.run.app/mcp" AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 29 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00018-fiz" AND httpRequest.requestUrl="https://mcp-arodugkrmq-uc.a.run.app/mcp" AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 147 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00019-qas" AND httpRequest.requestUrl="https://mcp-arodugkrmq-uc.a.run.app/mcp" AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z"`
- 27 matching entries: `resource.labels.service_name="mcp" AND httpRequest.status=504 AND timestamp>="2026-08-21T04:33:12.481Z" AND timestamp<="2026-08-21T05:03:12.481Z"`
- 1 matching entries: `resource.labels.service_name="mcp" AND resource.labels.revision_name="mcp-00017-bex" AND protoPayload.methodName="/InternalServices.ReplaceInternalService" AND timestamp>="2026-08-21T04:42:00Z" AND timestamp<="2026-08-21T04:43:00Z"`
- 3 matching entries: `resource.labels.service_name="mcp" AND (resource.labels.revision_name="mcp-00017-bex" OR resource.labels.revision_name="mcp-00018-fiz") AND NOT httpRequest.status:* AND (logName:"stderr" OR logName:"stdout") AND timestamp>="2026-08-21T04:40:00Z" AND timestamp<="2026-08-21T09:00:00Z"`

## Job
- analyze rounds: 1
- cost: $2.84

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
