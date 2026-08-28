fingerprint: avh4px
service: apigen2
message: HTTP 504 PUT /api/redirects/multi-edit
app: SEO
repo: seo
date: 2026-08-28T02:31:38.022Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · avh4px

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** redirectController.multiEdit processes the merchant's whole 404-fix selection inline on the request through a module-level `const limit = pLimit(2)` that is shared by every request running on the same apiGen2 instance, so with apiGen2 at concurrency:3 a large multi-edit head-of-line-blocks every later /api/redirects/multi-edit and /api/redirects/resolve on that instance until Cloud Run kills them at timeoutSeconds: 540.

**Mechanism.** apiGen2 is declared timeoutSeconds: 540, concurrency: 3 (handlers/exports/httpFunctions.js:42,46). All 10 alerted 504s carry latency 539.9995–540.0010s — the platform deadline to the millisecond (P4), and gcloud returns zero entries for textPayload matching multiEdit/redirectController/urlRedirectService/handleResolveRedirect across 08:50–09:25Z, so the catch at redirectController.js:396 never ran: the container was killed, no exception was thrown. redirectController.js:83 creates ONE `pLimit(2)` at module scope. multiEdit pushes every item through it (`:362-385`) and resolve's non-selectAll branch pushes through the same object (`:449`), so up to 3 concurrent requests on one instance contend for a single 2-wide queue with no request deadline. Proof latency is contention, not payload: two multi-edit calls of essentially identical size 88s apart — 6818 bytes at 09:14:10 on instance …f8a1a8e1 (which was still running the 09:08:52 multi-edit) took 527.40s, while 6817 bytes at 09:15:38 on the idle instance …68687d78 took 4.08s. 129× on the same payload size, same shop. Same split for resolve: the 2 resolve 504s (09:07:58, 09:11:00, bodies 2629/3764 B) both landed on instance …bb319d4b while its multi-edits 09:01:04→09:10:04 and 09:02:28→09:11:28 were in flight; the 4 resolve calls that landed on instances with no multi-edit in flight returned 200 in 0.87/1.50/1.64/2.54s. The trigger was a merchant on hsia-dev.myshopify.com (referer /embed/search-optimization/redirect-404) working the 404 table: 26 multi-edit calls 08:40–08:56 with 10,992–17,621 B bodies all returned 200 in 17.1–21.9s, then at 08:57:06 a 27,607 B body ran past 540s and every subsequent click overlapped it, cascading 8 multi-edit + 2 resolve 504s. The selectAll branch makes the ceiling unbounded: `:354-356` loads getRedirectUrls(shopID), whose default cap is limit = 10000 (repositories/redirectRepository.js:243), and grinds all of it through the same pLimit(2) on the request. resolve already knows this work does not belong on the request path — its selectAll branch hands off with dispatchWork('resolveAllRedirects') at `:434`; multiEdit has no such path.

Confidence: `high`

## Code
- `packages/functions/src/controllers/redirectController.js:83` — `const limit = pLimit(2)` at module scope — one queue shared by every concurrent request on the instance, the head-of-line blocker
- `packages/functions/src/controllers/redirectController.js:362` — multiEdit runs the whole selection inline through that shared limit, no deadline, no background dispatch
- `packages/functions/src/controllers/redirectController.js:449` — resolve's non-selectAll branch awaits the same shared limit — why small resolves 504'd behind multi-edit
- `packages/functions/src/controllers/redirectController.js:355` — multiEdit selectAll loads getRedirectUrls(shopID) and processes it all on the request
- `packages/functions/src/repositories/redirectRepository.js:243` — getRedirectUrls default cap is 10000 docs — unbounded work for a 540s budget
- `packages/functions/src/controllers/redirectController.js:434` — resolve's selectAll already offloads via dispatchWork('resolveAllRedirects') — the precedent multiEdit lacks
- `packages/functions/src/handlers/exports/httpFunctions.js:42` — apiGen2 timeoutSeconds: 540 — matches all 10 latencies to the millisecond
- `packages/functions/src/handlers/exports/httpFunctions.js:46` — apiGen2 concurrency: 3 — three requests per instance share the single pLimit(2)

## Evidence
- 10 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T08:40:00Z" AND timestamp<="2026-08-26T09:30:00Z" AND httpRequest.requestMethod="PUT" AND httpRequest.requestUrl:"/api/redirects/" AND httpRequest.status=504`
- 28 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T08:40:00Z" AND timestamp<="2026-08-26T09:30:00Z" AND httpRequest.requestMethod="PUT" AND httpRequest.requestUrl:"/api/redirects/multi-edit" AND httpRequest.status=200`
- 7 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-26T08:40:00Z" AND timestamp<="2026-08-26T09:30:00Z" AND httpRequest.requestMethod="PUT" AND httpRequest.requestUrl:"/api/redirects/resolve"`

## Job
- analyze rounds: 1
- cost: $2.59

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
