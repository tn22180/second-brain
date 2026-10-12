# SEO checklist (FAL-837) — BA review fixes (Esther, 2026-10-12)

Base: `FAL-837` @ 38e379a0e2 (includes !2383, !2392, !2393). Branch: `fix/FAL-837-esther-review`.
MR target: `FAL-837`. Staging: stg3 (`avada-seo-staging-3`).

Already done, out of scope: image alt counting/Fix/Maximum charge (!2393), onpage count mismatch
(!2393). Do not change image alt counting.

## The review (binding, BA's words, translated)

1. **Speed score**
   - The speed score in the checklist and on the Speed up page must be one number. Today the
     Speed score item's Rescan runs PSI but does not save into the app's speed score, so Speed up
     still shows the old score; the main Re-scan reads the stored score and does not measure.
   - Both the Speed score item's Rescan and the main Re-scan must re-measure speed and update both
     places.
   - When PSI fails or times out without a score: keep the old score and report that the
     measurement did not succeed. Today the item turns "not checked" and the old score is lost.
2. **Lazy load, Instant page**
   - Enable in the checklist turns the feature on right there, as on prod (the old checklist), not
     a redirect to Speed up.
   - A free store pressing Enable on Lazy load gets the upgrade modal (as the old checklist).
3. **Rescan, Sync and buttons**
   - Rescan on the items that need the sync (Meta title, Meta title length, Meta description,
     Meta description length, Noindex, Image alt) runs the sync. Today they only re-read the last
     sync, so a merchant who fixed something and pressed Rescan still sees the old result.
   - Therefore remove the sync button in the category-tab corner and the "last synced" time beside it.
   - Copy that tells the merchant to sync changes accordingly, e.g. Image alt not checked:
     "Sync your store data, then rescan to check image alt text."
   - Onpage SEO score and the 4 meta items show a black (primary) Fix per page-type row, so one item
     has 2-3 black buttons — wrong for Polaris. Keep the number of Fix buttons; make these row
     buttons secondary (white).
4. **Banners**
   - **Existing shops** (installed before this ships to prod): merge the sync banner into the
     "SEO checklist updated" banner, with a Re-scan now button:
     - Title: SEO checklist updated
     - Content: We've updated the SEO checklist to follow the latest SEO best practices. Your SEO
       score may change. {Contact us} if you have questions.
     - Button: Re-scan now
     - Stays until the merchant closes it. Re-scan now disappears when the sync succeeds; reappears
       if the sync fails; loading while syncing.
   - Keep the sync progress banner and the sync failed banner.
   - Sync failed: today the 5 meta/noindex items go to not checked and lose the last successful
     sync's results, while the failed banner says "may be out of date". Required: after a failed
     sync keep the last successful sync's results.
   - **New shops**: the merchant presses Sync now (current gate in the score circle). The server
     already re-scores the checklist after a successful sync, so the Sync now block copy becomes:
     "The meta tag and noindex checks cover your whole store, so they need a copy of your store
     data. Sync it once and we'll scan the checklist for you."
   - "SEO checklist updated" shows only to shops installed before the prod release; shops installed
     after never see it.

## Decisions (Tuan, 2026-10-12)

- Old vs new shop = install date vs the release date. The release date is one exported constant
  (e.g. `CHECKLIST_REDO_RELEASED_AT` in packages/functions/src/const/), set to `2026-10-12` for
  staging; it is updated to the prod release date when the tag is cut (say so in the MR).
- New shops (installed on/after the date): the blurred-issues + Sync now in the score circle gate.
  Existing shops: no gate; the "SEO checklist updated" banner with Re-scan now.
- Image alt Rescan: follow item 3 (run the sync). The sync's completion already starts the
  missing-alt scan and recomputes Image alt.
