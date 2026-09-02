fingerprint: xg1b4z
service: apigen2
message: HTTP 500 GET /api/shopify/themes
app: SEO
repo: seo
date: 2026-09-02T09:04:43.583Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · xg1b4z

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify's Admin REST answered 400 {"error":"app_not_installed"} to the @avada/core `shopifyCharge` middleware for the shop behind these 4 requests, and because @avada/shopify-api's HttpResponseError carries no `.status`, errorHandler defaulted it to 500 instead of surfacing it as a 4xx re-auth.

**Mechanism.** All 4 alerted 500s are GET /api/shopify/themes from referer https://seo.apps.avada.io/embed/performance/speed-up, 0.67-0.93s each, on revision apigen2-00358-wol. Each one has exactly two stderr lines — `[unhandledError] GET /api/shopify/themes 500` and `[api] undefined GET /api/shopify/themes 500` — whose payload is `HttpResponseError: Received an error response (400 Bad Request) from Shopify` with `response.body = {error: 'app_not_installed', error_description: 'The application is not installed on this shop.'}` and a stack entirely inside `@avada/shopify-api/dist/clients/http_client/http_client.js:248` (RestClient). The controller is not the thrower: shopifyController.getThemes wraps its whole body in try/catch and answers 200 `{success:false}` (packages/functions/src/controllers/shopifyController.js:630-655), and that catch logs via `logger.error(e)` with no prefix — no such line exists in the window. The `[api]` line prints shopID as `undefined`, i.e. `ctx.state.user` was never populated (packages/functions/src/handlers/api.js:78), so the throw happened upstream of `createAuthMiddleware()` (api.js:65). The only middleware mounted before it that issues a Shopify Admin REST call with the shop's stored offline token is `shopifyCharge({...})` from @avada/core (api.js:49). Its HttpResponseError has no `.status`, so `const status = err.status || 500` in errorHandler (packages/functions/src/middleware/errorHandler.js:14) classifies an upstream 400 as a server fault, returns 500 and logs at severity ERROR — which is what fired the alert. The same page returned 200 on the same endpoint 47 seconds earlier (08:58:37), and no `app/uninstalled` webhook landed in 08:50-09:05Z, so the token was already dead for this shop rather than revoked mid-window; no shop id is recoverable because neither error logger prints the shop domain when auth has not run.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/api.js:49` — shopifyCharge() from @avada/core — the only pre-route middleware that calls Shopify Admin REST with the shop's stored offline token, which is what got the 400 app_not_installed
- `packages/functions/src/middleware/errorHandler.js:14` — `const status = err.status || 500` — HttpResponseError carries the upstream code in `response.code` (400), not `.status`, so it is reported as a 500 and logged at ERROR
- `packages/functions/src/handlers/api.js:78` — `const {shopID} = ctx.state?.user || {}` — explains the literal `undefined` in the log line, proving auth never ran and the throw was upstream of the controller
- `packages/functions/src/controllers/shopifyController.js:630` — getThemes wraps everything in try/catch returning 200 {success:false}; it cannot produce a 500, so the alerted failure is not in this handler

## Evidence
- 8 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T08:44:35Z" AND timestamp<="2026-09-02T09:14:35Z" AND textPayload:"app_not_installed"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-01T09:00:00Z" AND timestamp<="2026-09-02T09:20:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/themes"`
- 5 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T08:58:30Z" AND timestamp<="2026-09-02T09:00:30Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests" AND httpRequest.referer="https://seo.apps.avada.io/embed/performance/speed-up"`

## Job
- analyze rounds: 1
- cost: $3.25

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
