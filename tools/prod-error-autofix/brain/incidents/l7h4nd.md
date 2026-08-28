fingerprint: l7h4nd
service: apigen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-28T02:38:59.721Z
status: fix_disabled
attempt: 2

# SEO · apigen2 · l7h4nd

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** PUT /api/redirects/multi-edit and PUT /api/redirects/resolve process the merchant's whole 404-fix selection inline on the request, fanning every item out through a module-level `pLimit(2)` that is shared by every concurrent request on the same apigen2 container, with no item cap and no request deadline — so a large selection, plus the merchant's retries piling onto the same 2 slots, runs past apiGen2's `timeoutSeconds: 540` and Cloud Run kills the request with a 504.

**Mechanism.** routes/api.js:274 binds PUT /redirects/multi-edit to redirectController.multiEdit and routes/api.js:272 binds PUT /redirects/resolve to redirectController.resolve. Both build their work list from the request body and run it inline: multiEdit at redirectController.js:364 and resolve at redirectController.js:449 both wrap each item in `limit(...)`, where `limit` is `pLimit(2)` declared at module scope (redirectController.js:83) — one 2-slot queue per container, not per request, shared by both endpoints. Each item costs at least one Shopify Admin round-trip: handleResolveRedirect does a GraphQL `urlRedirects(query:"path:…")` lookup (urlRedirectService.js:69) then a REST redirect create (urlRedirectService.js:45); the isGid branch does a REST update. Nothing bounds item count and nothing sets a deadline, and the outbound GraphQL path uses the shared axios client created with no `timeout` (helpers/api.js:11). All 11 alerted 504s in the 24h window are on these two endpoints only, from referer https://seo.apps.avada.io/embed/search-optimization/redirect-404, and every one carries a latency of 539.999–540.001s against apiGen2's `timeoutSeconds: 540` (handlers/exports/httpFunctions.js:42) — matched to the millisecond, so the limit that fired is the function's own request timeout. Latency is not a function of payload, which is what rules out 'just a big batch': from 08:40:35Z to 08:56:19Z the same merchant ran 25 serial multi-edits of 12.1–17.6 KB, every one 200 in 17.1–22.0s; at 08:57:06Z a 27.6 KB body hit 540s, was retried byte-identical at 08:58:12Z, and from there every multi-edit (18.3, 21.4, 25.7, 28.0, 33.3, 40.5 KB) and every resolve (2.6, 3.8, 4.6 KB) died at 540s. The controlled pair is decisive: multi-edit with requestSize 6818 starting 09:14:10Z took 527.40s, while the same 6817-byte payload 88 seconds later took 4.08s — identical work, 130× the wall clock, because the first was queued behind the still-running large batches on the same container's shared 2-slot limiter. The failures cluster per instance and overlap in time (instance …8986151e: multi-edit 504 starting 08:54:40Z, then resolve 504 starting 09:33:51Z; instance …bdfde394: four 504s starting 09:01:04Z, 09:02:28Z, 09:07:58Z, 09:11:00Z) while concurrent GET /api/redirects/report on those same instances answered in 0.31–0.72s, so the container itself was not saturated — only this write path was. Killing the request does not cancel the in-flight promises, so a 540s-killed batch keeps holding limiter slots afterwards, which is consistent with the isolated 09:42:51Z resolve hanging 30 minutes after that instance's earlier multi-edit was killed. Not the cause: no Shopify throttling — zero `[shopifyRetryGraphQL]` 429/THROTTLED warnings in 08:40–09:55Z, and the two `graphql error` lines that do carry cost data show throttleStatus currentlyAvailable 1998/2000 (bucket full); no OOM, no cold start, no container-start failure in the window; the three alerted 504s log nothing themselves, which is expected — Cloud Run terminates the request before the controller catch at redirectController.js:454 / :395 can run, and handleResolveRedirect only logs on error or at debug level (silenced in prod).

Confidence: `high`

## Code
- `packages/functions/src/controllers/redirectController.js:83` — `const limit = pLimit(2)` at module scope — one 2-slot queue per container shared by every concurrent multiEdit/resolve request; the starvation that turns a 4.08s batch into 527.40s
- `packages/functions/src/controllers/redirectController.js:364` — multiEdit fans the merchant's whole `items` array through that shared limiter inline on the request — 8 of the 11 504s
- `packages/functions/src/controllers/redirectController.js:449` — resolve does the same for its `data` array — the 3 alerted /api/redirects/resolve 504s
- `packages/functions/src/controllers/redirectController.js:434` — the selectAll branch already hands the batch to dispatchWork and returns immediately — the pattern the item-list branches do not use
- `packages/functions/src/controllers/redirectController.js:355` — multiEdit's selectAll branch loads every unresolved 404 with getRedirectUrls and then processes it inline, with no cap
- `packages/functions/src/services/urlRedirectService.js:69` — per-item Shopify Admin GraphQL redirect lookup — the first of two round-trips whose serialized cost accumulates to 540s
- `packages/functions/src/services/urlRedirectService.js:45` — per-item Shopify REST redirect create — the second round-trip per item
- `packages/functions/src/helpers/api.js:11` — the shared axios client for makeGraphQlApi is created with no `timeout`, so a stalled Admin GraphQL call holds a limiter slot indefinitely
- `packages/functions/src/handlers/exports/httpFunctions.js:42` — apiGen2 `timeoutSeconds: 540` — the limit every alerted latency (539.999–540.001s) matches to the millisecond
- `packages/functions/src/routes/api.js:272` — route registration binding PUT /redirects/resolve to redirectController.resolve
- `packages/functions/src/routes/api.js:274` — route registration binding PUT /redirects/multi-edit to redirectController.multiEdit

## Evidence
- 16 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.status>=500`
- 200 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T08:40:00Z" AND timestamp<="2026-08-26T09:55:00Z" AND httpRequest.requestUrl:"/api/redirects/"`
- 29 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.requestUrl:"/api/redirects/resolve"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T09:36:55.050Z" AND timestamp<="2026-08-26T10:06:55.050Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T08:40:00Z" AND timestamp<="2026-08-26T09:55:00Z" AND logName:"stderr" AND textPayload:"throttleStatus"`

## Job
- analyze rounds: 1
- cost: $4.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
