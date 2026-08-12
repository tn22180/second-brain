fingerprint: 1cpfsn4
service: embedappgen2
message: HTTP 504 GET /embed/seo-audit/seoOnPage
app: SEO
repo: seo
date: 2026-08-12T09:16:08.048Z
status: inconclusive
attempt: 1

# SEO · embedappgen2 · 1cpfsn4

**Outcome.** smoke gate reproduce_not_failing

**Root cause.** embedAppGen2's request handler awaits a single node-fetch of https://<APP_BASE_URL>/embed-template.html with no timeout, no retry and no cache, so whenever that Firebase Hosting fetch stalls the request burns the function's full (default) 60s Cloud Run budget and Cloud Run returns 504.

**Mechanism.** GET /embed/seo-audit/seoOnPage hits embedAppGen2, whose whole middleware body is packages/functions/src/handlers/embed.js:20-29 — the only await in the path is `fetch(`https://${appConfig.baseUrl}/embed-template.html`)` at :25 (node-fetch v2, no `timeout`/AbortSignal, no cached copy). firebase.json:47 sets `cleanUrls: true`, so Hosting 301s /embed-template.html → /embed-template and node-fetch follows the hop; that redirect target is exactly the URL named in the stderr FetchError, which pins the failing call to embed.js:25. When that upstream connection resets, the error surfaces as `[unhandledError] GET /embed/seo-audit/seoOnPage ... read ECONNRESET` (72 in 48h) and errorHandler renders an error page — no 5xx request log. When it instead stalls, nothing in the process ever aborts it, so Cloud Run kills the request at embedAppGen2's timeout: the function is declared at packages/functions/src/handlers/exports/httpFunctions.js:28-36 with memory/minInstances/region but NO `timeoutSeconds`, so it runs the gen2 default 60s (confirmed on the live service: `gcloud run services describe embedappgen2` → timeoutSeconds 60). The alerted request logged latency 60.000938512s with no application log line at all, consistent with the process still blocked inside that fetch.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the only await in the embed request path — node-fetch to the Hosting-served shell with no timeout, no retry, no cache; the URL in the FetchError
- `packages/functions/src/handlers/embed.js:20` — handler body: nothing else can block, so a hang here is a hang of the whole request
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 declared with no timeoutSeconds → gen2 default 60s, the exact latency of every 5xx on this service
- `firebase.json:47` — cleanUrls: true → /embed-template.html 301s to /embed-template, which is why the FetchError names the extension-less URL
- `packages/functions/src/middleware/errorHandler.js:29` — non-JSON errors are rendered as an HTML error page (HTTP 200), which is why the ECONNRESET failures produce stderr but no 500 request log — the 504s are the only 5xx

## Evidence
- 71 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND httpRequest.status>=500`
- 86 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND logName:"stderr" AND textPayload:"embed-template"`
- 1 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T01:23:40.874Z" AND timestamp<="2026-08-07T01:53:40.874Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.85
- tests: 925 tests, 6 failing · baseline 6 failing · reproduce check did not pass

```
packages/functions/src/handlers/embed.js           | 43 ++++++++++++++++++++--
 .../src/handlers/exports/httpFunctions.js          |  1 +
 2 files changed, 40 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
