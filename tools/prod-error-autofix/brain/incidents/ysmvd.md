fingerprint: ysmvd
service: apisa
message: [handleError] Unauthenticated UnauthorizedError: You must log in to continue
app: BLOG
repo: blogs
date: 2026-09-08T02:29:03.821Z
status: fix_disabled
attempt: 2

# BLOG · apisa · ysmvd

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** errorHandler's catch block unconditionally re-emits every caught error via ctx.app.emit('error', ...), and errorService.handleError logs it at logger.error regardless of status — so an ordinary 401 from @avada/core verifyRequest lands in the severity>=ERROR sink and fires the Slack alert, undoing the deliberate 4xx→logger.warn downgrade three lines above it.

**Mechanism.** One request span, three log lines, all spanId 13039897130723819684 (= hex b4f7055a206dc0a4): (1) 02:16:28.672727Z request log GET /apiSa/articles?limit=100&order=DELETED_AT+desc&page=1&status=trash, 44ms; (2) 02:16:28.692133Z severity=WARNING '[requestError] GET /apiSa/articles 401 You must log in to continue' — that is packages/functions/src/middleware/errorHandler.js:19, the branch that exists precisely so 4xx stays out of the alert sink; (3) 02:16:28.719500Z severity=ERROR '[handleError] Unauthenticated UnauthorizedError: You must log in to continue' — produced 27ms later by packages/functions/src/middleware/errorHandler.js:31 emitting the same err, which packages/functions/src/handlers/apiSa.js:59 routes to packages/functions/src/services/errorService.js:14, an unconditional logger.error with no status check. The alerted line is the second log of an error the code had already classified as non-alerting. Corroboration that this is the errorHandler path and not an unhandled throw: the request log for the same span carries HTTP 200, not 401 — err.status=401 was only applied in the JSON branch at errorHandler.js:22, and this request took the ctx.render('error') branch because errorHandler.js:21 tests ctx.get('accept') === 'application/json' by strict equality (a browser/axios Accept of 'application/json, text/plain, */*' or '*/*' fails it), leaving koa-ejs to set status 200. Frequency is low: 2 [handleError] ERROR lines in 25h across the whole avada-blog-app project (1 apisa/401, 1 api), which matches the sender's 2 occurrences.

Confidence: `high`

## Code
- `packages/functions/src/middleware/errorHandler.js:31` — ctx.app.emit('error', err, ctx) fires for every caught error, including the 4xx just downgraded to warn — this is the escalation path that produced the alerted ERROR line
- `packages/functions/src/services/errorService.js:14` — logger.error('[handleError]', 'Unauthenticated', err) — unconditional severity ERROR with no err.status check; emits the exact alerted message
- `packages/functions/src/middleware/errorHandler.js:19` — the logger.warn('[requestError]', ...) branch whose intent (comment at lines 14-15: keep 4xx out of the prod-error → Slack sink) line 31 defeats; it produced the WARNING twin at 02:16:28.692133Z
- `packages/functions/src/handlers/apiSa.js:59` — api.on('error', errorService.handleError) wires the emit to the ERROR logger for the alerted service; the same wiring exists in api.js:102, apiV2.js:74, apiSaV2.js:32, internalApi.js:22, so the escalation is fleet-wide in this repo, not apisa-only
- `packages/functions/src/middleware/errorHandler.js:21` — strict ctx.get('accept') === 'application/json' equality; when it fails the 401 is answered by ctx.render('error') as HTTP 200 HTML — explains why the request log for this span reads 200 and not 401

## Evidence
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-09-07T02:16:28Z" AND timestamp<="2026-09-07T02:16:29Z" AND severity>=ERROR AND jsonPayload.tag="[handleError]"`
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-09-07T02:16:28Z" AND timestamp<="2026-09-07T02:16:29Z" AND jsonPayload.tag="[requestError]" AND severity="WARNING"`
- 1 matching entries: `resource.labels.service_name="apisa" AND logName:"requests" AND timestamp>="2026-09-07T02:16:28Z" AND timestamp<="2026-09-07T02:16:29Z" AND httpRequest.requestUrl:"/apiSa/articles"`
- 2 matching entries: `timestamp>="2026-09-06T02:00:00Z" AND timestamp<="2026-09-07T03:00:00Z" AND severity>=ERROR AND jsonPayload.tag="[handleError]"`
- 66 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-09-07T02:01:30Z" AND timestamp<="2026-09-07T02:31:30Z" AND logName:"requests"`

## Job
- analyze rounds: 1
- cost: $2.20

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
