fingerprint: omq87x
service: api
message: [setupTemplates] error create template HTTPError: Response code 429 (Too Many Requests)
app: BLOG
repo: blogs
date: 2026-08-28T07:14:21.796Z
status: fix_disabled
attempt: 1

# BLOG · api · omq87x

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** setupTemplates' asset.get catch returns undefined for every non-404 failure, so a Shopify REST 429 on the read is misread as 'template absent' and the code immediately fires an unretried asset.create write on the live theme, which 429s too — both logged at severity ERROR from a fire-and-forget path that runs on every single /api/shops login.

**Mechanism.** GET /api/shops → @avada/core afterLogin → afterLoginService (packages/functions/src/services/after-login.service.js:37) calls setupTemplates unconditionally, every login, with no installed-flag guard. Inside setupTemplates, getMainThemeId's theme.list goes through shopifyRetryApi (shopifyService.js:690, maxRetry 10, handles 429) and survived; the two calls that are NOT wrapped are shopify.asset.get (after-login.service.js:97) and shopify.asset.create (after-login.service.js:111). Shop m0a7yBfBnUIphO87uEMX (oliver-pet-care.myshopify.com) loaded /api/shops 4 times in 15.0s (executions cm3d37f2bj0f 07:10:00.845Z, cm3m3druu7ru 07:10:12.841Z, cm3myn3q9hec 07:10:13.788Z, cm3om40r8nek 07:10:15.866Z), each run firing theme.list + asset.get plus autoApplyBrandColorsForNewInstall's own getMainThemeId theme.list (themeBrandColor.service.js:17) — the app's own REST bucket burn. On the 4th run the asset.get returned HTTP 429; the catch at line 99-109 matches only status===404 for the silent path, logs, and falls off the end returning undefined (line 109). `if (!existingTemplate)` at line 110 is therefore true, and asset.create fires 112 ms later and 429s as well — same execution_id cm3om40r8nek, same instanceId, revision api-00161-zuj. requests=0 in the window: the call is `void`-ed at line 37 so no HTTP status changed; the alert is pure log noise from a swallowed background failure. The latent damage is that shopify.asset.create is an upsert (PUT /themes/{id}/assets.json): whenever the get fails with 429/5xx while the template does exist and the create then succeeds, the merchant's edited templates/page.avada-articles-tags.liquid is silently overwritten with the packaged file.

Confidence: `high`

## Code
- `packages/functions/src/services/after-login.service.js:99` — asset.get's catch only returns undefined explicitly for 404; every other status (429 here) falls through the logger call and also returns undefined
- `packages/functions/src/services/after-login.service.js:110` — `if (!existingTemplate)` cannot distinguish 'confirmed absent' from 'read failed', so a 429 read triggers the write
- `packages/functions/src/services/after-login.service.js:111` — asset.create — the second alerted 429; unwrapped by any retry helper, and an upsert against the live theme
- `packages/functions/src/services/after-login.service.js:37` — setupTemplates runs on every login for every shop with no installed-state guard, and is void-ed so failures only surface as ERROR logs
- `packages/functions/src/services/shopifyService.js:690` — getMainThemeId wraps theme.list in shopifyRetryApi(0, 10) — the retry helper that exists and absorbs 429, but is not applied to the two asset calls
- `packages/functions/src/services/shopifyService.js:141` — shopifyRetryApi definition: retries on the codes shopifyRetryError classifies, which includes 429
- `packages/functions/src/services/themeBrandColor.service.js:17` — second getMainThemeId per login from autoApplyBrandColorsForNewInstall, doubling the REST calls afterLoginService makes per /api/shops

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-27T07:00:00Z" AND timestamp<="2026-08-28T07:30:00Z" AND jsonPayload.message:"[setupTemplates]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-28T06:55:00Z" AND timestamp<="2026-08-28T07:30:00Z" AND labels.execution_id="cm3om40r8nek"`
- 5 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-28T07:05:00Z" AND timestamp<="2026-08-28T07:15:00Z" AND jsonPayload.message:"m0a7yBfBnUIphO87uEMX"`
- 60 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-28T07:08:00Z" AND timestamp<="2026-08-28T07:12:00Z" AND httpRequest.requestUrl!=""`

## Job
- analyze rounds: 1
- cost: $1.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
