CS ticket 2026-08-12, items 1 and 2.

> **Stacked on `feat/minify-sunset`.** This MR targets that branch, so the diff shown here is only
> the grants + Page Loader work. Merge !minify first; GitLab will retarget this to `master`.

## Item 1 — Page Loader is missing from Basic

`ACTION_LOADING` is not in `ENTERPRISE_ACTION_LIST`, so every plan is entitled to Page Loader, but
the Basic preset never listed it. A free-plan merchant on Basic got Standard's feature set minus the
one feature they were actually entitled to.

`'loading'` is inserted **before** `'asset'`, not appended. `handleEndProgress` treats the last entry
of `actionList` as the end-of-run marker and the settings branch runs before the asset branch, so a
preset ending in `loading` / `preload` / `pageSpeed` would mark the run finished while `asset` and
`duplicate` are still in flight. The invariant is covered by `speedUpPresets.test.js` (added in
!minify).

No migration: presets are re-applied from these constants on every mode pick and every auto-optimize
run.

## Item 2 — CS needs to open a blocked feature for one shop

A merchant was told to use the XML sitemap on a free plan. Today the only way to do that is to flip
`noLimit` on the shop doc, which opens **every** pro feature at once — which is exactly what was
found on `reevolutionsg.myshopify.com`, with nobody able to say why it was set.

This adds a narrow alternative.

**`grantedFeatures[]` on the shop doc** (`config/subscription/grantedFeatures.js`)
- `GRANTABLE_FEATURES` is a fixed allow-list in code — currently `{xmlSitemap}`. The allow-list, not
  the stored array, is the authority: `hasGrantedFeature()` returns false for any key not in it, so a
  stale or hand-edited shop doc cannot widen access, and `sanitizeGrantedFeatures()` drops unknown
  keys and duplicates on write.
- Write path guarded in `shopRepository.updateShopData`, alongside the existing `noLimit` guard, and
  logged with `logger.warn`.

**Gate** (`helpers/sitemapHelper.js`)
```js
export function canUseXmlSitemap(shop) {
  if (shop?.plan !== FREE) return true;
  if (shop?.noLimit) return true;
  return hasGrantedFeature(shop, 'xmlSitemap');
}
```
Both backend entry points use it: `sitemapController.js:83` and `sitemapService.js:65`. The second
one is easy to miss — a grant that only patched the controller would open the page but leave the
cron generation blocked.

**Frontend** — `SitemapGenerator.js` exposes `isXmlLimited` on the context and all seven pro-gates in
the XML subtree (`XMLSitemap.js`, `XMLSitemap/Settings.js`) read it instead of `isLimitNew`, so a
grant lifts the upgrade modal and the Pro badges too, not just the toggle. `grep isLimitNew
XMLSitemap/` returns 0.

**DevZone** — a `GrantedFeaturesContainer` card renders one checkbox per `GRANTABLE_FEATURES` entry
and saves `{grantedFeatures: [...]}` for **the shop in the current session only**. There is no
domain/ID input by design, so CS cannot touch another merchant from this screen. Strings are
hardcoded English, matching DevZone convention — there is no DevZone i18n namespace (0 `.json` files
in the whole `pages/DevZone/` tree).

## Security note — read before approving

The write guard requires `postData.isDevZone`, which is a **client-supplied body flag with no
server-side verification**. `POST /shop {"isDevZone": true, ...}` from any valid merchant session
therefore reaches the guard.

This is not new: the existing `noLimit` guard right above it works the same way, so today
`POST /shop {"isDevZone":true,"noLimit":true}` already self-grants every pro feature. Tony reviewed
this and accepted keeping `grantedFeatures` consistent with `noLimit` rather than diverging here,
because tightening `isDevZone` would break the team's DevZone flow across the app. The underlying
`noLimit` hole is filed as a separate ticket — it is deliberately **not** patched in this MR.

Worth weighing while reviewing: `grantedFeatures` is strictly narrower than the hole it sits next to
(one allow-listed feature vs. everything), so it does not widen the existing exposure.

## Verification

```
$ DISABLE_V8_COMPILE_CACHE=1 npx jest speedUpPresets sitemapGate grantedFeatures minifyRetired
Test Suites: 4 passed, 4 total
Tests:       50 passed, 50 total
```

Diff vs `feat/minify-sunset`: 18 files, +425 / −23. No secrets, no `.env*` / lockfile / CI / firebase
config touched, no new dependency. Firestore writes stay shop-scoped — the DevZone container has no
shop input and `updateShopData` is keyed by the session's own `shopID`.

Design doc: `docs/superpowers/specs/2026-08-12-cs-speedup-grants-minify-design.md`.

## After merge

`reevolutionsg.myshopify.com` still needs the grant applied on production (`avada-seo`). Granting
alone is not enough for auto-update: `sitemapService.js:64` also requires
`settings.xml.isDevZoneEnabled`, which `seoRepository.js:159` uses to select shops for the sitemap
cron. CS enables that through the existing SitemapContainer.
