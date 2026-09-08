fingerprint: 1cv0dcf
service: api
message: [getOne] PnKC4q13qtMCeY1BDfEz Error get settings:  HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:13:33.403Z
status: fix_disabled
attempt: 1

# BLOG · api · 1cv0dcf

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Same 2026-09-06 08:35–08:46Z Shopify Admin brownout already recorded for BLOG api instance 00a41e8c1d6dd670 (fingerprints 4nac83 / a2foaq / 13fxio6 / 1iuj6y0 / 1flj6a / gnx4is): Shopify Admin REST answered HTTP 500 to shopify.theme.list, and because shopifyRetryError's retryable set is [429,430,502,503] with no 500, getMainThemeId rethrew on the first attempt, which made getSettingDataConfig reject inside settingsController.getOne's Promise.all and produced the alerted log line.

**Mechanism.** At 08:36:25.829659Z, execution pk55sx5ni9nz logged `[getMainThemeId] HTTPError: Response code 500 (Internal Server Error)` and 74µs later, same execution id, logged `[getOne] PnKC4q13qtMCeY1BDfEz Error get settings:  HTTPError: Response code 500 (Internal Server Error)`. The `HTTPError: ` prefix inside e.message is the signature of shopifyService.js:146 `throw new Error(e)` (String(e) of a got HTTPError), not got's own e.message ('Response code 500 (Internal Server Error)'), which pins the throw to shopifyRetryApi rather than a raw REST call: shopifyRetryError (shopifyService.js:160,166) matches only 429/430/502/503, so a 500 gives retry=0 and the very first response is rethrown. getMainThemeId (shopifyService.js:690-705) logs and rethrows; getSettingDataConfig awaits it at getSettingDataConfig.js:11; settingsController.getOne has it in its Promise.all at settingsController.js:42, so the whole Promise.all rejects and the catch at settingsController.js:75 emits the alerted line. That catch answers HTTP 200 with {success:false}, which is why the three 500 request-log entries in the window are GET /api/shops (syncShopDataFromShopify), not /api/settings — the alert is an application log line, not a request failure.

Confidence: `high`

## Code
- `packages/functions/src/controllers/settingsController.js:75` — exact source of the alerted string '[getOne] <shopId> Error get settings: '; returns 200 {success:false}, so no HTTP 500
- `packages/functions/src/controllers/settingsController.js:42` — getSettingDataConfig(shop) sits in the Promise.all — its rejection fails the whole handler
- `packages/functions/src/services/getSettingDataConfig.js:11` — await getMainThemeId(shopify) is the un-guarded first call in that path
- `packages/functions/src/services/shopifyService.js:690` — getMainThemeId wraps shopify.theme.list in shopifyRetryApi(fn, 0, 10)
- `packages/functions/src/services/shopifyService.js:704` — logs '[getMainThemeId] <e.message>' then rethrows — the paired log line 74µs before the alert
- `packages/functions/src/services/shopifyService.js:146` — throw new Error(e) — produces the 'HTTPError: Response code 500' message shape seen in both log lines
- `packages/functions/src/services/shopifyService.js:160` — retryable codes [429,430,502,503] exclude 500, so a Shopify 500 consumes zero of the 10 allowed retries

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:21:27Z" AND timestamp<="2026-09-06T08:51:27Z" AND severity>=ERROR AND jsonPayload.tag="[getOne]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:21:27Z" AND timestamp<="2026-09-06T08:51:27Z" AND severity>=ERROR AND jsonPayload.tag="[getMainThemeId]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:21:27Z" AND timestamp<="2026-09-06T08:51:27Z" AND severity>=ERROR AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:21:27Z" AND timestamp<="2026-09-06T08:51:27Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
