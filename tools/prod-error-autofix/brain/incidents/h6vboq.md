fingerprint: h6vboq
service: api
message: [keywordSuggestion] undefined Error getting keyword {}
app: BLOG
repo: blogs
date: 2026-08-28T02:19:45.516Z
status: fix_disabled
attempt: 1

# BLOG · api · h6vboq

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The alerted line carries no error identity because googleController.keywordSuggestion logs `JSON.stringify(e)` — which renders any Error instance as `{}` and also stops helpers/logger.js from lifting name/message/stack into jsonPayload.error — so the GET /api/google/keyword failure at 06:16:37.127Z is unattributable from the logs; the two defects that ARE provable on this path are that log-destroying catch (plus `ctx.state?.shopID`, which is always undefined) and the unbounded, un-timed, unretried pair of generateKeywordIdeas gRPC calls that let 9 of 118 requests in 24h run past 60s (max 402s).

**Mechanism.** routes/api.js:236 mounts GET /google/keyword on keywordSuggestion (googleController.js:139). The alerted ERROR at 2026-08-26T06:16:37.127594Z maps one-to-one onto the request log `GET /api/google/keyword?geo_target_constants=geoTargetConstants%2F2826&keyword=stress+and+skin` at 06:16:14.480904Z with latency 22.644310908s — start+latency = 06:16:37.125Z, the log line's own timestamp. That request answered HTTP 200 (googleController.js:158 returns `{success:false}` on the catch path), which is why the `httpRequest.status>=500` read came back with 0 entries while the merchant's keyword panel came back empty. Inside the catch, googleController.js:156 passes `JSON.stringify(e)`. helpers/logger.js:57 only lifts `{name, message, stack}` when an argument is `instanceof Error`; a pre-stringified string defeats that check, and JSON.stringify of an Error is `{}` because message and stack are non-enumerable. The contrast is in the same 30-minute window: `[getShopifyArticleById]` at 06:08:04.202045Z passes the Error itself and its entry carries jsonPayload.error.stack, while `[keywordSuggestion]` carries `{}`. Across the last week 6 `[keywordSuggestion]` errors were emitted: the 3 that stringified to real content (2026-08-23 03:20:26, 2026-08-26 08:52:16, 2026-08-27 06:54:33) were google-ads-api GoogleAdsFailure objects — plain protobuf objects with enumerable `errors`, produced by getGoogleAdsError at node_modules/google-ads-api/build/src/service.js:110-118 — and the 3 that stringified to `{}` (2026-08-26 06:16:37, 07:35:51, 07:35:56) were whatever the library rethrew unchanged, i.e. real Error instances. The logs cannot say which; that is the defect. `ctx.state?.shopID` at googleController.js:154 also always prints `undefined` — the shop id lives at `ctx.state.user.shopID` (helpers/auth.js:9,19) — so all 6 entries name no shop either. Second, proven independently: the throw skips console.timeEnd at googleAdService.js:66, leaking the `LOG KEYWORD` label opened at googleAdService.js:31. On instance 00a41e8c1db48de7b3, the next call warned `Label 'LOG KEYWORD' already exists` at 06:26:41.524277Z and then printed `LOG KEYWORD: 10:34.859` at 06:26:49.688843Z — a start of 06:16:14.83Z, the failing request's own timer, not its own. Same pattern repeats at 07:35:28.523848Z / 07:40:00.408767Z (`7:32.117` → start 07:32:28.29Z, the 208.677s failure). Third: neither generateKeywordIdeas call (googleAdService.js:50 and, for multi-word keywords, :53) carries a deadline or a retry. Over 24h on 2026-08-26 the endpoint took 118 requests, median 5.00s, but 9 ran over 60s up to 402.484s — and there are exactly 9 HTTP 401s, each landing 60.0s after a still-running long request (13:42:14.361+100.27s→401 at 13:43:14.354; 13:46:34.295+90.07s→401 at 13:47:34.296; 14:31:16.204+402.48s→401 at 14:32:16.204; 07:32:27.941+208.68s→401 at 07:33:27.948), i.e. the client abandons at 60s and retries with an expired session token.

Confidence: `high`

## Code
- `packages/functions/src/controllers/googleController.js:156` — JSON.stringify(e) destroys the error — `{}` for any Error instance — and defeats the logger's own Error extraction. This is the alerted line's payload.
- `packages/functions/src/helpers/logger.js:57` — logger lifts name/message/stack only when an arg is `instanceof Error`; a pre-stringified string never matches
- `packages/functions/src/controllers/googleController.js:154` — ctx.state?.shopID is always undefined — hence 'undefined' in all 6 entries; shop id is ctx.state.user.shopID
- `packages/functions/src/helpers/auth.js:9` — getCurrentShop reads ctx.state.user.shopID — the correct accessor the catch should use
- `packages/functions/src/controllers/googleController.js:158` — answers HTTP 200 {success:false} on failure — explains requests=0 against errors=1 and the silently empty keyword panel
- `packages/functions/src/services/googleAdService.js:50` — first generateKeywordIdeas gRPC call — no deadline, no retry; 9 of 118 requests in 24h ran past 60s here
- `packages/functions/src/services/googleAdService.js:53` — second generateKeywordIdeas call for any multi-word keyword — doubles latency and QPS on the same shared Ads account; all three `{}` failures were multi-word keywords
- `packages/functions/src/services/googleAdService.js:31` — console.time('LOG KEYWORD') opened here and only closed on the success path — source of the leaked-label warnings
- `packages/functions/src/services/googleAdService.js:66` — the only console.timeEnd, unreachable when either RPC throws — the next request then reports a 10:34 timer it never started
- `packages/functions/src/routes/api.js:236` — GET /google/keyword mount — merchant-triggered from the blog editor, no throttle or deadline in front of it

## Evidence
- 6 matching entries: `(resource.labels.service_name="api") AND jsonPayload.tag="[keywordSuggestion]" AND timestamp>="2026-08-19T00:00:00Z"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-26T06:01:38.918Z" AND timestamp<="2026-08-26T06:31:38.918Z" AND severity>=ERROR`
- 8 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T06:10:00Z" AND timestamp<="2026-08-26T06:30:00Z" AND (textPayload:"LOG KEYWORD" OR httpRequest.requestUrl:"keyword")`
- 118 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T00:00:00Z" AND timestamp<="2026-08-27T00:00:00Z" AND httpRequest.requestUrl:"google/keyword"`
- 9 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-26T07:30:00Z" AND timestamp<="2026-08-26T07:45:00Z" AND (httpRequest.requestUrl:"google/keyword" OR jsonPayload.tag="[keywordSuggestion]" OR textPayload:"LOG KEYWORD")`

## Job
- analyze rounds: 1
- cost: $2.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
