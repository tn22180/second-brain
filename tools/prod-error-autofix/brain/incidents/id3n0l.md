fingerprint: id3n0l
service: embedappgen2
message: HTTP 504 GET /embed/performance/speed-up
app: SEO
repo: seo
date: 2026-08-12T10:27:32.170Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · id3n0l

**Outcome.** duplicate of 1u3gkku — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** embedAppGen2 renders every /embed* admin page by awaiting one unguarded node-fetch of https://seo.apps.avada.io/embed-template.html; during 02:45–03:02Z that outbound HTTPS to Firebase Hosting was failing at the socket layer, and because the fetch carries no timeout the hung ones burned the function's full default 60s and returned 504 — the alert's GET /embed/performance/speed-up being one of 13.

**Mechanism.** packages/functions/src/handlers/embed.js:25 is the only await on the request path: `await fetch(`https://${appConfig.baseUrl}/embed-template.html`)` with no timeout, no retry, no cached/local fallback (views/ has no embed template — only business-name-generator/error/login/message/unsubscribe). In the window that outbound connection failed two ways against the same host: 6 fast socket failures logged by the error handler as `[unhandledError] GET /embed... 500 request to https://seo.apps.avada.io/embed-template failed, reason: read ECONNRESET` and `...reason: Client network socket disconnected before secure TLS connection was established`, and 13 that never returned at all. embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:28 with memory/minInstances/region but NO timeoutSeconds, so it takes the firebase-functions v2 default of 60s. All 13 504s landed at 59.999235–60.000923s — the 60s limit to the millisecond (P4) — and one carries Cloud Run's own text: 'The request has been terminated because it has reached the maximum request timeout.' Egress is not the connector: vpcSettings.js:15 sets vpcConnectorEgressSettings 'PRIVATE_RANGES_ONLY', so public traffic leaves directly, not via seo-connector. One cause, two symptom shapes (500 when the socket died fast, 504 when it hung), spread over 7 distinct /embed* paths — /embed, /embed/seo-audit, /embed/settings, /embed/search-optimization/*, /embed/performance/speed-up*, /embed/seo-audit/seoOnPage*. Same defect family as fingerprints 1wnpppy / 1cpfsn4 / ojo5a0 / pzbsf9 / rkbjb7 / g36b4r (MR https://gitlab.com/avada/seo/-/merge_requests/2169, open and unmerged).

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — The single unguarded await on every /embed* render — node-fetch with no timeout, no retry, no fallback shell.
- `packages/functions/src/handlers/embed.js:26` — `await embedData.text()` — second unbounded await on the same dead socket; a body read can hang after headers arrive.
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 declared with no timeoutSeconds, so it inherits the gen2 60s default that every 504 in the window matched exactly.
- `packages/functions/src/config/vpcSettings.js:15` — vpcConnectorEgressSettings PRIVATE_RANGES_ONLY — public egress bypasses seo-connector, ruling out connector saturation as the mechanism.

## Evidence
- 13 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:35:53.053Z" AND timestamp<="2026-08-07T03:05:53.053Z" AND httpRequest.status=504`
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:35:53.053Z" AND timestamp<="2026-08-07T03:05:53.053Z" AND logName:"stderr" AND textPayload:"embed-template"`
- 8 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:35:53.053Z" AND timestamp<="2026-08-07T03:05:53.053Z" AND logName:"stderr" AND textPayload:"ECONNRESET"`
- 6 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:35:53.053Z" AND timestamp<="2026-08-07T03:05:53.053Z" AND logName:"stderr" AND textPayload:"Client network socket disconnected"`
- 1 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:35:53.053Z" AND timestamp<="2026-08-07T03:05:53.053Z" AND textPayload:"maximum request timeout"`

## Job
- analyze rounds: 1
- cost: $1.18
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
