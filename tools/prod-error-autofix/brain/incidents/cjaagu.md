fingerprint: cjaagu
service: proxy
message: SyntaxError: Unexpected token '"', ""actor":"tuannv"" is not valid JSON
app: BLOG
repo: blogs
date: 2026-08-28T04:36:23.665Z
status: fix_disabled
attempt: 1

# BLOG · proxy · cjaagu

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not an app defect: the alerted ERROR is a functions-framework body-parser strict-JSON rejection (HTTP 400) from a hand-run curl smoke test of the new POST /proxy/internal-token endpoint (FAL-757, revision proxy-00158-duh) that sent one bare field fragment per request instead of a JSON object.

**Mechanism.** Between 04:27:00.166Z and 04:28:09.885Z, 18 POSTs from curl/8.7.1 hit /proxy/internal-token — the only traffic on that path — with statuses 400/401/403/404/200 and zero 5xx. Three of them carried Content-Type application/json with a body whose first non-whitespace char is '"' rather than '{': "shop":"ag…, "actor":"tuannv", "ticket":"CS-901". Those are exactly and only the three body fields the route requires (packages/functions/src/middleware/internalAuth.js:27, route packages/functions/src/routes/proxy.js:29), and CS-901 is the literal example ticket printed in docs/features/internal-support-key.md:86 — the caller was walking the doc by hand, one field at a time. body-parser's strict check throws inside the functions-framework before Koa runs, so the three stderr lines carry no execution_id and no app frame (whole stack is body-parser/raw-body), the response is 400 not 5xx, no handler code executed, and internalAuth.js:35's own missing-field 400 was never reached. The framework writes that SyntaxError to stderr at severity ERROR, which is what the prod-error sink matched. The rest of the burst walked the remaining branches — 401 (internalAuth.js:30, no Bearer), 403 (internalAuth.js:43, unknown key), 404 (internalAuth.js:51, shop not found) — and finished with two 200s, so the endpoint works. Same cause and same burst as already-recorded fingerprint 13qvmia; this alert is the "actor":"tuannv" fragment of it.

Confidence: `high`

## Code
- `packages/functions/src/routes/proxy.js:29` — POST /proxy/internal-token — the only route the alerted requests hit, added by FAL-757 and live on revision proxy-00158-duh
- `packages/functions/src/middleware/internalAuth.js:27` — reads shop/actor/ticket from ctx.req.body — the exact three field names appearing as the malformed body fragments
- `packages/functions/src/middleware/internalAuth.js:35` — the handler's own 400 for missing fields, never reached: body-parser rejected above Koa, so no app frame is in the stack
- `docs/features/internal-support-key.md:86` — documented example body {"shop":…,"actor":…,"ticket":"CS-901"} — CS-901 is the literal in the alerted fragment, identifying the caller as a hand-run doc walkthrough

## Evidence
- 3 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-28T04:12:05.113Z" AND timestamp<="2026-08-28T04:42:05.113Z" AND severity>=ERROR`
- 18 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-28T04:26:50Z" AND timestamp<="2026-08-28T04:28:10Z" AND httpRequest.requestUrl:"/proxy/internal-token"`
- 19 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-28T04:12:05.113Z" AND timestamp<="2026-08-28T04:42:05.113Z" AND httpRequest.status>=400 AND httpRequest.requestUrl:"/proxy/internal-token"`
- 3 matching entries: `resource.labels.service_name="proxy" AND logName:"stderr" AND timestamp>="2026-08-28T04:12:05.113Z" AND timestamp<="2026-08-28T04:42:05.113Z" AND textPayload:"is not valid JSON"`

## Job
- analyze rounds: 2
- cost: $1.78

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
