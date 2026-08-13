fingerprint: xg7e5b
service: apisagen2
message: HTTP 500 GET /apiSa/dev/shop-access-token
app: SEO
repo: seo
date: 2026-08-13T09:44:39.922Z
status: mr_open
attempt: 1

# SEO · apisagen2 · xg7e5b

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2192

**Root cause.** packages/functions/src/controllers/devController.js references the identifier `shopifyConfig` but the file has no `import shopifyConfig from '@functions/config/shopify'` — the merge of feat/worker-pubsub-migration (d71f665015) dropped that import line — so `getShopAccessToken` throws ReferenceError: shopifyConfig is not defined on every call, which its own catch turns into ctx.throw(500).

**Mechanism.** GET /apiSa/dev/shop-access-token → routes/api.js:383 → devController.getShopAccessToken. The devPassword gate passes, getShopById resolves, then line 1891 evaluates `shopifyConfig.accessTokenKey`. `shopifyConfig` is unbound in the module scope (grep for `config/shopify` in devController.js returns nothing; `git show 771ddb65fe:...devController.js | grep -c 'import shopifyConfig'` = 1 while `git show d71f665015:...` = 0, so the merge deleted it). Babel's CommonJS output has no `_shopify` binding either, so the identifier resolves to nothing and V8 raises ReferenceError. The catch at :1895 logs `[getShopAccessToken] undefined shopifyConfig is not defined` and calls ctx.throw(500, e.message) — which prod logs as `at getShopAccessToken (/workspace/lib/controllers/devController.js:2019:14)` (lib/ is babel output, line differs from src/). The apiSa error handler (handlers/apiSa.js:77) then logs `[apiSa] IxybKdympt7vPITL5VDD shopifyConfig is not defined` and the request returns HTTP 500. Same defect family already recorded on apigen2 as fingerprint 1tb355r (MR 2180) and as the appConfig loss in 1l9y5gr / ri5pmt / i9jsmj — one merge, several deleted imports.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:1891` — `prepareShopData(shop.id, shop, shopifyConfig.accessTokenKey)` — the unbound identifier that throws; this is the only statement between the resolved getShopById and the catch
- `packages/functions/src/controllers/devController.js:1895` — `logger.error('[getShopAccessToken]', undefined, e.message)` then ctx.throw(500, e.message) — matches the two stderr lines `[getShopAccessToken] undefined shopifyConfig is not defined` verbatim, including the literal `undefined` shopID arg
- `packages/functions/src/controllers/devController.js:1881` — `export async function getShopAccessToken(ctx)` — the symbol named in the prod stack frame `/workspace/lib/controllers/devController.js:2019`
- `packages/functions/src/controllers/devController.js:1024` — second unbound use, `app_name: shopifyConfig.appName` — proves the missing import is file-wide, not local to this handler; any Dev Zone action reaching this line throws the same way
- `packages/functions/src/routes/api.js:383` — `router.get('/dev/shop-access-token', devController.getShopAccessToken)` — ties the alerted path to the handler; getRoutes('/apiSa') at handlers/apiSa.js:70 mounts it under /apiSa
- `packages/functions/src/config/shopify.js:8` — `accessTokenKey: process.env.SHOPIFY_ACCESS_TOKEN_KEY` — the module that should be imported; the fix is one import line, matching the 40+ other files that import it (e.g. services/shopifyService.js:10)
- `packages/functions/src/handlers/apiSa.js:77` — `logger.error('[apiSa]', shopID, err.message)` — produces the `[apiSa] IxybKdympt7vPITL5VDD shopifyConfig is not defined` line, confirming the service and the shop

## Evidence
- 6 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T09:14:54.972Z" AND timestamp<="2026-08-13T09:44:54.972Z" AND "shopifyConfig is not defined"`
- 2 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T09:14:54.972Z" AND timestamp<="2026-08-13T09:44:54.972Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T09:14:54.972Z" AND timestamp<="2026-08-13T09:44:54.972Z" AND "[getShopAccessToken]"`

## Job
- analyze rounds: 2
- cost: $8.28
- branch: `fix/prod-seo-xg7e5b`
- fix commit: `c250f7f8b6c2c22f8c085342b2ff84b8b925d8e6`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2192
- tests: 1037 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/devController.js | 1 +
 1 file changed, 1 insertion(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
