fingerprint: 1ckq01e
service: apigen2
message: HTTP 500 GET /api/shopify/domains
app: SEO
repo: seo
date: 2026-09-08T02:18:57.437Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1ckq01e

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin GraphQL answered one transient HTTP 500 to shop FrCPD4Xd0SYZCzg4F3dP (dru-era.myshopify.com) at 2026-09-06T08:57:08Z, and shopifyRetryGraphQL's retryable status set is [429, 502, 503, 520] — 500 is not in it — so the upstream 500 was rethrown on the first attempt and surfaced as the merchant-facing 500 on GET /api/shopify/domains.

**Mechanism.** GET /api/shopify/domains → shopifyController.getDomains (shopifyController.js:75) → handleGetDomainsByShop (shopifyGraphQlService.js:171) → makeGraphQlApi → shopifyRetryGraphQL(handler, 5) (helpers/api.js:56). The axios POST to https://dru-era.myshopify.com/admin/api/2026-07/graphql.json returned HTTP 500; the logged error config in stderr at 08:57:09.021Z carries exactly that url and the domains/localization query body. In shopifyRetryGraphQL's catch, statusCode=500 fails `[429, 502, 503, 520].includes(statusCode)` (shopifyService.js:608), so `!isRetryError` is true and the error is rethrown immediately — no retry, no attempt budget consumed (SHOPIFY_MAX_RETRY is 50, so the misuse of `maxRetries` as the `attempt` arg is not the limiting factor). getDomains' catch sets ctx.status=500 and rethrows (shopifyController.js:82), reaching the errorHandler which logged `[unhandledError] GET /api/shopify/domains 500`. Transience is proven by the same endpoint from the same referer page succeeding at 08:57:04 (200), 08:57:06 (200) and again 0.9s later at 08:57:09 (200, 2.67s).

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:608` — isRetryError = [429, 502, 503, 520] — HTTP 500 absent, so line 610 rethrows on attempt 0
- `packages/functions/src/services/shopifyGraphQlService.js:171` — handleGetDomainsByShop issues the exact `shop { domains { url localization { country alternateLocales defaultLocale } } }` query seen in the logged axios config
- `packages/functions/src/helpers/api.js:56` — makeGraphQlApi routes the raw axios POST through shopifyRetryGraphQL, which is the only retry layer on this path
- `packages/functions/src/controllers/shopifyController.js:82` — catch sets ctx.status=500 and rethrows the Shopify error unchanged — no fallback, no 502 mapping
- `packages/functions/src/routes/api.js:344` — GET /shopify/domains → shopifyController.getDomains, the alerted route

## Evidence
- 10 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-06T08:30:00Z" AND timestamp<="2026-09-06T09:30:00Z" AND httpRequest.requestUrl:"/api/shopify/domains"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-06T08:42:22.051Z" AND timestamp<="2026-09-06T09:12:22.051Z" AND logName:"stderr" AND textPayload:"shopify/domains"`
- 11 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-06T00:00:00Z" AND timestamp<="2026-09-07T00:00:00Z" AND logName:"stderr" AND textPayload:"Request failed with status code 500"`
- 5 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-06T00:00:00Z" AND timestamp<="2026-09-07T00:00:00Z" AND logName:"stderr" AND textPayload:"FrCPD4Xd0SYZCzg4F3dP"`

## Job
- analyze rounds: 1
- cost: $2.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
