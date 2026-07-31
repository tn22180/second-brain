fingerprint: 12qs3xc
service: proxy
message: [getPostsByTag] <http://kzzi-2.myshopify.com|kzzi-2.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-07-31T06:48:08.224Z
status: mr_open
attempt: 1

# BLOG · proxy · 12qs3xc

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/799

**Root cause.** Four shops that uninstalled the app still have their shop doc and stale accessToken in Firestore, so every crawler hit on /proxy/tags and /proxy/posts-by-tag calls Shopify Admin GraphQL with a revoked token, got throws HTTPError 401, and the controllers' catch blocks turn that into a 500 that pages.

**Mechanism.** kzzi-2.myshopify.com sent 'Handling uninstalling for  kzzi-2.myshopify.com' to the auth service at 2026-07-01T08:13:40Z. uninstallApp (packages/functions/src/services/uninstallationService.js:16) tracks the uninstall and touches bfcmBundle but never clears shop.accessToken and never writes an uninstalled flag — nothing in packages/functions/src writes uninstalledAt. The storefront theme still contains the app block, so bingbot/Googlebot keep loading https://kzzistore.com/ and firing /proxy/tags + /proxy/posts-by-tag. getShopByField finds the surviving doc, so the `if (!shop) return []` guard (tag.controller.js:75, :104) is bypassed, initShopify (tag.controller.js:76, :107 → shopifyService.js:23) builds a Shopify client from the dead token, tag.service.js:176 / :246 issue shopify.graphql, Shopify answers 401, shopify-api-node's got rejects with HTTPError ERR_NON_2XX_3XX_RESPONSE, and the catch at tag.controller.js:86 / :122 logs at severity ERROR and sets ctx.status = 500 (tag.controller.js:88, :131). The 401 is never cached, so every crawler hit repeats the round trip and the alert.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:76` — listStorefront builds a Shopify client from the surviving shop doc — the only guard is `if (!shop) return []`, nothing checks whether the token is still valid
- `packages/functions/src/controllers/tag.controller.js:86` — catch logs the 401 as [listStorefront] ... Error listing storefront tags at severity ERROR — exact string in the alert
- `packages/functions/src/controllers/tag.controller.js:88` — ctx.status = 500 for a revoked-token 401; this is what makes the httpRequest.status 500 that fired the page
- `packages/functions/src/controllers/tag.controller.js:107` — getPostsByTag has the identical initShopify path — second symptom of the same cause
- `packages/functions/src/controllers/tag.controller.js:122` — catch logs [getPostsByTag] ... Error listing posts by tag, the literal message in the alert
- `packages/functions/src/services/shopifyService.js:23` — initShopify reads accessToken via prepareShopData with no validity check; a revoked token yields a client that 401s on first call
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) — the call whose got rejection is the HTTPError in the stack
- `packages/functions/src/services/uninstallationService.js:27` — uninstallApp returns early on missing accessToken but never clears it or marks the shop uninstalled, so the dead token survives indefinitely

## Evidence
- 82 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T06:00:00Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 94 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T06:00:00Z" AND httpRequest.status>=500`
- 2 matching entries: `timestamp>="2026-07-01T00:00:00Z" AND resource.labels.service_name="auth" AND textPayload:"Handling uninstalling for"`
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T05:46:22.595Z" AND timestamp<="2026-07-31T06:16:22.595Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.78
- branch: `fix/prod-blog-12qs3xc`
- fix commit: `1d02a08754a4770e6980e7986422ce008bd1d290`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/799
- tests: 215 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../tag.controller.storefrontErrors.test.js        | 45 +++++++++++++++++++++-
 .../functions/src/controllers/tag.controller.js    | 30 +++++++++++++++
 .../src/services/uninstallationService.js          |  2 +
 3 files changed, 76 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
