fingerprint: ct2hgz
service: apiSa
message: HTTPError: Response code 401 (Unauthorized)
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-12T14:20:35.581Z
status: inconclusive
attempt: 3

# IMG-OPT · apiSa · ct2hgz

**Outcome.** fix blocked at agent_failed

**Root cause.** Shop 3ddd6b-2.myshopify.com's stored offline access token ***REMOVED-SECRET*** stopped being accepted by Shopify Admin some time after 00:49:56Z on 2026-08-07, and because nothing in apiSa detects or gates a dead token, all 7 apiSa executions for that shop between 10:29:54Z and 10:55:39Z rebuilt a Shopify client from it and took HTTP 401 — the one whose catch is a bare console.error(e) (getThemes shape) was tagged severity=ERROR by the Cloud Functions log parser and is the only thing the prod-error-alerts sink could match.

**Mechanism.** auth logged the install at 2026-08-07T00:44:16-00:44:20Z: 'After validate oauth callback 3ddd6b-2.myshopify.com' then '3ddd6b-2.myshopify.com ***REMOVED-SECRET***' (initShopify's console.log, shopifyService.js:39). That same token string worked all through 00:44-00:49 (api, createPreviewImages, webHookHandlerSubscriber, postOnboardingSpeedReportSubscriber, an Expert $99 appSubscriptionCreate at 00:45:10). At 10:29:54Z it stopped working: 7 distinct apiSa executions (w8h59g7k1boi, w8h5kyjax1jb, ywxljtmooxtw, 8jej2c18u86g, 8jejkv6yqqw3, 8jejntyix151, 8fxc96y5x6yc) each emit the initShopify token line for 3ddd6b-2 and then a 401 — 12 '401' log lines, 7/7 executions, zero successes for that shop in the 26-minute span. No 'uninstallApp' line exists for this shop anywhere between install and 20:00Z, while uninstallApp logging demonstrably works (15 lines project-wide over 2026-08-05..08), and the daily countImagesHandler still picked the shop up at 19:00:34Z with the same dead token — so the shop doc is still live and un-flagged: uninstallationService.js:24 only ever writes {uninstalled,uninstalledAt} and apiSa.js:48 mounts verifyRequest() with no dead-token gate, so the still-open standalone tab kept calling. Which of the seven surfaced as an alert is decided purely by log-string shape, not by the error: w8h59g7k1boi's catch prefixes it ('checkHasImages error', shopifyController.js:390), w8h5kyjax1jb / the three at 10:32 / 8fxc96y5x6yc prefix it too ('main theme error' shopifyService.js:129 and '[getCurrentAppHandle]' shopifyService.js:441) — all six stay severity DEFAULT and never reach the sink. ywxljtmooxtw instead hits a bare console.error(e), so Cloud Functions sees an unprefixed got stack, tags it severity=ERROR and attaches errorGroups COjFyJ_-2t2VTA; that single line is the only severity>=ERROR entry apiSa produced in the 30-minute window. Its shape — one initShopify log 570ms in, then exactly one got request (timings total 295ms, dns 129) failing 401, execution 883ms — matches getThemes (shopifyController.js:333, routed at routes/api.js:127): getShopById -> initShopify -> getAllTheme's single shopify.graphql (shopifyService.js:520) -> catch console.error(e) at shopifyController.js:353. The exact route is not fully recoverable: apiSa is a gen1 cloud_function, its entries carry no httpRequest payload, and the trace 3b5d4b977f3b756c273c918d93736951 holds no request log. Every one of the seven still 'finished with status code: 200' because each catch swallows the error, which is why the requests read (httpRequest.status>=500) is empty. Why the token died is NOT proven by these logs — no uninstall webhook was processed, so revocation happened outside anything this app recorded.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/shopifyController.js:353` — bare console.error(e) in getThemes' catch — the only unprefixed error string among the seven 401 executions, so Cloud Functions tags it severity=ERROR and it is the one that fired the alert
- `packages/functions/src/controllers/shopifyController.js:333` — getThemes: getShopById -> initShopify -> one getAllTheme graphql call, matching execution ywxljtmooxtw's shape (one initShopify log, exactly one got request, 883ms)
- `packages/functions/src/routes/api.js:127` — router.get('/shopify/themes', shopifyController.getThemes) — the route is mounted on the shared router that apiSa serves via getRoutes('/apiSa')
- `packages/functions/src/services/shopifyService.js:520` — getAllTheme issues a single shopify.graphql call through shopify-api-node (got), which is the request that returned 401 with the got as-promise/index.js:118 stack
- `packages/functions/src/services/shopifyService.js:34` — initShopify builds the client from the stored accessToken with no validity check; all 7 executions built a client here from the revoked token
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) — emits the '3ddd6b-2.myshopify.com shpat_b09d...' line immediately before every 401, and writes live Admin tokens into Cloud Logging (31 shpat_ lines in the 10:00-11:00Z hour alone)
- `packages/functions/src/handlers/apiSa.js:48` — apiSa mounts verifyRequest() and the router with no uninstalled-shop / dead-token gate, so a shop with a revoked token keeps hitting Shopify on every tab interaction
- `packages/functions/src/services/uninstallationService.js:24` — uninstallApp's only mutation writes {uninstalled, uninstalledAt} and never clears accessToken — and here it never even ran, so nothing marks the token dead by any path
- `packages/functions/src/controllers/shopifyController.js:390` — console.error('checkHasImages error', e) — same 401, same shop, 5 seconds earlier, stayed severity DEFAULT because it is prefixed; proves the prefix, not the error, decides sink visibility
- `packages/functions/src/services/shopifyService.js:129` — console.error('main theme error', e.message) — matches the 10:29:54.674Z / 10:32:21-23 / 10:55:39Z lines verbatim, identifying getMainThemeId as a second 401 source on the same shop that never alerted
- `packages/functions/src/services/shopifyService.js:441` — console.error('[getCurrentAppHandle]', e.message) — matches the '[getCurrentAppHandle] Request failed with status code 401' lines paired with each main-theme 401

## Evidence
- 1 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-07T10:15:05Z" AND timestamp<="2026-08-07T10:45:05Z" AND severity>=ERROR`
- 12 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-07T10:29:00Z" AND timestamp<="2026-08-07T10:56:00Z" AND textPayload:"401"`
- 28 matching entries: `resource.labels.function_name="apiSa" AND labels.execution_id="ywxljtmooxtw" AND timestamp>="2026-08-07T10:29:00Z" AND timestamp<="2026-08-07T10:31:00Z"`
- 69 matching entries: `timestamp>="2026-08-07T00:44:00Z" AND timestamp<="2026-08-07T20:00:00Z" AND textPayload:"3ddd6b-2"`
- 15 matching entries: `timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND textPayload:"uninstallApp"`
- 31 matching entries: `timestamp>="2026-08-07T10:00:00Z" AND timestamp<="2026-08-07T11:00:00Z" AND textPayload:"shpat_"`

## Job
- analyze rounds: 1
- cost: $2.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
