fingerprint: krgiq8
service: sidekickgen2
message: HTTP 500 GET /sidekick/seo/preview-meta
app: SEO
repo: seo
date: 2026-08-22T03:42:26.617Z
status: fix_disabled
attempt: 1

# SEO · sidekickgen2 · krgiq8

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop OpKzFaQov7LO29opP9oU's stored offline Shopify token predates the `read_markets` scope, so every `shopLocales { marketWebPresences { subfolderSuffix } }` query this app issues is rejected by Shopify Admin GraphQL, and the sidekick preview endpoints turn that rejection into a 500.

**Mechanism.** SidekickController.getPageMeta/previewMetaFix → SidekickPreviewService.readCurrentMeta → Promise.all element `getPrimaryLocale(shop, true)` (packages/functions/src/modules/sidekick/sidekick-preview.service.js:31). getPrimaryLocale returns early only when `shop.primaryShopLocale` is set (helpers/analysis.js:421); it is falsy for this shop, so it calls shopLocalesGraphQL (helpers/analysis.js:424), whose document selects `marketWebPresences` (helpers/graphql/shopLocalesGraphQL.js:19). Shopify answers `Access denied for marketWebPresences field. Required access: read_markets…`; shopify-api-node throws RequestError (got), and unlike the two siblings in the same Promise.all (getTitleBodyHtmlById `.catch(() => ({}))` at :32 and metafield.list `.catch` at :35) this call has no catch, so the whole Promise.all rejects, the controller catch fires and does `ctx.throw(500, e.message)` (sidekick.controller.js:20 and :36). `read_markets`/`write_markets` ARE declared in config/shopify.js:22-23, but that scope line and the `marketWebPresences` selection were both added in the same merge 58f79864e3 (2026-08-04), so any shop whose offline token was granted before that date has a token without the scope and fails on every call — no re-auth is triggered.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:19` — the `marketWebPresences` selection Shopify rejects without read_markets
- `packages/functions/src/helpers/analysis.js:424` — getPrimaryLocale calls shopLocalesGraphQL when shop.primaryShopLocale is unset — no error handling
- `packages/functions/src/modules/sidekick/sidekick-preview.service.js:31` — getPrimaryLocale is the only Promise.all member with no .catch, so its rejection kills readCurrentMeta
- `packages/functions/src/modules/sidekick/sidekick.controller.js:20` — getPageMeta catch converts the Shopify scope error into HTTP 500
- `packages/functions/src/modules/sidekick/sidekick.controller.js:36` — previewMetaFix catch converts the same error into the alerted HTTP 500
- `packages/functions/src/config/shopify.js:22` — read_markets is declared in app scopes, proving the app requests it — the shop's stored token predates it

## Evidence
- 13 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-19T16:28:28.702Z" AND timestamp<="2026-08-19T16:58:28.702Z" AND "Access denied for marketWebPresences field"`
- 4 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-19T16:28:28.702Z" AND timestamp<="2026-08-19T16:58:28.702Z" AND httpRequest.status>=500`
- 13 matching entries: `(resource.labels.service_name="sidekickgen2") AND timestamp>="2026-08-19T16:28:28.702Z" AND timestamp<="2026-08-19T16:58:28.702Z" AND logName:"stderr" AND "OpKzFaQov7LO29opP9oU"`

## Job
- analyze rounds: 1
- cost: $1.98

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
