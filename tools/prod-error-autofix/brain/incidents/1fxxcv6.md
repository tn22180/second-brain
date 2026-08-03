fingerprint: 1fxxcv6
service: api
message: [getOne] s0CSHvoqfajQqMc0H63G Error get settings:  Response code 429 (Too Many Requests)
app: BLOG
repo: blogs
date: 2026-08-02T19:39:11.137Z
status: mr_open
attempt: 1

# BLOG · api · 1fxxcv6

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/818

**Root cause.** getSettingDataConfig calls `shopify.asset.get(themeId, {'asset[key]': 'config/settings_data.json'})` with no retry wrapper, so a single Shopify REST Asset-endpoint 429 propagates out of getOne's Promise.all and fails the whole /api/settings response for shop s0CSHvoqfajQqMc0H63G (sk1ntro.com).

**Mechanism.** The message text `Response code 429 (Too Many Requests)` is got's HTTPError format, which in this repo can only come from shopify-api-node (REST); the axios GraphQL path in helpers/api.js formats errors as `Request failed with status code 429`. Of the five awaits in getOne's Promise.all, only getSettingDataConfig reaches shopify-api-node. Inside it, getMainThemeId (shopifyService.js:690) is wrapped in shopifyRetryApi and logs `[getMainThemeId]` before rethrowing, and handleGetFiles goes through shopifyRetryGraphQL which logs `[shopifyRetryGraphQL]` before rethrowing — neither tag appears anywhere in the window, and no `[getShopifyArticles]`/`[getShopLocales]` line appears either. That leaves the bare `shopify.asset.get` at getSettingDataConfig.js:12 as the only unguarded got call on the path. shopify-api-node is constructed with `autoLimit: true` (shopifyService.js:30), which only throttles against the standard REST leaky bucket header and does not cover the Asset endpoint's own stricter limit, so asset reads can 429 while the client believes it has budget. The merchant's admin fired 3× GET /api/settings in 7.2s plus 1× GET /api/shopify/block?key=config%2Fsettings_data.json — i.e. 4 reads of the same theme asset (each preceded by a theme.list) in under 8 seconds from one store — and the 4th hit 429 at 19:32:13.381233Z. getOne's catch returns HTTP 200 with `{success:false, error}`, which is why requests=0: the merchant saw an empty settings page, not a 5xx.

Confidence: `medium`

## Code
- `packages/functions/src/services/getSettingDataConfig.js:12` — The unguarded shopify.asset.get REST call — only got-backed call on getOne's path with no retry and no pre-rethrow log; source of the 429
- `packages/functions/src/services/getSettingDataConfig.js:11` — getMainThemeId immediately before it IS retry-wrapped, showing the omission is inconsistent within the same function
- `packages/functions/src/services/shopifyService.js:30` — autoLimit: true — throttles the standard REST bucket only, does not cover the Asset endpoint limit
- `packages/functions/src/services/shopifyService.js:141` — shopifyRetryApi, the existing 429/502/503 backoff helper — module-private, so getSettingDataConfig cannot use it today
- `packages/functions/src/services/shopifyService.js:690` — getMainThemeId wraps theme.list in shopifyRetryApi and logs [getMainThemeId] before rethrowing — absence of that tag in the window excludes it
- `packages/functions/src/helpers/api.js:151` — shopifyRetryGraphQL logs [shopifyRetryGraphQL] on every failure; absence in the window excludes all GraphQL awaits in the Promise.all
- `packages/functions/src/controllers/settingsController.js:42` — getSettingDataConfig(shop) inside Promise.all — one rejection fails all five
- `packages/functions/src/controllers/settingsController.js:75` — The exact log line in the alert; logs only e.message, which is why no status or stack reached the sink

## Evidence
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-02T19:31:30Z" AND timestamp<="2026-08-02T19:33:30Z" AND jsonPayload.message:"Response code 429"`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-02T19:31:30Z" AND timestamp<="2026-08-02T19:33:30Z" AND httpRequest.requestUrl:"/api/settings"`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-02T19:31:30Z" AND timestamp<="2026-08-02T19:33:30Z" AND httpRequest.requestUrl:"settings_data.json"`
- 1 matching entries: `timestamp>="2026-07-31T00:00:00Z" AND timestamp<="2026-08-03T00:00:00Z" AND jsonPayload.tag="[getOne]"`
- 1 matching entries: `timestamp>="2026-07-31T00:00:00Z" AND timestamp<="2026-08-03T00:00:00Z" AND (jsonPayload.message:"Response code 429" OR textPayload:"Response code 429")`

## Job
- analyze rounds: 1
- cost: $2.84
- branch: `fix/prod-blog-1fxxcv6`
- fix commit: `b681e6314f5f3787c06e034bd01f57f202e9722b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/818
- tests: 261 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../functions/src/services/getSettingDataConfig.js | 27 +++++++++++++++++-----
 packages/functions/src/services/shopifyService.js  |  2 +-
 2 files changed, 22 insertions(+), 7 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
