fingerprint: 1nxcmmh
service: sidekickgen2
message: HTTP 500 GET /sidekick/seo/page-meta
app: SEO
repo: seo
date: 2026-08-14T02:59:39.761Z
status: mr_open
attempt: 1

# SEO · sidekickgen2 · 1nxcmmh

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2198

**Root cause.** Shop Pk6T1NRT6nSPiMJhzGVf's stored Shopify offline token was granted before `read_locales` was added to the app's scope list, so the `shopLocales` GraphQL query inside readCurrentMeta's Promise.all throws ACCESS_DENIED — and unlike its two sibling calls it carries no `.catch`, so the whole read-only Sidekick page-meta tool 500s.

**Mechanism.** GET /sidekick/seo/page-meta → SidekickController.getPageMeta (sidekick.controller.js:14) → SidekickPreviewService.getPageMeta (sidekick-preview.service.js:73) → readCurrentMeta (:24). The Promise.all at :29 runs four calls; getTitleBodyHtmlById (:32) and shopify.metafield.list (:33) each end in `.catch(...)`, but `getPrimaryLocale(shop, true)` (:31) does not. getPrimaryLocale (helpers/analysis.js:423) short-circuits only when `shop.primaryShopLocale` is set; this shop doc has no `primaryShopLocale`, so it falls through to `shopLocalesGraphQL(shopify)` at analysis.js:428, which POSTs the `shopLocales` query (helpers/graphql/shopLocalesGraphQL.js:16). Shopify answers ACCESS_DENIED — 'Required access: `read_locales` access scope or `read_markets_home` access scope' — shopify-api-node raises RequestError (stack: got/as-promise → shopify-api-node/index.js:299), the rejection escapes Promise.all, and the controller's catch converts it to `ctx.throw(500, e.message)` (sidekick.controller.js:20; prod stack names lib/modules/sidekick/sidekick.controller.js:28). `read_locales` IS declared at config/shopify.js:22, so the app asks for it — this token simply predates the change and the merchant never re-consented. Same shop, same token, same error hit calculateScoreForResource 8s earlier (22:06:54) on the /seo/page-status path, but that call site catches it (calculateScore.js:575) and returned 200 — proving the defect is the missing guard in readCurrentMeta, not the scope alone.

Confidence: `high`

## Code
- `packages/functions/src/modules/sidekick/sidekick-preview.service.js:31` — getPrimaryLocale(shop, true) is the only member of this Promise.all with no .catch — its rejection is what 500s the request
- `packages/functions/src/modules/sidekick/sidekick-preview.service.js:32` — sibling call in the same Promise.all that DOES swallow its error, showing the intended tolerance
- `packages/functions/src/helpers/analysis.js:428` — getPrimaryLocale falls through to shopLocalesGraphQL when shop.primaryShopLocale is unset — the query that was denied
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:16` — the `shopLocales` field named verbatim in the Shopify ACCESS_DENIED message
- `packages/functions/src/modules/sidekick/sidekick.controller.js:20` — ctx.throw(500, e.message) — turns an upstream scope error into the alerted HTTP 500; matches lib/.../sidekick.controller.js:28 in the prod stack
- `packages/functions/src/config/shopify.js:22` — read_locales IS in the requested scope list, so the app-level config is correct and the gap is this shop's un-reconsented token
- `packages/functions/src/services/calculateScore.js:575` — the other shopLocales consumer hit in the same 9s by the same shop; its catch kept /seo/page-status at 200

## Evidence
- 7 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-13T21:52:04.504Z" AND timestamp<="2026-08-13T22:22:04.504Z" AND textPayload:"Access denied for shopLocales field"`
- 2 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-13T21:52:04.504Z" AND timestamp<="2026-08-13T22:22:04.504Z" AND httpRequest.status>=500`
- 7 matching entries: `timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"Access denied for shopLocales field"`
- 1 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-13T22:06:00Z" AND timestamp<="2026-08-13T22:07:00Z" AND textPayload:"calculateScoreForResource"`

## Job
- analyze rounds: 2
- cost: $5.20
- branch: `fix/prod-seo-1nxcmmh`
- fix commit: `7826302c95b725809c3ba17d5be69c21acf3ae4d`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2198
- tests: 1037 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
.../__tests__/sidekick-preview.service.test.js     | 22 ++++++++++++++++++++++
 .../modules/sidekick/sidekick-preview.service.js   |  5 ++++-
 2 files changed, 26 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
