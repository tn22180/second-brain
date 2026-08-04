fingerprint: re1fqz
service: apisagen2
message: HTTP 500 GET /apiSa/removeApp
app: SEO
repo: seo
date: 2026-08-04T09:21:40.231Z
status: inconclusive
attempt: 1

# SEO · apisagen2 · re1fqz

**Outcome.** fix blocked at no_test_added

**Root cause.** getAllTheme issues its Themes query through a bare `shopify.graphql()` with no shopifyRetryGraphQL wrapper, so a Shopify THROTTLED error thrown on the first attempt propagates straight out of seoController.removeApp and becomes HTTP 500.

**Mechanism.** Both 500s logged `[removeApp] undefined Throttled` (09:07:24.203Z, 09:07:28.823Z), each ~150-175ms after its request started — too fast for any retry backoff. removeApp (controllers/seoController.js:631) awaits getAllTheme(shopify); getAllTheme (services/shopifyService.js:1483-1502) calls shopify.graphql() directly. shopify-api-node throws on any `errors` array, and a rate-limited Admin GraphQL response is HTTP 200 with `errors[0].extensions.code = 'THROTTLED'` and message 'Throttled'. shopifyRetryGraphQL already has the branch that absorbs exactly this thrown-throttle shape (shopifyService.js:574-585, up to SHOPIFY_GRAPHQL_THROTTLE_MAX_RETRY=5), but getAllTheme never goes through it, so attempt 0 rethrows. The controller catch (seoController.js:678-682) sets ctx.status=500. Context: the apisagen2 instance was in a heavy throttle window — 2000+ `[shopifyRetryGraphQL] GraphQL THROTTLED. Retrying` lines in the 30-min window, with wrapped call sites at attempt 30-40/50 — so the unwrapped call had near-certain odds of being throttled.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:1484` — getAllTheme calls shopify.graphql() unwrapped — no shopifyRetryGraphQL, so a THROTTLED throw escapes on attempt 0
- `packages/functions/src/controllers/seoController.js:631` — removeApp awaits getAllTheme(shopify); this is the throwing call, ~150ms into the request
- `packages/functions/src/controllers/seoController.js:679` — catch logs '[removeApp] undefined <message>' — the exact prod line '[removeApp] undefined Throttled'; next line sets ctx.status = 500
- `packages/functions/src/services/shopifyService.js:574` — isThrownGraphqlThrottle branch that already handles this exact thrown-throttle shape — proof the retry exists and getAllTheme simply bypasses it
- `packages/functions/src/routes/api.js:119` — router.get('/removeApp', seoController.removeApp) — the route reached as /apiSa/removeApp via getRoutes('/apiSa') in handlers/apiSa.js:70

## Evidence
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-04T08:54:00Z" AND timestamp<="2026-08-04T09:24:00Z" AND textPayload:"removeApp"`
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-04T08:54:00Z" AND timestamp<="2026-08-04T09:24:00Z" AND httpRequest.status>=500`
- 2000 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-04T08:54:00Z" AND timestamp<="2026-08-04T09:24:00Z" AND textPayload:"THROTTLED"`
- 5 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-04T09:07:20Z" AND timestamp<="2026-08-04T09:07:40Z" AND NOT textPayload:"THROTTLED"`

## Job
- analyze rounds: 1
- cost: $4.60

```
packages/functions/src/controllers/seoController.js      | 5 +++--
 packages/functions/src/services/shopifyGraphQlService.js | 5 +++--
 packages/functions/src/services/shopifyService.js        | 6 ++++--
 3 files changed, 10 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
