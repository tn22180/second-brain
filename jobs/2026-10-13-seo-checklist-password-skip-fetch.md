# SEO checklist (FAL-837) — password-protected store: do not fetch storefront pages to scan

Base: `FAL-837` @ e3bce3a4c6 (after !2403). Branch: `fix/FAL-837-password-skip-fetch` → MR into `FAL-837`.

## Why (Tuan, 2026-10-13)

When the storefront has a password, every item in `passwordRequiredIssues`
(`const/seoIssues.js:904`) is shown as "has password" anyway (`Audit.convertDataIssue`,
`services/audit/audit.js:189`). But `Runner.audit` / `Runner.auditIssues` still resolve every
required artifact first: Puppeteer crawl (`crawlPagePuppeteer`), storefront HTML fetches
(`htmlPageContent`, `crawlReviewSnippet`, …), PageSpeed/Lighthouse (`resultLightHouse`,
`lighthouseScore`). They only see the password page, cost Puppeteer/PSI time and money, and slow the
scan. `hasPassword` is already known before the artifacts run (`runner.js:202`,
`Audit.checkPasswordEnabled`).

## Decisions — binding

1. **Skip storefront-fetching artifacts when `hasPassword` is true**, in `Runner.audit`,
   `Runner.auditIssues` and any other path that resolves artifacts (subset rescans, the
   `storeIndexSynced` rescore). Read every artifact in `services/audit/artifacts/` and classify:
   *storefront fetch* = HTTP to the shop's storefront domain, Puppeteer, or PageSpeed/Lighthouse.
   Admin-API / theme-API / Firestore / ES artifacts (`settings`, `storeResources`,
   `altInventoryReport`, `themeLayout`, `themeAsset`, `shopLocales`, `brokenLinkReport`, …) still
   run — verify each, don't assume. `redirectTracer` (password detection itself) must still run.
2. **Every item still gets a result.** Items in `passwordRequiredIssues` must still be written with
   the "has password" severity exactly as today (feed them an empty/skipped artifact or a stub
   result — whatever keeps `runAudits` from waiting forever on an artifact that never resolves).
   Items NOT in that list that use a skipped artifact as a secondary source (`lazyLoad`, `preload`
   use `crawlPagePuppeteer` besides `settings`) must get the same verdict they get today from a
   crawl of the password page: pass from settings when enabled, otherwise `notChecked` — check their
   `audit()` with `crawlPagePuppeteer` null/absent and test it.
3. **PageSpeed on a fresh scan:** the main Re-scan path (`generateSeoChecklists({fresh:true})`,
   `helpers/seoSpeed.js:786`) and any PSI call made for the checklist must not run PSI against a
   password-protected storefront. Find where PSI is triggered for the checklist and skip it when the
   store has a password (reuse the same detection; don't add a second network check if the result
   is available). Do not change the Speed up page's own PSI flow.
4. Log one `logger.warn('[runner:audit] password store, storefront artifacts skipped', shopId,
   [names])` per scan so ops can see it. No behaviour change for stores without a password.
5. Out of scope: password detection logic itself, FE, deploy.

## Tests (TDD, jest 24)

- Runner with `hasPassword: true`: storefront artifacts' handlers are never called; every
  `passwordRequiredIssues` item still ends with `severity: 'hasPassword'`; `lazyLoad`/`preload`
  verdicts equal today's for settings on/off; non-storefront artifacts still run.
- `hasPassword: false`: unchanged (all artifacts run).
- `auditIssues` subset on a password store skips the crawl.
- Fresh scan on a password store does not call PSI.

## Docs

`docs/features/seo-audit.md`: password-protected stores skip storefront fetches.
