fingerprint: 1pqydjx
service: mcpgen2
message: HTTP 500 POST /mcp
app: SEO
repo: seo
date: 2026-09-29T15:50:22.141Z
status: fix_disabled
attempt: 2

# SEO · mcpgen2 · 1pqydjx

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** analysisRepository.updateByType dereferences `faqs.isFAQsSet` on an analysis doc whose stored `faqs` is null, and that TypeError is thrown after the Shopify `updateProductById` write has already been pushed into the un-awaited `handlers` array, so that orphaned promise rejects with the Shopify userError "Title can't be blank" with no handler attached — the unhandled rejection is what turns each MCP `audit_resource` call into HTTP 500.

**Mechanism.** MCP tool audit_resource → writeTools.js → runAuditBatch → auditOne → updateAnalysisResource (packages/functions/src/services/updateAnalysisResource.js:47) calls updateByType with `{...analysisData, ...data}`. For shop odewm43oPj7ZMr8tJs6I the stored analysis doc carries `faqs: null`, so the `faqs = {}` default at analysisRepository.js:392 does NOT apply (it only fires on `undefined`), and `sanitizeFaqs(null)` returns null unchanged (sanitizeFaqHtml.js:76). Before reaching the FAQ code the `case 'product'` primary-locale branch has already CALLED `updateProductById({product:{id, descriptionHtml, title}})` and pushed the live promise into `handlers` (analysisRepository.js:462-467) — the stored title is empty, so Shopify's productUpdate answers a userError and updateProductById throws "Title can't be blank" (updateProductById.js:21). Meanwhile execution reaches `faqs.isFAQsSet` at analysisRepository.js:675 and throws `TypeError: Cannot read properties of null (reading 'isFAQsSet')`, so `await Promise.all([...handlers, ...])` at analysisRepository.js:813 is never reached. The TypeError is caught at :818, rethrown, and caught by auditOne (auditResource.js:150) which turns it into a normal tool-error result — but `handlers[0]` is now a floating promise with no catch. ~0.26s later it rejects, Node reports the unhandled rejection, and the in-flight POST /mcp dies with 500. Proof of the link: all 12 of the 12 alerted 500s end at exactly the millisecond of a bare `Error: Title can't be blank` stderr line (e.g. request start 15:39:12.880076Z + latency 31.292084918s = 15:39:44.172 vs stderr 15:39:44.174; 15:42:33.561234Z + 0.871832006s = 15:42:34.433 vs stderr 15:42:34.434), 12/12 within 5ms. The window holds 19 `Title can't be blank` lines: the 7 prefixed `Exception from a finished function:` (response already sent, HTTP 200) produced no 500, and exactly the 12 bare ones (rejection landed while the request was still in flight) are the 12 500s.

Confidence: `high`

## Code
- `packages/functions/src/repositories/analysisRepository.js:675` — `faqs.isFAQsSet` — the TypeError in the stack (prod lib line 698/812); faqs is null here
- `packages/functions/src/repositories/analysisRepository.js:392` — `faqs = {}` destructuring default only fires on undefined, so a stored `faqs: null` passes through
- `packages/functions/src/helpers/faq/sanitizeFaqHtml.js:76` — sanitizeFaqs returns its argument unchanged for null, so line 401's normalization does not rescue the null
- `packages/functions/src/repositories/analysisRepository.js:462` — the Shopify productUpdate promise is pushed into `handlers` with no .catch, before any code that can throw
- `packages/functions/src/repositories/analysisRepository.js:813` — the only await of `handlers`; unreachable once :675 throws, so handlers[0] becomes an unhandled rejection
- `packages/functions/src/helpers/graphql/product/updateProductById.js:21` — throws `Title can't be blank` from the Shopify userError — the exact frame in the prod stack (lib line 35)
- `packages/functions/src/services/updateAnalysisResource.js:47` — passes `{...analysisData, ...data}` straight into updateByType, carrying the stored null faqs
- `packages/functions/src/services/mcp/auditResource.js:150` — auditOne's catch swallows the TypeError into a tool-error result, so the 500 cannot come from it — only the orphaned rejection can

## Evidence
- 19 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-29T15:24:48Z" AND timestamp<="2026-09-29T15:54:48Z" AND logName:"stderr" AND textPayload:"Title can"`
- 18 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-29T15:24:48Z" AND timestamp<="2026-09-29T15:54:48Z" AND logName:"stderr" AND textPayload:"isFAQsSet"`
- 12 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-29T15:24:48Z" AND timestamp<="2026-09-29T15:54:48Z" AND httpRequest.status>=500`
- 12 matching entries: `resource.labels.service_name="mcpgen2" AND timestamp>="2026-09-29T15:24:48Z" AND timestamp<="2026-09-29T15:54:48Z" AND logName:"stderr" AND textPayload:"ERR_HTTP_HEADERS_SENT"`

## Job
- analyze rounds: 1
- cost: $3.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
