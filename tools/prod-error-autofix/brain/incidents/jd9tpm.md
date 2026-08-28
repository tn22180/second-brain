fingerprint: jd9tpm
service: api
message: [keywordSuggestion] undefined Error getting keyword {"errors":[{"error_code":{"quota_error":"RESOURCE_EXHAUSTED"},"message":"Too many requests. Retry in 4 seconds.","details":{"quota_error_details":{"rate_scope":"ACCOUNT","rate_name":"Requests per service per method","retry_delay":{"seconds":"4"}}}}
app: BLOG
repo: blogs
date: 2026-08-28T02:27:27.096Z
status: fix_disabled
attempt: 1

# BLOG · api · jd9tpm

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Four concurrent GET /api/google/keyword requests for the same keyword 'ronde eettafel' ran on one api instance against the single shared Google Ads account in GOOGLE_AD_CUSTOMER_ID, and because getKeyWordsSuggestion issues generateKeywordIdeas with no deadline, no concurrency limit, no dedupe and no backoff — plus a second RPC for any multi-word keyword — Google Ads answered the 4th with quota_error RESOURCE_EXHAUSTED (rate_scope ACCOUNT, rate_name 'Requests per service per method', retry_delay 4s), which the controller swallows into HTTP 200 {success:false}.

**Mechanism.** routes/api.js:236 mounts GET /google/keyword on googleController.keywordSuggestion (googleController.js:139), which calls getKeyWordsSuggestion (googleAdService.js:30). The alerted ERROR at 2026-08-26T08:52:16.380653Z maps one-to-one onto the request log entry starting 08:50:15.173816Z with latency 121.204810140s: 08:50:15.174 + 121.205 = 08:52:16.379Z, the log line's own timestamp (±1ms). That request was the fourth of four identical `keyword=ronde+eettafel&geo_target_constants=geoTargetConstants%2F2528` requests, all on instance 00a41e8c1db48de7b3…, starting 08:49:11.467851Z (193.182s), 08:50:11.467490Z (133.634s), 08:50:13.458623Z (125.396s), 08:50:15.173816Z (121.205s). Concurrency is proven by the shared console.time label at googleAdService.js:31: three `Warning: Label 'LOG KEYWORD' already exists` at 08:50:11.810929Z, 08:50:13.762116Z and 08:50:15.483315Z, each ~0.31–0.34s after the corresponding request start, i.e. requests 2–4 entered console.time while request 1's label was still open. The same label crosstalk closes the loop on the ends: `LOG KEYWORD: 3:07.033` printed at 08:52:18.854177Z (start 08:49:11.82Z — request 1's timer, reported by request 3), then `No such label` at 08:52:24.651428Z and 08:52:25.104267Z as requests 1 and 2 hit the now-consumed label at googleAdService.js:66. All four calls build the customer from the same hardcoded account (googleAdService.js:34, GOOGLE_AD_CUSTOMER_ID is one env value, config/google.js:9) — which is exactly the `rate_scope: "ACCOUNT"` the error names. 'ronde eettafel' is two words, so keywords.length > 1 and googleAdService.js:53 fires a second generateKeywordIdeas on top of googleAdService.js:50: 4 requests = 8 in-flight RPCs on one method for one account. Neither call carries a deadline, a retry, or any read of `details.quota_error_details.retry_delay.seconds` (=4). The endpoint's normal cost is 5.00s median over 118 requests that day (healthy `LOG KEYWORD: 3.358s / 3.591s / 4.729s / 4.733s` at 08:41–08:42 in the same window), so 121–193s is the account already throttling. The 60s client abandon is what fed the storm: HTTP 401s at 08:51:11.468232Z, 08:51:13.451014Z and 08:51:15.170111Z land 60.00/59.99/60.00s after the three starts — the browser gives up at 60s, re-fires with an expired session token, and every re-fire adds more concurrent RPCs on the same throttled account. Nothing 5xx'd because googleController.js:158 answers 200 {success:false} on the catch path, which is why the requests read came back with 0 entries while the merchant's keyword panel came back empty. Fleet note: the same shared-single-Ads-account pattern with no throttle exists only here in blogs, but the quota is per Google Ads account, so any other app pointed at the same GOOGLE_AD_CUSTOMER_ID competes for it.

Confidence: `high`

## Code
- `packages/functions/src/services/googleAdService.js:34` — customer built from the single hardcoded GOOGLE_AD_CUSTOMER_ID for every shop — the ACCOUNT the quota error names as rate_scope
- `packages/functions/src/services/googleAdService.js:50` — first generateKeywordIdeas RPC — no deadline, no retry, no backoff, no concurrency limit; this is where RESOURCE_EXHAUSTED is thrown
- `packages/functions/src/services/googleAdService.js:53` — second generateKeywordIdeas for any multi-word keyword — 'ronde eettafel' is two words, so each of the 4 requests spent 2 RPCs on the throttled method
- `packages/functions/src/config/google.js:9` — googleAdCustomerId is one env value — there is no per-shop Ads account to spread the quota over
- `packages/functions/src/services/googleAdService.js:31` — single global console.time label; its 'already exists' warnings are the proof of 4 concurrent in-flight calls on one instance
- `packages/functions/src/services/googleAdService.js:66` — the only console.timeEnd, skipped when either RPC throws — source of the two 'No such label' warnings at 08:52:24/25Z
- `packages/functions/src/controllers/googleController.js:156` — JSON.stringify(e) is the alerted line's payload; it renders GoogleAdsFailure (plain object, enumerable errors) but flattens any real Error to {}
- `packages/functions/src/controllers/googleController.js:158` — catch answers HTTP 200 {success:false} — explains requests=0 against errors=1 and the silently empty keyword panel
- `packages/functions/src/routes/api.js:236` — GET /google/keyword mount — merchant-triggered from the blog editor, no throttle, dedupe or deadline in front of it
- `packages/functions/src/services/__tests__/googleAdService.keywordSeedCap.test.js:18` — existing suite already mocks keywordPlanIdeas.generateKeywordIdeas — the hook a RESOURCE_EXHAUSTED repro extends

## Evidence
- 6 matching entries: `(resource.labels.service_name="api") AND jsonPayload.tag="[keywordSuggestion]" AND timestamp>="2026-08-19T00:00:00Z"`
- 11 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T08:37:00Z" AND timestamp<="2026-08-26T09:07:00Z" AND httpRequest.requestUrl:"google/keyword"`
- 10 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T08:37:00Z" AND timestamp<="2026-08-26T09:07:00Z" AND textPayload:"LOG KEYWORD"`
- 118 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.requestUrl:"google/keyword"`
- 20 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-26T08:37:18.640Z" AND timestamp<="2026-08-26T09:07:18.640Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $2.07

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
