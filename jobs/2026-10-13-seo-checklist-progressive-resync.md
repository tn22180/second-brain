# SEO checklist (FAL-837) — re-sync of an already-synced shop updates the checklist as it goes

Base: `FAL-837` @ f07c450188 (after !2402). Branch: `fix/FAL-837-progressive-resync` → MR into `FAL-837`.

## Why (Tuan, 2026-10-13)

A full search-index sync of a big store takes minutes. Today, while any non-item sync runs
(main Re-scan, banner "Re-scan now", dock Continue, Sync now), the FE masks the 6 sync items
(`metaTitle`, `metaTitleLength`, `metaDescription`, `metaDescriptionLength`, `noindexTag`,
`emptyImageAlt` — `STORE_INDEX_TYPES` in `const/checklistRescan.js`) as scanning, blocks Fix, and
the merchant waits for the whole run. The sync writes ES chunk by chunk and the Fix lists read ES
live, so the data is usable long before the run ends. Merchants leave instead of waiting.

## Decisions — binding

1. **Scope: only shops that already had a successful sync at the current checklist version.**
   A shop's FIRST sync keeps today's behaviour exactly (Sync-now gate, blur, `inert`, masked items,
   "__"). Decide "already synced" from job-doc fields a new run does NOT reset (e.g.
   `checklistIndexVersion === CHECKLIST_INDEX_VERSION` and `lastSuccessfulSyncStartedAt`) — check
   what `startSearchIndexSync` / `startBulkExport` reset (`succeeded` is reset to false at start, so
   `hasChecklistSync` may not be usable mid-run; verify). Export one helper used by BE and FE.
2. **Backend: rescore per resource type during a re-sync.** When a type of a running re-sync is
   fully written to ES (all its chunks settled, and after that type's stale purge if the full sync
   purges per type — check `syncToElasticsearch` / `purgeStaleElasticsearch` /
   `settleElasticsearchChunk` / `triggerNextBulkOperation`), recompute the 4 meta items + score from
   ES with `services/audit/applyStoreResourcesResult.js`. It currently returns early while a sync
   runs (`needsChecklistSync`) — add an explicit option for this caller (e.g. `{duringSync: true}`)
   that skips only that guard; every other caller keeps the guard. Only for an already-synced shop
   (Decision 1). Per type, not per chunk (cost: one ES read per type, 4 per run). The end-of-run
   behaviour (full scan / item subset scan, missing-alt scan) is unchanged. `noindexTag` and
   `emptyImageAlt` are not recomputed mid-run (crawl / alt inventory) — they update at the end as
   today. A failure of the mid-run recompute must never fail or stall the sync (log and continue).
3. **Frontend, while an already-synced shop re-syncs** (any trigger; the item-Rescan behaviour from
   !2402 stays as is):
   - do not mask the 6 items; show their current stored counts, which the backend refreshes per
     type (Firestore snapshot already live);
   - Fix buttons / page-type rows enabled (`ChecklistActions`, `PageTypeRows`);
   - Rescan buttons of the 6 sync items visible but **disabled**, with a short reason
     (tooltip/help text, reuse an existing string if one fits, else new key in all 14 locales);
     non-sync items keep their current rules;
   - each of the 6 sync items shows a small subdued "Updating · N%" line (N% = the
     SEARCH_INDEX_SYNC registry row, floored like the dock; no % before the run is sized) so the
     merchant knows the numbers are moving — new string in all 14 locales;
   - the overall score shows its number (not "__") during the SYNC phase; the full SCAN phase
     (`checklist.scanning`, e.g. right after main Re-scan) behaves as today;
   - the page-wide "Syncing your store data" banner with progress bar stays for full re-syncs.
4. **Out of scope:** first sync, item Rescan flow, dock, PageSpeed, deploy. Keep every existing
   trackEvent.

## Tests (TDD, jest 24)

- helper "already synced" true/false incl. mid-run (fields after `startSearchIndexSync` reset).
- BE: type completion during a re-sync of a synced shop calls `applyStoreResourcesResult(shop,
  {duringSync:true})`; first sync does not; recompute error does not break the chain;
  `applyStoreResourcesResult` without the option still returns early while syncing.
- FE `useSeoScore`: synced shop + full sync → no masking, score shown (sync phase), first sync →
  masked as today. `ChecklistItem`: sync item Rescan disabled + "Updating · N%" during re-sync;
  Fix enabled.

## Docs

`docs/features/seo-audit.md` search-index sync section: progressive re-sync, first-sync exception.
