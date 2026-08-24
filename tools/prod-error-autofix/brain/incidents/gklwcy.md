fingerprint: gklwcy
service: proxygen2
message: URIError: Failed to decode param 'proxy/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/%C0%AE%C0%AE/etc/passwd'
app: SEO
repo: seo
date: 2026-08-22T03:12:13.477Z
status: infra
attempt: 1

# SEO · proxygen2 · gklwcy

**Outcome.** infra class — reported, no MR

**Root cause.** Not an app defect: a 1300-request vulnerability-scanner sweep hit the public proxygen2 Cloud Run URL, and 7 of its probes were rejected with HTTP 400 by the functions-framework's own express/body-parser layer — which, unlike this repo's logger, emits structured stderr with severity=ERROR, so the prod-error-alerts sink fired on scanner noise.

**Mechanism.** proxyGen2 is exported as onRequest(..., proxyHandler.callback()) (packages/functions/src/handlers/exports/httpFunctions.js:100), so the Koa app is mounted as a leaf handler inside the functions-framework's express instance. Express's router runs decodeURIComponent on the path param before dispatch, and body-parser's JSON.parse runs on the body before dispatch — both before any Koa middleware in packages/functions/src/handlers/proxy/clientApi.js:10. The scanner sent GET /proxy/%C0%AE%C0%AE/.../etc/passwd (overlong-UTF-8 '.' path traversal, invalid UTF-8 → decodeURIComponent throws URIError) and POSTs with Content-Type: application/json carrying form/urlencoded bodies ('name=Admin', 'searchtype=...', '%7B%22type', 'mivipkstsz' → JSON.parse throws SyntaxError). Express's finalhandler answered every one with 400 and functions-framework logged the throw to stderr. The 7 ERROR entries map 1:1 by timestamp onto the 7 HTTP 400s (06:16:06.88→06:16:07.92, 06:16:11.85→06:16:12.90, 06:16:15.73→06:16:16.85, 06:16:46.52→06:16:47.55, 06:17:33.34→06:17:34.41, 06:17:50.22→06:17:51.25, 06:18:09.35→06:18:10.41). Zero requests in the window returned 5xx. No stack frame in any of the 7 touches /workspace/lib — app code never ran. The reason these and only these reach the sink is P7 in reverse: all 108 app-side stderr lines in the same window (including a genuine, unalerted '[initShopify] error Cannot read properties of null (reading id)' from updateOvrList) carry severity DEFAULT because helpers/logger.js:24 is a bare console.error, while functions-framework writes structured ERROR.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 = onRequest(..., proxyHandler.callback()) — Koa mounted under the functions-framework express app, so express decode_param and body-parser JSON.parse run before any app middleware and own both error classes
- `packages/functions/src/handlers/proxy/clientApi.js:10` — the Koa instance that would have handled the request; its first middleware (helmet, xss) is never reached for these 7, confirming the throw is upstream of app code
- `packages/functions/src/helpers/logger.js:24` — logger.error is a bare console.error → severity DEFAULT; this is why 108 real app log lines in the window were invisible to the severity>=ERROR sink while 7 framework-layer 400s alerted

## Evidence
- 7 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-19T06:01:22Z" AND timestamp<="2026-08-19T06:31:22Z" AND severity>=ERROR`
- 7 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-19T06:01:22Z" AND timestamp<="2026-08-19T06:31:22Z" AND httpRequest.status=400`
- 1304 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-19T06:01:22Z" AND timestamp<="2026-08-19T06:31:22Z" AND httpRequest.status=404`
- 115 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-19T06:01:22Z" AND timestamp<="2026-08-19T06:31:22Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.09

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
