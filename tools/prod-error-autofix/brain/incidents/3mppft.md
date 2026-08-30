fingerprint: 3mppft
service: api
message: [afterLoginService] <http://ptvmik-ix.myshopify.com|ptvmik-ix.myshopify.com> TypeError: Cannot read properties of null (reading 'id')
app: BLOG
repo: blogs
date: 2026-08-30T04:39:12.997Z
status: fix_disabled
attempt: 3

# BLOG · api · 3mppft

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** afterLoginService dereferences `shop.id` with no null guard (packages/functions/src/services/after-login.service.js:24) after a cached getShopByField lookup, so when the shop record for ptvmik-ix.myshopify.com was not retrievable during that store's install second, the TypeError aborted every post-login init step for the new install.

**Mechanism.** Shopify shop doc shops/aUwRH89pXDTiDgVOBDMd (ptvmik-ix.myshopify.com) has Firestore createTime 2026-08-30T04:33:12.510992Z and installedAt 2026-08-30T04:33:12.479Z — a first install. The embedded front-end was already loading and calling api 2.02s before that commit (embedapp 200 for shop=ptvmik-ix at 04:33:10.490908Z). @avada/core's verifyEmbedRequest then invoked afterLogin, and at 04:33:14.147761Z `const shop = await getShopByField(ctx.state.shopify.shop)` (after-login.service.js:23) resolved null — either a Firestore read that landed before the commit, or the `__NULL__` sentinel that shopCache.service.js:161-167 caches for 30s on a miss and never invalidates on shop creation (the idToFields set used by invalidate() is only populated for positive entries, shopCache.service.js:175). Line 24 then does `shop.id` unguarded → TypeError, caught only by the outer catch at line 47, so syncShopDataFromShopify, ensureShopTokenUser, checkOneStarShopLogin, autoApplyBrandColorsForNewInstall, setupTemplates and the knowledgeBase publish all never run for that install. The identical race on the sibling hook was already fixed: afterInstall reads through getShopByFieldWithRetry with {isCache: false} + 3 retries (installationService.js:18-25) and guards `if (!shop) return` (installationService.js:44); afterLoginService was never given the same treatment.

Confidence: `medium`

## Code
- `packages/functions/src/services/after-login.service.js:24` — `void syncShopDataFromShopify(shop.id)` — the unguarded deref that throws; maps to lib/services/after-login.service.js:31:50 in the prod stack
- `packages/functions/src/services/after-login.service.js:23` — cached, non-retrying getShopByField(domain) that returns null during the install window
- `packages/functions/src/repositories/shopRepository.js:100` — getShopByField defaults to isCache: true, so it can serve the negative sentinel
- `packages/functions/src/services/shopCache.service.js:161` — a miss is cached as __NULL__ for SHOP_BY_FIELD_NEGATIVE_TTL_SEC = 30s
- `packages/functions/src/services/shopCache.service.js:175` — only positive entries are registered in idToFields, so invalidate() on shop create never clears a negative field entry
- `packages/functions/src/services/installationService.js:18` — getShopByFieldWithRetry — the already-shipped hardening for the same race in afterInstall, not applied to afterLogin
- `packages/functions/src/services/installationService.js:44` — `if (!shop)` guard afterLogin is missing

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-30T04:18:32.417Z" AND timestamp<="2026-08-30T04:48:32.417Z" AND severity>=ERROR AND "afterLoginService" AND "ptvmik-ix.myshopify.com"`
- 1 matching entries: `resource.labels.service_name="embedapp" AND timestamp>="2026-08-30T04:33:00Z" AND timestamp<="2026-08-30T04:33:12Z" AND "ptvmik-ix"`
- 2 matching entries: `timestamp>="2026-08-23T00:00:00Z" AND timestamp<="2026-08-30T05:00:00Z" AND "[afterLoginService]" AND "Cannot read properties of null"`

## Job
- analyze rounds: 1
- cost: $2.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
