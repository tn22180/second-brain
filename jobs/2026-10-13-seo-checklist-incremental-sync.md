# SEO checklist (FAL-837) — item Rescan runs an incremental search-index sync

Base: `fix/FAL-837-esther-review` @ 080dee19d4 (MR !2396 → `FAL-837`). Branch:
`fix/FAL-837-incremental-sync`, fast-forwarded into `fix/FAL-837-esther-review` after review.

## Why

!2396 made Rescan on the 6 storeIndex items (metaTitle, metaTitleLength, metaDescription,
metaDescriptionLength, noindexTag, emptyImageAlt) call `startSearchIndexSync`, so a merchant who
fixed something sees it. That sync is a FULL export: 4 Shopify bulk queries in sequence
(`PAGE_TYPES = product, collection, blog, page`; the product query pulls media + metafields(first:100)),
JSONL parse, chunked ES writes, `purgeStaleElasticsearch` deleteByQuery, Firestore progress + Pub/Sub
per chunk. A 50k-product shop pays all of it to re-check one item after editing a few products, and the
one-bulk-query-per-shop slot is held the whole time. Tuan (2026-10-13): too expensive for big shops.

## Decisions (Tuan, 2026-10-13) — binding

1. **Item Rescan (the 6 storeIndex items) → incremental sync.** Export only resources changed since the
   last successful sync: add a Shopify search filter `updated_at:>'<ISO>'` to each of the 4 bulk export
   queries (products / collections / articles / pages all accept `query:`). Upsert those docs into ES with
   the same per-doc checklist judging as the full sync (storeScan / CHECKLIST_INDEX_VERSION stamping).
   **Skip `purgeStaleElasticsearch`** in incremental mode (the export is partial, purging would delete
   everything not in it). When the sync ends, the checklist re-scores exactly as after a full sync (and on
   V25 shops the missing-alt scan still starts).
   - The cutoff is the start time of the last successful sync (full or incremental), stored on the
     jobDataMigrate doc. Use the run's START time, not end time, so edits made during a run are not lost.
     Subtract a small safety margin (e.g. 5 minutes) for clock skew.
2. **Fall back to a full sync** when there is no successful sync yet, the last success is at an older
   `CHECKLIST_INDEX_VERSION`, the last run failed or has failed chunks, or there is no stored cutoff.
   Incremental must never be the first sync.
3. **Main checklist Re-scan and the banner "Re-scan now" stay FULL** (they are where deletions get purged
   and the whole index is rebuilt). Only the per-item Rescan uses incremental mode. Find where each calls
   `startSearchIndexSync` and pass a mode/option; the default stays full.
4. **Cooldown 5 minutes for item Rescan** on storeIndex items, counted from the last sync's start: return
   the existing `issue_rescan_cooldown` + `retryAfterMs` (429) shape the FE already toasts. A sync already
   running is still `{started:false}` / treated as "this rescan" as today.
5. Accepted gaps (write them in docs/features/seo-audit.md): a resource deleted since the last full sync
   stays in the index until the next full sync; an SEO metafield written by another app via
   `metafieldsSet` may not bump the resource's `updated_at`, so incremental can miss it until a full sync.

## Constraints

- One Shopify bulk query per app+shop: incremental runs chain types exactly like the full run.
- Bulk query routing markers (`#bulkElasticsearchExport…`) in handlers/webhook/bulkOperationHook.js must
  stay intact; the filter goes inside the query, not in the marker.
- Progress/dock (`upsertJob`, `JOB_TYPE.SEARCH_INDEX_SYNC`) and the FE "syncing" state behave the same for
  both modes. Counters (chunk totals, completedTypes) must not make an incremental run look done early or
  make the checklist think the index is empty.
- The checklist counts read ES aggregates over the whole index, so upserted docs must replace the old
  doc for the same id (same `${shopId}_${restId}` id scheme).
- `hasChecklistSync` / `needsSync` semantics: a successful incremental run counts as a success at the
  current version only if the previous full baseline was at the current version (it always is, by
  decision 2).
