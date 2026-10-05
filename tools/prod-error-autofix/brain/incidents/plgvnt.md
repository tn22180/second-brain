fingerprint: plgvnt
service: embedapp
message: [unhandledError] GET /embed/articles/edit/snippets/html.js 500 request to <https://avada-blog-app.web.app/embed-template.html> failed, reason: read ECONNRESET FetchError: request to <https://avada-blog-app.web.app/embed-template.html> failed, reason: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-05T01:55:40.710Z
status: fix_disabled
attempt: 1

# BLOG · embedapp · plgvnt

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The single unretried, untimeouted node-fetch in getEmbedTemplate to https://avada-blog-app.web.app/embed-template.html was reset by the peer mid-read (read ECONNRESET), and since the embed handler has no cache and no fallback, that one transient TLS socket reset became the whole request's error — 1 occurrence against 2000+ embedapp requests in 7 days, and the only severity>=ERROR entry on embedapp in that period.

**Mechanism.** embedapp's only middleware (handlers/embed.js:40-47) answers every path by calling getEmbedTemplate(), which does one node-fetch of the Hosting-served SPA shell (embed.js:27). At 2026-10-03T21:13:07.647697Z that fetch's TLSSocket emitted ECONNRESET from the upstream side (stack: node-fetch/lib/index.js:1501 -> TLSSocket.socketErrorListener), node-fetch rejected with FetchError code=ECONNRESET, and the rejection propagated out of the awaited ctx.body assignment (embed.js:46) into createErrorHandler (middleware/errorHandler.js:12). status computed as 500 so logger.error fired with the [unhandledError] tag (errorHandler.js:17) — that is the Slack alert. There is no retry, no AbortController/timeout, and no in-process cache of a template that only changes on deploy, so one upstream reset is unrecoverable. Secondary and confirmed in the same minute: the client actually received HTTP 200, not 500 — the request log for /embed/articles/edit/snippets/html.js at 21:13:07.607730Z shows status 200, latency 0.047s, and the job's requests read (httpRequest.status>=500) came back empty, because errorHandler's non-JSON branch renders views/error.html via ctx.render without ever setting ctx.status (errorHandler.js:29), and Koa promotes a body-only response to 200.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:27` — The single outbound node-fetch that threw. No timeout, no retry, no cache; its URL is the exact URL in the FetchError message.
- `packages/functions/src/handlers/embed.js:46` — Every embedapp request awaits getEmbedTemplate() here, so the rejection has no containment and escapes to the error handler.
- `packages/functions/src/handlers/embed.js:23` — isProduction branch is what selects the avada-blog-app.web.app Hosting URL, confirming prod took this path.
- `packages/functions/src/middleware/errorHandler.js:17` — Emits the [unhandledError] GET <path> 500 <message> line that is verbatim the alert text; status>=500 is what routes it to the Slack sink.
- `packages/functions/src/middleware/errorHandler.js:29` — Non-JSON branch sets only the body, never ctx.status, so the 500 the logger reports was served to the browser as 200 — matches the 200/0.047s request log and the empty requests read.
- `packages/functions/src/functions/http.js:18` — embedApp runtime config: timeoutSeconds 60, concurrency 80. The failure at 0.047s is nowhere near any configured limit, ruling out P4 and instance saturation.

## Evidence
- 1 matching entries: `(resource.labels.service_name="embedapp") AND timestamp>="2026-09-28T00:00:00Z" AND timestamp<="2026-10-05T00:00:00Z" AND jsonPayload.error.code="ECONNRESET"`
- 1 matching entries: `(resource.labels.service_name="embedapp") AND timestamp>="2026-09-28T00:00:00Z" AND timestamp<="2026-10-05T00:00:00Z" AND severity>=ERROR`
- 2000 matching entries: `(resource.labels.service_name="embedapp") AND timestamp>="2026-09-28T00:00:00Z" AND timestamp<="2026-10-05T00:00:00Z" AND httpRequest.status>=200`
- 8 matching entries: `(resource.labels.service_name="embedapp") AND timestamp>="2026-10-03T21:13:00Z" AND timestamp<="2026-10-03T21:14:00Z"`

## Job
- analyze rounds: 1
- cost: $0.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
