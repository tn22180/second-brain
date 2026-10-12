# SEO — checklist image alt and the alt optimizer cover the same images (FAL-837)

Base: `FAL-837` @ 8b95ceae99. Branch: `fix/FAL-837-alt-sync`. MR target: `FAL-837`.

## Why

The checklist item "Images in Shopify admin (products, collections, blog posts)" and the Image alt
text optimizer it links to count and fix different sets of images:

- Checklist: per-image count from the search index (ES `shopify_products|collections|articles`,
  published only): product media + collection cover + article cover. Dev store: 5 = 4 product
  media + 1 article cover.
- Optimizer (useOptImageV25): Shopify **Files library** (`files(query:"content_type:IMAGE")`), count
  in `optimizeReport/{shopId}.missingAltCount`. Dev store live: 17 missing = the 4 product media
  + 13 other uploads. Product media ARE Files (MediaImage); the comment in
  `bulkOperationHook.js` saying product/collection images live outside the Files library is wrong
  for products.
- Collection and article covers are NOT Files (`CollectionImage`/`ArticleImage`), so the optimizer
  never fixes them, while the checklist counts them.

Tuan's decision (2026-10-12): make the two the same. The checklist lists exactly what Fix fixes,
with the same number, and Fix fixes collection/article covers too, following the alt setting
(AI → AI + credits, custom → template).

## Decisions (binding)

1. **One set**: Files library images (V25) + collection covers + article covers. Product media
   are counted once, via Files. Legacy (non-V25) shops keep today's behaviour untouched.
2. **One source**: the missing-alt scan (`startMissingAltScan` → `hookSyncTotalFileImages`) owns
   the numbers and the list. It writes to `optimizeReport/{shopId}`:
   `missingAltCount` (Files), `altScanTotalImages` (Files), plus new `coverMissingAltCount`,
   `coverTotalImages`, and an inventory of missing-alt items (Files: MediaImage gid + url;
   covers: owner gid + owner type + title + image url). The inventory goes to GCS (one JSON per
   shop, overwritten each scan), not Firestore, because a store can have thousands.
3. **Checklist reads that source**, not ES, for the admin-images part of `emptyImageAlt`
   (`services/audit/issues/emptyImageAlt.js`). Template (storefront) counts stay as they are.
   Rows: `files` (Files library: products + other uploads), `collection`, `blog`.
4. **Freshness**: the checklist store sync (search index sync) starts the missing-alt scan
   **after** its own bulk exports finish (Shopify runs one bulk query per app+shop at a time),
   and when the scan hook finishes the `emptyImageAlt` item is recomputed so the card updates
   without a manual rescan.
5. **Fix covers in the alt run** (V25, optimizingType alt): collection and article covers are
   processed in the same run, honouring `alt_ovr` like Files (missing → empty alt only), same
   generator as Files (AI or custom template per `alt_mode`), same credit gate/charge
   (1 credit per AI alt written), counted into the run's progress/history. Write back with
   `collectionUpdate` / `articleUpdate` (`image.altText`). No new Pub/Sub topic or Cloud Function:
   run them inside the existing optimize job.
6. **Popup = checklist**: the Image alt confirm popup and the checklist show the same total
   (Files missing + covers missing); credits estimate = that total in AI mode.
7. The per-type Fix stays removed (`storeWideFix`); the card Fix is the one entry point.

## Out of scope

- Unpublished resources: Files has no published flag; Files images are all counted.
- Revert backup (`saveAltVersion`) for covers — note it in the MR if not done.
