fingerprint: 1wnpppy
service: embedappgen2
message: HTTP 504 GET /embed/seoOnPage
app: SEO
repo: seo
date: 2026-08-12T10:07:35.591Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · 1wnpppy

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** packages/functions/src/handlers/embed.js:25 serves every /embed* page render by awaiting a single node-fetch v2 GET of https://seo.apps.avada.io/embed-template.html with no timeout, no retry and no in-process cache, so when that one outbound socket degrades the request burns the function's full 60s Cloud Run budget and Cloud Run returns 504.

**Mechanism.** embedAppGen2 is declared with no timeoutSeconds (httpFunctions.js:28), so it runs at the firebase-functions v2 default of 60s. Its only middleware (embed.js:20-29) does one blocking `await fetch(...)` per request for a static HTML shell. node-fetch v2's default timeout is 0 (never), so a socket that neither completes nor resets holds the request open until Cloud Run kills it — which is exactly what the logs show: 60 of 60 5xx entries in 24h are 504 with latency between 59.998167s and 60.002345s, i.e. the 60s default to the millisecond. All 60 landed on one instance, 001548f72936c15e6754 — the warm instance pinned by `minInstances: 1` in prod (httpFunctions.js:31), which therefore never recycles away from its degraded egress state. The same instance emitted all 67 `FetchError: ... read ECONNRESET` entries to the same URL in the same 24h; the other four instances served 1045 requests with zero failures. The ECONNRESET variant does not reach the 5xx sink at all: errorHandler.js:30 renders views/error.html for a non-JSON accept header, leaving ctx.status at 200, so 67 merchants got a broken error page counted as success. Same instance also served 2916 × 200, so the egress fault is intermittent (~2.4% fail rate over 8 hours), not a hard wedge — the code has no timeout to bound it and no cached copy to fall back to.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — The blocking per-request outbound fetch. No timeout option, no AbortController, no retry, no memoized copy — node-fetch v2 defaults to an infinite timeout, so a hung socket consumes the entire request budget.
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2's onRequest config declares memory/minInstances/region/vpc but no timeoutSeconds, so it runs at the v2 default 60s — the exact latency of all 60 observed 504s.
- `packages/functions/src/handlers/exports/httpFunctions.js:31` — minInstances: 1 in production pins one long-lived instance. Instance 001548f72936c15e6754 carried 2988 of 4033 requests and 100% of the failures across 8 hours because it is never recycled.
- `packages/functions/src/middleware/errorHandler.js:30` — The ECONNRESET path renders views/error.html without setting ctx.status, so those 67 failures return HTTP 200 and are invisible to the httpRequest.status>=500 alert sink — only the 504 half of this fault ever pages.

## Evidence
- 60 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T14:00:00Z" AND timestamp<="2026-08-07T14:00:00Z" AND httpRequest.status>=500`
- 67 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T14:00:00Z" AND timestamp<="2026-08-07T14:00:00Z" AND textPayload:"ECONNRESET"`
- 4033 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T14:00:00Z" AND timestamp<="2026-08-07T14:00:00Z" AND httpRequest.status>0`
- 4 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T01:58:13.834Z" AND timestamp<="2026-08-07T02:28:13.834Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $4.53
- branch: `fix/prod-seo-1wnpppy`
- fix commit: `2153bcb3dad0018bbabc3ab7b4bfab0c9c58365c`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169
- tests: 927 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/handlers/embed.js          | 53 +++++++++++++++++++++--
 packages/functions/src/middleware/errorHandler.js |  1 +
 2 files changed, 50 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
