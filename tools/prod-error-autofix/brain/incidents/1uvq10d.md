fingerprint: 1uvq10d
service: extensiongen2
message: The request failed because either the HTTP response was malformed or connection to the instance had an error. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#malformed-response-or-connection-error>
app: SEO
repo: seo
date: 2026-08-22T04:19:45.561Z
status: infra
attempt: 1

# SEO · extensiongen2 · 1uvq10d

**Outcome.** infra class — reported, no MR

**Root cause.** Not a code defect: the single 503 is a Cloud Run connection error on the last request routed to instance …2926619330 during a Shopify-Flow request flood (1847 of 1863 requests in the window were rate-limited 429s at ~9 rps on one instance), and that instance served nothing afterwards while Cloud Run started three replacements.

**Mechanism.** Shopify Flow (userAgent 'Shopify Flow', remoteIp 66.102.8.160) hammered POST /extension/flow/optimize-alt for one shop far above the 8 calls/s bucket at packages/functions/src/middleware/extension/rateLimit.js:15, so 1847 of 1863 requests (99.1%) in 2026-08-20T08:44:32Z–09:14:32Z answered 429 in ~5 ms and only 15 answered 200. extensionGen2 is declared with no `concurrency` and no `minInstances` (packages/functions/src/handlers/exports/httpFunctions.js:130-131), so the whole flood landed on a single container: instance …2926619330 served 322 requests inside the 08:58:00–08:59:00Z minute, the last at 08:58:36.589973Z. The very next request, at 08:58:36.640777Z, returned 503 with latency 0.000601324s — sub-millisecond, no application log line on that instance at all, which means Cloud Run failed to hand the request to the container rather than the app throwing. That instance never served again; the replacement instance …29b3e5f39b answered its first request at 08:58:36.785823Z with 17.873s latency (queued), and Cloud Run then logged three 'Default STARTUP TCP probe succeeded' container starts at 08:58:51.702932Z, 08:59:01.120616Z and 08:59:06.607899Z. No 'Memory limit … exceeded' and no 'container terminated' line exists anywhere on this service for 2026-08-20T00:00–12:00Z, so this is not an OOM kill. The 10 stderr lines in the window ('[redisCache:rateLimit] … Stream isn't writeable and enableOfflineQueue options is false') are NOT the cause: they arrive 15.5 s after the 503, on the different instance …29b3e5f39b, and rateLimit fails open — its catch returns {allowed: true} at packages/functions/src/helpers/redisCache.js:446-447, so a Redis outage yields 200s, never a 5xx. This 503 is the only 5xx on extensiongen2 in the 27 hours 2026-08-19T09:00Z–2026-08-20T12:00Z.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:131` — extensionGen2 declared with only timeoutSeconds/memory/vpcSettings — no concurrency and no minInstances override, so the whole Flow flood concentrated on one gen2 container (322 requests in <37s) before Cloud Run scaled out
- `packages/functions/src/middleware/extension/rateLimit.js:15` — the 8-calls/s per shop+handle bucket that produced 1847 of the window's 1863 responses as 429 — the flood is real traffic being shed, not a bug
- `packages/functions/src/helpers/redisCache.js:446` — rateLimit's catch fails OPEN (returns allowed:true), so the 10 '[redisCache:rateLimit] Stream isn't writeable' stderr lines cannot produce a 5xx — they are logged noise on a different instance 15.5s after the alert
- `packages/functions/src/controllers/flowController.js:49` — the handler's own catch answers 200 on every failure, confirming no application path can emit the alerted 503

## Evidence
- 1 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-20T08:44:32.654Z" AND timestamp<="2026-08-20T09:14:32.654Z" AND httpRequest.status>=500`
- 1847 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-20T08:44:32.654Z" AND timestamp<="2026-08-20T09:14:32.654Z" AND httpRequest.status=429`
- 500 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-20T08:58:00Z" AND timestamp<="2026-08-20T08:59:00Z" AND httpRequest.requestUrl!=""`
- 3 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-20T08:44:32Z" AND timestamp<="2026-08-20T09:14:32Z" AND textPayload:"STARTUP TCP probe"`
- 10 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-20T08:44:32.654Z" AND timestamp<="2026-08-20T09:14:32.654Z" AND logName:"stderr"`
- 1 matching entries: `resource.labels.service_name="extensiongen2" AND timestamp>="2026-08-19T09:00:00Z" AND timestamp<="2026-08-20T12:00:00Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
