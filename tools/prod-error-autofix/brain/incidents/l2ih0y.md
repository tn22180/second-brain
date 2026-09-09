fingerprint: l2ih0y
service: apisagen2
message: HTTP 500 GET /apiSa/republish
app: SEO
repo: seo
date: 2026-09-09T00:43:00.965Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · l2ih0y

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /apiSa/republish returns 500 whenever any Shopify Admin REST call inside it answers 429, because republish drives its whole theme-asset fan-out through a bare initShopify client (maxRetries: 0, no shopifyRetryApi wrapper) and its catch turns the throttle into an unconditional 500.

**Mechanism.** Shop LT68q6QbJBPCV6dDxWkQ had its Shopify Admin REST bucket exhausted for ~8 minutes on 2026-09-08 (16 of the 19 stderr entries on apisagen2 between 17:00Z and 20:00Z are `Response code 429 (Too Many Requests)` HTTPErrors thrown by got inside shopify-api-node, and LT68q6QbJBPCV6dDxWkQ is the only shop named in any of them — 7 lines name it explicitly, across get shops / getStructuredSetting / prepareAnalysisPage / getList / getCount). The merchant's /settings page (referer on both alerted requests) then fired two GET /apiSa/republish 0.59s apart. republish builds `initShopify(shop)` at seoController.js:603 with the defaults from shopifyService.js:63 — `maxRetries = 0`, so shopify-api-node never retries a 429 — and immediately fans out: getAppBlockByType + createAssets in one Promise.all (seoController.js:605), where createAssets alone issues theme.list + asset.get(THEME_LAYOUT) and then a Promise.all of 5 asset.get/create plus updateScriptManagerSnippet and up to 2 asset.update (createAssets.js:52). None of those calls goes through the repo's own `shopifyRetryApi` (shopifyService.js:504), which already honours Retry-After for codes [429, 430, 502, 503]. The first 429 rejects the Promise.all, and the catch at seoController.js:619-622 logs `[republish] undefined <message>` and sets ctx.status = 500. Timestamp arithmetic ties the two catch lines to the two alerted requests one-to-one: request start 18:32:57.876 + latency 0.423s = 18:32:58.299 vs stderr 18:32:58.305; request start 18:32:58.465 + latency 3.443s = 18:33:01.908 vs stderr 18:33:01.909. 2 of 2 republish requests in the 3-hour window returned 500; there were no successful ones.

Confidence: `high`

## Code
- `packages/functions/src/controllers/seoController.js:605` — republish fans getAppBlockByType + createAssets out in one Promise.all, then updateAssets + updateAppStatus in a second — a burst of theme-asset REST calls on a shop whose bucket is already exhausted, none of them retried
- `packages/functions/src/controllers/seoController.js:620` — the catch that produced the alerted log line: `logger.error('[republish]', undefined, e.message)` — matches the literal `[republish] undefined Response code 429 (Too Many Requests)` in stderr; drops the stack so the failing call is unidentifiable, and line 621 sets an unconditional ctx.status = 500 for what is an upstream throttle
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults to maxRetries = 0, so shopify-api-node surfaces the first 429 as a got HTTPError instead of retrying it
- `packages/functions/src/services/shopifyService.js:504` — shopifyRetryApi — the repo's existing Retry-After-aware wrapper for codes [429, 430, 502, 503] (shopifyRetryError at :484) — exists and is not used anywhere on the republish path
- `packages/functions/src/helpers/afterInstall/createAssets.js:52` — the Promise.all burst inside createAssets: 5 handleCreateDefaultSnippet asset.get/create + updateScriptManagerSnippet + up to 2 asset.update issued concurrently, on top of the theme.list and asset.get already made at lines 25 and 49

## Evidence
- 2 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-08T17:00:00Z" AND timestamp<="2026-09-08T20:00:00Z" AND logName:"stderr" AND textPayload:"[republish]"`
- 16 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-08T17:00:00Z" AND timestamp<="2026-09-08T20:00:00Z" AND logName:"stderr" AND textPayload:"Too Many Requests"`
- 2 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-08T17:00:00Z" AND timestamp<="2026-09-08T20:00:00Z" AND httpRequest.requestUrl:"/apiSa/republish"`
- 2 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-08T18:18:00.304Z" AND timestamp<="2026-09-08T18:48:00.304Z" AND logName:"stderr" AND textPayload:"prepareAnalysisPage"`

## Job
- analyze rounds: 1
- cost: $2.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
