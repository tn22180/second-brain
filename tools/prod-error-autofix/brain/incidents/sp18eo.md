fingerprint: sp18eo
service: api
message: [getOne] gddoilEQDA3qDbQch9xb Error get settings:  Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-08-14T17:16:24.327Z
status: mr_open
attempt: 1

# BLOG · api · sp18eo

**Outcome.** duplicate of 1fxxcv6 — MR https://gitlab.com/avada/blogs/-/merge_requests/818

**Root cause.** GET /api/settings failed for shop gddoilEQDA3qDbQch9xb because the bare, unretried `shopify.asset.get(themeId, {'asset[key]': 'config/settings_data.json'})` inside getSettingDataConfig got a Shopify Admin REST HTTP 503, and that rejection propagates out of settingsController.getOne's Promise.all and blanks the whole settings payload (`success:false, data:{}`). Same defect already recorded as fingerprint 1fxxcv6 (MR https://gitlab.com/avada/blogs/-/merge_requests/818, open/unmerged).

**Mechanism.** The logged text `Response code 503 (Service Unavailable)` is got's HTTPError format, i.e. shopify-api-node (3.15.0, packages/functions/package.json:73) — not axios 0.27, which formats as `Request failed with status code 503`. That rules out every GraphQL leg of getOne's Promise.all: getShopifyArticles and handleGetFiles both go through makeGraphQlApi → axios (helpers/api.js:126), and getShopLocales swallows all throws and returns [] (shopifyGraphQlService.js:2471-2477). getSettingsByShop / getAuthor are Firestore (gRPC error shape). Of the two got calls left, getMainThemeId logs `[getMainThemeId]` before rethrowing (shopifyService.js:704) and is itself wrapped in shopifyRetryApi — no `[getMainThemeId]` line exists in the execution (execution_id t710o4n9ak8j had exactly one log line total) nor anywhere in the 24h window. The only remaining un-retried, un-logged got call is `shopify.asset.get` at getSettingDataConfig.js:12; its rejection unwinds to the catch at settingsController.js:75, which logs e.message and returns `{success:false, data:{}}` with HTTP 200 (requests read = 0 entries at status>=500).

Confidence: `medium`

## Code
- `packages/functions/src/services/getSettingDataConfig.js:12` — bare shopify.asset.get — no shopifyRetryApi wrapper, no catch; the only unguarded got call in getOne's fan-out
- `packages/functions/src/controllers/settingsController.js:42` — getSettingDataConfig(shop) sits in the Promise.all, so its rejection kills the whole settings response
- `packages/functions/src/controllers/settingsController.js:75` — the catch that emitted the alerted line `[getOne] <shopId> Error get settings: <e.message>`
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId logs [getMainThemeId] before rethrowing — its absence in the window excludes the theme.list leg
- `packages/functions/src/services/shopifyService.js:690` — theme.list IS wrapped in shopifyRetryApi; asset.get is not — the asymmetry is the defect
- `packages/functions/src/helpers/api.js:126` — makeGraphQlApi runs on the axios helper, whose 5xx message is 'Request failed with status code 503' — excludes all GraphQL legs
- `packages/functions/src/services/shopifyGraphQlService.js:2471` — getShopLocales catches everything and returns [] — cannot be the thrower

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-14T16:45:43.844Z" AND timestamp<="2026-08-14T17:15:43.844Z" AND jsonPayload.message:"Error get settings"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T17:00:00Z" AND timestamp<="2026-08-14T17:20:00Z" AND jsonPayload.message:"Response code"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-14T16:45:43.844Z" AND timestamp<="2026-08-14T17:15:43.844Z" AND jsonPayload.tag="[getOne]"`

## Job
- analyze rounds: 1
- cost: $2.23
- MR: https://gitlab.com/avada/blogs/-/merge_requests/818

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
