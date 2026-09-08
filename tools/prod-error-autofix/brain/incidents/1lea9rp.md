fingerprint: 1lea9rp
service: api
message: [getOne] PnKC4q13qtMCeY1BDfEz Error get settings:  Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:15:46.396Z
status: fix_disabled
attempt: 1

# BLOG · api · 1lea9rp

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** During the 2026-09-06 08:35–08:46Z Shopify Admin brownout, Shopify REST answered HTTP 500 to the bare, unretried `shopify.asset.get(themeId, {'asset[key]': 'config/settings_data.json'})` at getSettingDataConfig.js:12, and because that call has no shopifyRetryApi wrapper and no try/catch, got's raw HTTPError rejected the Promise.all in settingsController.getOne and produced the alerted line.

**Mechanism.** The alerted string is `[getOne] PnKC4q13qtMCeY1BDfEz Error get settings:  Response code 500 (Internal Server Error)` — logged at settingsController.js:75 as `e.message`, with NO `HTTPError: ` prefix. That prefix is the signature of shopifyRetryApi's `throw new Error(e)` (shopifyService.js:147, String(e) of a got HTTPError); its absence proves the error did NOT pass through shopifyRetryApi, so it is got's own e.message from an unwrapped shopify-api-node REST call. This is confirmed by pairing: the OTHER [getOne] line in this same window (08:36:25.829733Z, exec pk55sx5ni9nz, fingerprint 1cv0dcf) DOES carry the `HTTPError: ` prefix and is preceded 74µs earlier by `[getMainThemeId]` in the same execution — the wrapped theme.list path. The alerted line (08:37:57.292336Z, exec pk7318ofdczm) has NO [getMainThemeId] log in its execution at all, so getMainThemeId returned fine and the failure came later in the same chain. Of the five promises in getOne's Promise.all (settingsController.js:40-49), getSettingsByShop and getAuthor are Firestore; getShopifyArticles and getShopLocales both go through makeGraphQlApi (axios — its errors read `Request failed with status code 500`, as the 25 [shopifyRetryGraphQL] lines in this window show, not `Response code 500`); getShopLocales additionally swallows and returns []. The single unwrapped got call left is getSettingDataConfig.js:12 `shopify.asset.get(...)`, which sits between the already-succeeded `await getMainThemeId(shopify)` (line 11) and has neither retry nor catch. Its rejection fails the whole Promise.all and hits the catch at settingsController.js:74-81. That catch answers HTTP 200 with {success:false}, which is why the three HTTP 500 request-log entries in the window are GET /api/shops (syncShopDataFromShopify path), not /api/settings — the alert is an application log line, not a request failure. Same instance 00a41e8c1d6dd670, revision api-00166-zis, same brownout already recorded as 4nac83 / a2foaq / 13fxio6 / 1iuj6y0 / 1flj6a / gnx4is / 1cv0dcf, but a different code path from all of them.

Confidence: `high`

## Code
- `packages/functions/src/services/getSettingDataConfig.js:12` — shopify.asset.get — the only unwrapped got (shopify-api-node REST) call reachable from getOne; no shopifyRetryApi, no try/catch, so a Shopify 500 propagates raw
- `packages/functions/src/services/getSettingDataConfig.js:11` — await getMainThemeId(shopify) precedes it — it succeeded in exec pk7318ofdczm (no [getMainThemeId] log), pinning the throw to line 12
- `packages/functions/src/controllers/settingsController.js:75` — exact source of the alerted string; logs e.message, which here is got's unwrapped 'Response code 500 (Internal Server Error)'
- `packages/functions/src/controllers/settingsController.js:42` — getSettingDataConfig(shop) inside the Promise.all — its rejection fails the whole handler
- `packages/functions/src/controllers/settingsController.js:76` — catch returns 200 {success:false}, so no HTTP 500 request log for /api/settings
- `packages/functions/src/services/shopifyService.js:147` — throw new Error(e) — produces the 'HTTPError: ' message prefix seen on the OTHER [getOne] line and absent from this one
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError retryable set [429,430,502,503] excludes 500 — even wrapped calls get zero retries on a Shopify 500
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId's own logger.error — its absence in exec pk7318ofdczm is the discriminating evidence

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:22:59.653Z" AND timestamp<="2026-09-06T08:52:59.653Z" AND severity>=ERROR AND jsonPayload.tag="[getOne]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:22:59.653Z" AND timestamp<="2026-09-06T08:52:59.653Z" AND severity>=ERROR AND jsonPayload.tag="[getMainThemeId]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:22:59.653Z" AND timestamp<="2026-09-06T08:52:59.653Z" AND severity>=ERROR AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:22:59.653Z" AND timestamp<="2026-09-06T08:52:59.653Z" AND severity>=ERROR AND jsonPayload.tag="[fetchAllImagesFromShopify]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:22:59.653Z" AND timestamp<="2026-09-06T08:52:59.653Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.66

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
