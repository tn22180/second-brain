# AEO security re-audit — 2026-09-30

Repo: `llm-ai-search-seo`. Refs: prod = tag `v1.6.38` == `origin/main` @ `3d032ef` (same commit;
no drift on any G1-G9 file between the old baseline `7cab2d5` and current `origin/main` —
verified `git log 7cab2d5..origin/main -- <all G-group files>` = empty). MR `!114`
= `origin/fix/FAL-580-api-security-hardening` @ `4ec9c3b` (merge-base with main `02d645d`).
Ours = `fix/security-high-2026-09` @ `7cb93b8`, not pushed, based on `origin/main`@`7cab2d5`
(no rebase needed, main didn't move on relevant files).

Read-only: all via `git diff/show/log` against `origin/main` and `origin/fix/FAL-580-api-security-hardening`.

## Status matrix — G1..G9

| Group | v1.6.38 / main | !114 | ours | note |
|---|---|---|---|---|
| G1 integration key unbound | OPEN | **PARTIAL** | OPEN (ticketed, not shipped) | see below |
| G2 `GET /proxy/shop` leaks passwordStore/crispSessionToken | OPEN | OPEN (untouched) | **FIXED** `89b2fab` | |
| G3 webhook HMAC disabled | OPEN | **FIXED** | **FIXED** `6221653` | same file, different code, same fix |
| G4 changelog.js mirrors full shop doc to BigQuery | OPEN | OPEN (not in their audit either) | OPEN (ticketed, needs BQ migration) | |
| G5 full shop (incl. accessTokenHash) on `syncLinks` Pub/Sub | OPEN | OPEN (not in their audit) | **FIXED** `6bb069d` | |
| G6 competitors unscoped | OPEN | **"FIXED" but breaks the feature** | BLOCKED (0 commits, needs Tuan's call) | see below — flag this |
| G7 `shopifyDomain`/`isDevZone` writable via `/api/shop` | OPEN | OPEN (`pickFields.js`/`shopRepository.js` untouched, not in their 17-item list) | **FIXED** `94ce2fa` | |
| G8 storage rules open read+write | OPEN | OPEN (untouched) | **FIXED** `1926339` | both would need `firebase.json` wiring — see caveat |
| G9 committed creds | OPEN (4 files) | **PARTIAL**: `appIntegationKeys.js` deleted (fixed + worse variant closed); `.npmrc`/`.yarnrc.yml` explicitly reverted, still committed; `crisp.js` untouched | OPEN (waiting on Tuan's manual rotate) | see below |

## Review-found items (not G-numbered, from `04-aeo.md` Progress, added 2026-09-23)

| Item | v1.6.38 | !114 | ours |
|---|---|---|---|
| isDevZone / dotted-path strip bypass | OPEN | OPEN (moot — blockFields untouched) | **FIXED** `94ce2fa` |
| staffOnlyFields (merchant self-enables CS toggles via `/api/shop`) | OPEN | **OPEN** — !114 only allowlists the *bot* path (`/proxy/shop/update`), not `/api/shop` | **FIXED** `1525441` |
| markdown `isEnableMdMultiLang` bypass via `/markdown/settings` | OPEN | OPEN (`markdownController.js` untouched) | **FIXED** `c9c8d47` |
| shopInfos raw update via `PUT /api/shop` `domain` branch | OPEN | OPEN (`shopInfoRepository.js` untouched) | **FIXED** `7cb93b8` |
| competitors writes ungated | OPEN | same as G6 | BLOCKED, same as G6 |

**Counts:** real findings tracked = 9 groups + 5 review items = 14 items.
Ours: 9 fixed, 4 open/ticketed (G1, G4, G6-blocked, G9-waiting-rotate).
!114: 2 fixed clean (G3, part of G9), 1 fixed-but-breaks-feature (G6), 1 partial (G1), 9 open/untouched, plus a security posture regression on G9's npm token (change written then explicitly reverted).

## G1 in detail — does !114 bind the key to a shop?

**No, not for the routes that matter.** !114 touches three places:

- `middleware/swaggerAuth.js` `exchangeToken` (`/proxy/swagger-token`): now requires
  `integration.shopifyDomain` to exist and match `?shop=`, else 403. Real fix — but their own
  `docs/security/FAL-580-api-audit.md` states plainly: *"swagger token exchange is currently
  dead — no key has a shopifyDomain yet."* `createIntegrationKey` accepts the field now, but
  nothing has migrated existing `integrationKeys` docs. So this hop is closed only in the sense
  that it 403s everyone, including legitimate callers, until someone manually issues a bound key.
- `middleware/validateAccessToken.js` (gates **every** `/proxy/*` route — `updateShopProxy`,
  `getShopProxy`, `linksController`'s proxy handlers, etc.): **unchanged in binding.** Still
  `getIntegrationKey(accessToken)` existence-only, `ctx.state.integration` attached regardless of
  which shop the `X-SEO-Shop-Domain` header names. Added: anchored `veryShopifyDomain()` match
  (was `.includes('myshopify.com')`, fixed a real SSRF-adjacent bypass) and a 10-req/60s
  per-domain rate limiter. Neither binds the key to a shop.
- `controllers/shopController.js` `updateShopProxy`: added `PROXY_UPDATABLE_SHOP_FIELDS`
  allowlist (~13 CS-toggle fields, near-identical to our `staffOnlyFields`). This doesn't fix
  binding — any shop is still reachable via the shared key + arbitrary header — but it caps the
  blast radius: the bot proxy can no longer write `passwordStore`/`accessToken`/`plan`/anything,
  only the same toggle set we independently arrived at in Task 8.

Net: **G1's core defect (shared token, no shop binding, on the bot-facing `/proxy/*` surface) is
still open on `!114`.** What's closed is the embedded-API-session escalation hop
(`swagger-token` → full JWT) — and that hop is closed by making it non-functional, not by
migrating data.

## G6 — the standout risk: !114's fix likely breaks the feature it "fixes"

`competitorsController.js`/`competitorsRepository.js` on `!114`: `addCompetitor` now stamps
`shopId: shopID` (from `getCurrentShop(ctx)`), `getCompetitors` queries
`.where('shopId','==',shopID)`, `removeCompetitor` checks `doc.data().shopId !== shopID`.

Our Task 4 investigation (blocked, not shipped) found `competitors` is **not per-shop data** — it
is a **global blocklist**: staff add email domains from DevZone
(`packages/assets/src/pages/DevZone/DevZone.js:90-97`), and **every** shop's `MainLayout.js`
(`useFetchApi({url: '/competitors'})`, no shop param) checks its own email against the *whole*
list to decide whether to render `BlockCompetitors` instead of the app
(`packages/assets/src/layouts/MainLayout.js:30-47`). Existing rows carry no `shopId` at all
(confirmed empty on `origin/main`).

Scoping `GET /competitors` to the caller's own shop means every shop's `MainLayout` check now
sees **only rows it personally added** — i.e. an empty list for every merchant, since none of
them ever wrote a competitor row. Effect: the block-competitors gate goes **silently off
fleet-wide**, and `!114` itself only partly reasons about this — their own audit doc admits
*"Competitor rows written before this branch have no shopId, so the scoped query hides them and
removeCompetitor now rejects them as not-found. Merchants see an empty list... Backfill or delete
those rows"* — but frames it as a data-migration inconvenience, not as defeating the feature's
purpose for every shop until backfilled. **This is a functional regression risk, not fixed
security debt — if `!114` merges as-is, the blocklist stops working the moment it deploys**, with
no error, no alert.

Our recommended fix (from Task 4, not yet approved/shipped) is different: leave `competitors` as
the global list it is (keep `list` open), gate `add`/`remove` with `canAccessDevZone({user})`
(same gate as `devController.js:61`) so only staff can write. `!114`'s approach conflicts with
that call and should not both land.

## G9 — committed creds, side by side

- `.npmrc` / `.yarnrc.yml` (registry.avada.io token): **`!114` wrote the fix, then explicitly
  reverted it** (`900db23`) — nobody on their side currently has permission to add `NPM_TOKEN` as
  a CI variable, and shipping the `${NPM_TOKEN}` substitution without it would have broken Yarn 4
  install outright. Their audit doc flags this token authenticates as the `avada` org account
  (not scoped) and asks explicitly whether it carries **publish rights** — if so, this is a
  supply-chain risk (`@avada/core` used fleet-wide), worse than "just a leaked read token." Still
  committed on `!114` HEAD, same as `origin/main`.
- `packages/functions/src/const/appIntegationKeys.js`: **deleted** on `!114`. Turned out worse
  than our G9 framing — `AVADA_SEO_PRO_ACCESS_TOKEN` wasn't just committed, it was **imported into
  the browser bundle** (`SeoLegacyPlanModal.jsx`) and readable by every merchant. `!114` moves the
  SEO-Pro-installed check server-side (`appIntegrationController.js`, new) using
  `process.env.AVADA_SEO_PRO_ACCESS_TOKEN` + the session's own shop — real fix, and it needs a
  freshly-issued token since the old one is burned (their handover doc: "giá trị cũ đã cháy").
  Fails open on missing env var (`isInstalled: false` for everyone), not a security issue.
- `crisp.js`: untouched on both `!114` and ours.

## Overlapping files — !114 vs ours

| File | !114 | Ours | Conflict? |
|---|---|---|---|
| `middleware/webhook/webhookMiddleware.js` | Restores HMAC check, `timingSafeEqual`, fail-closed (401/500) | Same fix, same primitive, different code shape (helper fn `isValidShopifyHmac`, base64-decode compare vs their utf8-string compare) | **Textual merge conflict, same lines** — functionally equivalent, pick either, don't stack both |
| `controllers/shopController.js` | Adds `PROXY_UPDATABLE_SHOP_FIELDS` allowlist right after `setShop`; changes `updateShopProxy` body | Adds `stripStaffOnlyFields`, `withoutHiddenFields`; changes `getShop`, `updateShop`, `setShop`, `getShopProxy` | **Adjacent hunks** (both touch the lines right around `setShop`) — no logical conflict (different functions: `updateShopProxy` vs `getShopProxy`/`updateShop`), but will need manual reconciliation on merge |
| `controllers/competitorsController.js` + `repositories/competitorsRepository.js` | Adds per-shop scoping (see G6 risk above) | Untouched (blocked) | N/A — nothing to conflict, but their approach should be reviewed/rejected before merge per G6 finding |
| `const/appIntegationKeys.js` | Deleted | Untouched | N/A, no conflict — take theirs |

## Files unique to !114 (not in our G1-G9 scope at all)

New vulns their audit found and fixed that we never scoped: SSRF in `veryShopifyDomain` (fetched
attacker-controlled host), no App Proxy signature check on `/proxy/ai/*` (4 of 6 routes now
gated, 2 deliberately left open — beacon endpoint, `checkInstalled`), draft-product read via
numeric id (partially fixed), GraphQL injection via `?fragment=` and `stagedUploadsCreate`
`?fileName=`/`?size=`, Shopify Admin token printed to Cloud Logging on every init, uncapped
sequential Admin-API loop in `checklist/bulk-edit`, CORS reflecting any Origin + dead `/proxy/abc`
debug route, and `aiReferralDomains`/`classifyReferrer` cross-tenant domain list (same shape bug
as G6, but on referral tracking — they scoped `listCustomDomains`/`removeCustomDomain` by
`addedBy`, `classifyReferrer` still merges all shops' domains for classification, called out as
a known remainder in their own doc). None of this overlaps our diff.

## Files unique to ours (not touched by !114)

`firebase.storage.rules` (G8), `config/pickFields.js` (G7 blockFields + staffOnlyFields),
`controllers/linksController.js` + `handlers/pubsub/subscribeSyncLinks.js` (G5),
`controllers/markdownController.js` (multiLang bypass), `repositories/shopInfoRepository.js`
(shopInfos domain allow-list), `repositories/shopRepository.js` (G7 isDevZone/dotted bypass).

## Caller breakage risk

- **CS bot `POST /proxy/shop/update`** — not broken. `validateAccessToken` binding is unchanged
  (still shared-key + header), so the bot's calls still authenticate exactly as before. `!114`
  adds a field allowlist that covers the same CS-toggle set the bot actually writes (near-identical
  to our `staffOnlyFields`) — restricts blast radius, doesn't restrict the caller.
- **SEO app calling AEO's shared-key `/proxy/*` routes** (e.g. `GET /proxy/shop`) — not broken.
  `validateAccessToken` only gained an anchored domain-format check (real `.myshopify.com`
  domains still pass) and a 10-req/60s-per-domain rate limiter — could throttle a bursty
  legitimate caller, but doesn't change identity/auth outcome.
- **`GET /proxy/swagger-token`** — **broken for everyone** as merged: every existing
  `integrationKeys` doc lacks `shopifyDomain`, so `exchangeToken` now 403s unconditionally. Their
  own audit calls this "currently dead." Not the CS-bot/SEO-app mechanism, but if anything today
  relies on minting an embedded-API JWT via Swagger (dev testing, another integration), it's down
  until someone issues a bound key.
- **`GET /api/competitors`** (every shop's `MainLayout`) — **breaks fleet-wide** as covered in G6
  above: block-competitors gate goes silently off for every shop the moment `!114` deploys, until
  someone backfills `shopId` on existing rows (their own doc admits the data-loss shape but not
  that it defeats the feature for 100% of shops in the meantime).

## One line each

- G1: !114 closes the JWT-escalation hop but leaves the bot-facing `/proxy/*` surface unbound — still cross-tenant, just capped in what it can write.
- G2: open on !114, fixed on ours.
- G3: fixed both sides, same file, will merge-conflict, pick one.
- G4: open both sides, needs BigQuery migration regardless.
- G5: open on !114, fixed on ours.
- G6: !114 "fixes" this by breaking the feature for every shop until a manual backfill — do not merge as-is; ours is still just blocked pending a decision.
- G7: open on !114 (not even in their 17-item list), fixed on ours.
- G8: open on !114, fixed on ours (both need `firebase.json` wiring to actually deploy).
- G9: !114 kills the worst part (browser-bundle-leaked SEO Pro token) but explicitly reverted the npm-registry-token fix and left crisp.js; ours hasn't touched any of it, still waiting on manual rotate.
- Bonus: !114 also fixes SSRF, App-Proxy signature gaps, GraphQL injection, Admin-token log leakage, and an aiReferral cross-tenant leak — none of which were in our G1-G9 scope; worth pulling into the merged branch regardless of the G6 concern.
