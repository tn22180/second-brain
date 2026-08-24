fingerprint: 1ocnbc4
service: proxygen2
message: HTTP 500 POST /proxy/optimize/start
app: SEO
repo: seo
date: 2026-08-22T03:55:17.574Z
status: fix_disabled
attempt: 1

# SEO · proxygen2 · 1ocnbc4

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /proxy/optimize/start is registered with only `jsonType` and no auth middleware, so nothing ever sets `ctx.state.user`, and the shared handler `seoController.startOptimize` calls `getCurrentShop(ctx)` which dereferences `ctx.state.user.shopID` — every call from the admin extension throws TypeError and returns 500.

**Mechanism.** The `optimize-product-images` admin UI extension calls `https://seo.apps.avada.io/proxy/optimize/start` (extensions/optimize-product-images/src/utils.js:29) — and unlike its sibling helpers getShop/updateShop/revert it sends no `Authorization: Bearer <sessionToken>` header and no `?shop=`. On the server, packages/functions/src/routes/proxy.js:43 mounts that path with `jsonType` only: no `verifySessionToken`, no `validateAccessToken`, no `verifyProxySignature`. So `ctx.state.user` is undefined when control reaches `startOptimize` (packages/functions/src/controllers/seoController.js:743), whose first statement is `const shopID = getCurrentShop(ctx)`; `getCurrentShop` returns `ctx.state.user.shopID` (packages/functions/src/helpers/auth.js:11) → `TypeError: Cannot read properties of undefined (reading 'shopID')`. The clientApi error middleware (packages/functions/src/handlers/proxy/clientApi.js:49) catches it, sets 500 and logs `[proxy] POST /proxy/optimize/start 500 ...`. The same controller works on api.js:137 only because the /api router runs the session/auth middleware first. 6.8 ms latency confirms the throw happens before any Firestore or Shopify I/O.

Confidence: `high`

## Code
- `packages/functions/src/routes/proxy.js:43` — route registered as `router.post('/optimize/start', jsonType, seoController.startOptimize)` — no auth middleware, so ctx.state.user is never populated (contrast :39-:41 where /proxy/shop, /proxy/shop/update, /proxy/image/revert all use verifySessionToken)
- `packages/functions/src/controllers/seoController.js:743` — startOptimize's first statement `const shopID = getCurrentShop(ctx);` — the frame named in the prod stack at lib/controllers/seoController.js:833
- `packages/functions/src/helpers/auth.js:11` — `return ctx.state.user.shopID;` — the exact throw site, prod frame lib/helpers/auth.js:19
- `extensions/optimize-product-images/src/utils.js:29` — the calling extension's startOptimize() posts to /proxy/optimize/start with only Content-Type — the only helper in this file that omits the session token, matching the `referer: https://extensions.shopifycdn.com/` on the failing request
- `packages/functions/src/handlers/proxy/clientApi.js:49` — catch-all that turned the TypeError into the 500 and emitted the `[proxy] POST ... 500` stderr line
- `packages/functions/src/controllers/shopController.js:151` — updateShopProxy shows the correct proxy-side pattern: resolve the shop from ctx.state.shopDomain set by verifySessionToken, never from ctx.state.user

## Evidence
- 1 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-20T00:25:35Z" AND timestamp<="2026-08-20T00:55:35Z" AND logName:"stderr" AND textPayload:"POST /proxy/optimize/start 500"`
- 1 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-20T00:25:35Z" AND timestamp<="2026-08-20T00:55:35Z" AND httpRequest.requestUrl:"/proxy/optimize/start" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND httpRequest.requestUrl:"/proxy/optimize/start"`
- 1 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-19T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND logName:"stderr" AND textPayload:"POST /proxy/optimize/start 500"`

## Job
- analyze rounds: 1
- cost: $1.91

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
