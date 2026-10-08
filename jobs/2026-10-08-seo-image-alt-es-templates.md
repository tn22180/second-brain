# seo FAL-837: Image alt from the search index + per-template storefront alt check

Asked by Tuan on 2026-10-08, in the round-3 review of !2270. Ships on !2383 (`fix/FAL-837-review-round3`).

## Why

The "Image alt" checklist item (`services/audit/issues/emptyImageAlt.js`) does not read the
search index. `artifacts/imageAltReport.js` starts a second Shopify bulk operation
(`startMissingAltScan`, `bulkOperationService.js:437`) and the result reaches the checklist
through the bulk webhook (`applyImageAltResult.js`, `runner.js:72`). Three problems:

1. Shopify allows one bulk operation per shop. A scan during a store-data sync fails to start the
   count (`logger.warn` and nothing more), so the count goes stale. A count that is running
   blocks the sync.
2. Every other whole-store item reads ES from the same sync. Image alt is a different source
   with a different age, and the pages modal cannot list the resources missing alt.
3. Shops with `useOptImageV25` count every image in Files, not the images on resources.

The store's rendered HTML is never checked for alt. Theme sections (hero banners, image-with-text
blocks, etc.) carry their own images, and Shopify renders each resource through its template
(`product.json`, `product.alt-x.json`, …). Tuan wants the homepage and **every template that is
actually assigned** checked.

## Decisions

- **Resource images: ES.**
  - The bulk export adds the image alt data.
  - `transformDocument` stores `imageCount` and `missingAltCount` per doc and adds `emptyImageAlt`
    to `checklistIssues` when `missingAltCount > 0`, so `listStoreIssuePages` and the modal work
    unchanged.
  - The item counts images via an ES `sum` aggregation.
  - Products: all media images. Collections: `image`. Articles: `image`. Pages have no image.
- **No separate bulk op for the checklist.** Remove the checklist's `startMissingAltScan`
  trigger and its webhook→checklist wiring. Keep `optimizeReport` counts and anything the
  Image optimizer page itself uses.
- **`CHECKLIST_INDEX_VERSION` 3 → 4.** It does not exist on master; FAL-837 introduces it. Every
  merchant syncs once at release anyway, so the bump costs prod nothing. It also stops an old
  index without the new fields from reading as "0 missing" (a false pass).
- **Alt rule:**
  - Missing `alt` attribute = fail.
  - `alt=""` = decorative, a pass (WCAG H67).
  - For Shopify media, `alt` null or empty = missing: Shopify has no "decorative" flag on media,
    and the theme renders an empty alt as the product title or as `alt=""`.
- **Templates: from ES.**
  - Export `templateSuffix` for products, collections, pages and articles.
  - Group published docs by `resourceType` × `templateSuffix` (null → default).
  - Take one sample URL per group.
  - Unassigned theme templates are unreachable, so they are skipped.
  - Cap: home + 15 template pages. Order: default template per type first, then alternates by
    doc count.
- **Fetch:** plain HTTP fetch (the `htmlPageContent` `fetchAllWithFetch` path), not Puppeteer.
  - Concurrency 4, 10 s timeout per page.
  - Parse `<img>` with cheerio.
  - A password-protected store → the template part is notChecked.
- **One item, two parts.** `emptyImageAlt` fails if resource images miss alt **or** any sampled
  template page has an `<img>` without `alt`.
  - Summary: the existing resource count sentence.
  - Expanded: one row per template page (page type, template name, link, missing / total).
  - New strings go in all 14 locales.

## Nodes

- `es-image-alt`: export + transform + count + remove the separate bulk op + version bump.
- `template-html-alt` (after `es-image-alt`): `templateSuffix` export, sample picker, fetch and
  parse, merged into the item, FE rows.

## Progress

- [ ] graph run
- [ ] review diff
- [ ] local verify (sync + scan on linhnguyen11)
- [ ] push to !2383 + MR description
