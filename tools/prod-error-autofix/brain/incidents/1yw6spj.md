fingerprint: 1yw6spj
service: apigen2
message: HTTP 500 GET /api/shopify/searchProducts
app: SEO
repo: seo
date: 2026-09-19T08:24:08.192Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1yw6spj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The router-wide decodeUri middleware on /api calls decodeURIComponent a second time on values Koa has already decoded, so any search term with a literal '%' (here title='hemnia 10%' and '10% full spec') throws URIError: URI malformed before the searchProducts controller runs, and the request returns 500.

**Mechanism.** The browser sends a correctly single-encoded query: `title=hemnia+10%25`. Koa's ctx.query decodes it once to `hemnia 10%`. decodeUri (registered with router.use at routes/api.js:69) then runs `decodeURIComponent(query[key])` on every param. A bare '%' followed by a non-hex character is an invalid escape, so this throws `URIError: URI malformed at decodeURIComponent (<anonymous>) at /workspace/lib/middleware/decodeUri.js:22:16`. No try/catch surrounds it, so errorHandler logs `[unhandledError] GET /api/shopify/searchProducts 500 URI malformed`. shopifyController.getProductUseGraphQl never runs. The trigger comes from the 404-redirect modal (referer /embed/link-manager/redirect-404): useRedirectModal.js:137 and RedirectForm.js:64 put whatever the merchant types into `title=`, and this merchant typed '10%'. The same defect covers every GET under /api: any query value containing a '%' that is not a valid escape after one decode returns 500.

Confidence: `high`

## Code
- `packages/functions/src/middleware/decodeUri.js:10` — `decodeURIComponent(query[key])` re-decodes ctx.query values that Koa has already decoded. It throws URIError on a literal '%' and has no guard. This is the frame in the prod stack (lib/middleware/decodeUri.js:22).
- `packages/functions/src/routes/api.js:69` — `router.use(decodeUri())` applies the middleware to every /api route, including /shopify/searchProducts.
- `packages/functions/src/routes/api.js:332` — Route for the alerted endpoint. getProductUseGraphQl is never reached because the middleware throws first.
- `packages/assets/src/hooks/modal/useRedirectModal.js:137` — The redirect-404 modal sends the merchant's raw search input as `title=`, which is how a literal '%' ends up in the query.

## Evidence
- 8 matching entries: `resource.labels.service_name="apigen2" AND logName:"stderr" AND textPayload:"URI malformed" AND textPayload:"/api/shopify/searchProducts" AND timestamp>="2026-09-19T07:56:48.940Z" AND timestamp<="2026-09-19T08:26:48.940Z"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND httpRequest.status>=500 AND httpRequest.requestUrl:"searchProducts" AND timestamp>="2026-09-19T07:56:48.940Z" AND timestamp<="2026-09-19T08:26:48.940Z"`

## Job
- analyze rounds: 1
- cost: $1.63

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
