fingerprint: 1afa4it
service: apisagen2
message: HTTP 500 GET /apiSa/shopify/media
app: SEO
repo: seo
date: 2026-10-14T08:17:59.418Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · 1afa4it

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop 69HG5FXtAUIuSwgCjOL4 (xprstls.myshopify.com) holds a dead Shopify Admin token — every Admin API call for it returned 401 during the 08:10:43–08:14:04Z standalone-admin session — and the two alerted apiSa controllers (getShopifyMedia, getShopLocales) have no try/catch, so the upstream 401 escapes to the global error handler as HTTP 500.

**Mechanism.** stderr 08:11:03.306 `[getProductMedia] 69HG5FXtAUIuSwgCjOL4 7664405315647 Request failed with status code 401` → axios config in the same entry shows `POST https://xprstls.myshopify.com/admin/api/2026-07/graphql.json` with `X-Shopify-Access-Token: shpat_78c66c…` rejected 401. getProductMedia logs and rethrows (shopifyGraphQlService.js:858-859). Its only caller, getShopifyMedia (shopifyController.js:1106-1124, routed at routes/api.js:377), awaits it with no catch, so the error reaches createErrorHandler, which assigns `status = err.status || 500` (middleware/errorHandler.js:14) — an axios/got error carries no `.status`, so 500 — and logs `[unhandledError] GET /apiSa/shopify/media 500`. Same shape on /apiSa/shop-locales via the equally unguarded getShopLocales (shopController.js:393-404). Not an app-wide fault: the identical URLs `/apiSa/shopify/media?productId=7664405315647` and `/apiSa/shop-locales` returned 200 at 08:16:05 for another shop on the same apisagen2 instance.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:1106` — getShopifyMedia — the alerted endpoint; awaits getProductMedia with no try/catch, so any Shopify error becomes a 500
- `packages/functions/src/services/shopifyGraphQlService.js:859` — getProductMedia logs `[getProductMedia] <shopId> <productId> <msg>` (matches stderr 08:11:02.910 / 08:11:03.306) then rethrows the raw 401
- `packages/functions/src/controllers/shopController.js:393` — getShopLocales — second symptom endpoint, same unguarded shape; produced the two /apiSa/shop-locales 500s
- `packages/functions/src/middleware/errorHandler.js:17` — status = err.status || 500 turns a Shopify-side 401 into a server 500 and logs the whole error object
- `packages/functions/src/helpers/api.js:52` — makeGraphQlApi puts the live accessToken in axios headers; because errorHandler logs the full err, `X-Shopify-Access-Token: shpat_…` is written in plaintext to Cloud Logging (visible verbatim in the 08:11:03.377 entry)

## Evidence
- 4 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-10-14T07:56:04.677Z" AND timestamp<="2026-10-14T08:26:04.677Z" AND httpRequest.status>=500`
- 12 matching entries: `timestamp>="2026-10-07T00:00:00Z" AND textPayload:"69HG5FXtAUIuSwgCjOL4" AND textPayload:"401"`
- 28 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-10-14T07:56:04.677Z" AND timestamp<="2026-10-14T08:26:04.677Z" AND logName:"stderr"`
- 30 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-10-14T08:00:00Z" AND timestamp<="2026-10-14T08:30:00Z" AND httpRequest.status>=200 AND httpRequest.status<500`
- 1 matching entries: `timestamp>="2026-10-14T08:11:03.300Z" AND timestamp<="2026-10-14T08:11:03.400Z" AND textPayload:"xprstls"`

## Job
- analyze rounds: 1
- cost: $1.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
