fingerprint: 13qvmia
service: proxy
message: SyntaxError: Unexpected token '"', ""shop":"ag"... is not valid JSON
app: BLOG
repo: blogs
date: 2026-08-28T04:33:45.812Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 13qvmia

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not an app defect: the three alerted ERRORs are functions-framework body-parser strict rejections (HTTP 400) from a manual curl smoke test of the new POST /proxy/internal-token endpoint (FAL-757, revision proxy-00158-duh), which walked every rejection branch and finished 200 at 04:27:57.

**Mechanism.** 12 POSTs to /proxy/internal-token from curl/8.7.1 between 04:27:00.166Z and 04:27:57.859Z (400x5, 404x3, 403x1, 401x2, 200x1) — the only traffic to that path in the window. Five of them carried Content-Type application/json with a body whose first non-whitespace char is '"' instead of '{' — bare object fragments, one field per request: "shop":"ag…, "actor":"tuannv", "ticket":"CS-901". Those are exactly and only the three body fields POST /proxy/internal-token requires (packages/functions/src/middleware/internalAuth.js:27, route at packages/functions/src/routes/proxy.js:29), and CS-901 is the literal example ticket printed in the feature doc (docs/features/internal-support-key.md:86), so the caller was following the doc by hand. body-parser's strict check throws inside the functions-framework before Koa is invoked, so the three stderr entries carry no execution_id and no app frame (whole stack is body-parser/raw-body), the response is 400 not 5xx (requests read with status>=500 is empty, and no 5xx exists on the path), no handler code ran, and internalAuth.js:35's own 400 branch was never reached. The framework writes that SyntaxError to stderr at severity ERROR, which is what the prod-error sink matched. The same burst's 403 (internalAuth.js:43, unknown/revoked key) and 404 (internalAuth.js:51, shop not found) produced no ERROR line, and the run ended with a 200 — the endpoint works.

Confidence: `high`

## Code
- `packages/functions/src/routes/proxy.js:29` — POST /proxy/internal-token — the only route the alerted requests hit; added by FAL-757, 3 commits ago
- `packages/functions/src/middleware/internalAuth.js:27` — reads shop/actor/ticket from ctx.req.body — the exact three field names that appear as the malformed body fragments
- `packages/functions/src/middleware/internalAuth.js:35` — the handler's own 400 for missing fields, which the alerted requests never reached because body-parser rejected them above Koa
- `docs/features/internal-support-key.md:86` — documented example body {"shop":…,"actor":…,"ticket":"CS-901"} — CS-901 is the literal in the alerted fragment, identifying the caller as a hand-run doc walkthrough

## Evidence
- 3 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-28T04:12:04.939Z" AND timestamp<="2026-08-28T04:42:04.939Z" AND severity>=ERROR`
- 12 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-28T04:26:50Z" AND timestamp<="2026-08-28T04:28:00Z" AND httpRequest.requestUrl:"/proxy/internal-token"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-28T04:26:55Z" AND timestamp<="2026-08-28T04:27:20Z" AND httpRequest.requestMethod!=""`

## Job
- analyze rounds: 2
- cost: $2.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
