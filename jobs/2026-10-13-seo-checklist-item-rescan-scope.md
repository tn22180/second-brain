# SEO checklist (FAL-837) — item Rescan rescores only the 6 sync items, loads only the pressed one

Base: `FAL-837` @ 14e4457876. Branch: `fix/FAL-837-item-rescan-scope` → MR into `FAL-837`.

## Why (Esther review, 2026-10-13 15:50)

Pressing Rescan on one of the 6 sync items (`metaTitle`, `metaTitleLength`, `metaDescription`,
`metaDescriptionLength`, `noindexTag`, `emptyImageAlt` — `const/checklistRescan.js` strategy
`storeIndex`) starts an incremental search-index sync. Today:

- when the sync ends, `triggerNextBulkOperation` (`services/jobDataMigrate.service.js` ~:150) calls
  `startChecklistScan(shop)` → full 29-item manual scan (`subscribeScanIssues` type manual →
  `generateSeoChecklists({fresh:true})`, re-measures PageSpeed, `Audit.getChecklistId` wipes
  `issues` to `{}` and raises `checklist.scanning`);
- the FE masks all 6 sync items as scanning and shows the overall score as "__" while the shop-wide
  `syncing` flag is on (`assets/src/hooks/useSeoScore.js` `shownData`, `isLoading`, context `scanning`;
  `OverallScore.js` "__");
- Rescan buttons are hidden/ignored while syncing (`ChecklistItem.js`), so a second sync item cannot
  join.

Esther wants:
1. After an item-triggered sync, rescore ONLY the 6 sync items. Main Re-scan still scans everything.
2. Only the item(s) the merchant pressed show loading. The other 5 sync items, all other items and the
   overall score keep their old values, and update by themselves when the sync + rescore finishes.
3. While that sync runs, pressing Rescan on another of the 6 marks that item loading too and joins the
   running sync — no "please wait" message.

## Decisions — binding

1. **Record the trigger on the job doc.** `startSearchIndexSync` (`services/searchIndexSync.js`) takes
   an option (e.g. `{trigger: 'issueRescan'}`) and writes `syncTrigger: 'issueRescan' | 'full'` on every
   run it starts (both the first-run save and the update path). All callers other than
   `seoChecklistController.rescanIssue` (main Re-scan `seoController.getIssues`, banner/gate
   `auditAgentController.mutationBulkOperation`, any other) write `'full'`. `syncMode` is not a
   substitute: an item Rescan may fall back to a full export and is still `issueRescan`.
   Joining a running sync (`started:false`) does not change the running job's trigger.
2. **Server-side per-item loading.** In the storeIndex branch of `rescanIssue`, whenever the response is
   success (a new sync started OR joined a running one), set `avada-seo-checklist.issues.<type>.rescanning
   = true` (+ `rescanStartedAt`) for the pressed type only, the same fields the other strategies use and
   `Runner.auditIssues` clears in `finally`. Do not set it on 429/409/error responses.
3. **Completion branch.** In `triggerNextBulkOperation`, when the run succeeded and
   `job.syncTrigger === 'issueRescan'` and the checklist has been scanned before (`lastScanAt` present):
   dispatch `scanIssues` with `{shop, types: <the 6 storeIndex types>, strategy: <new strategy name, e.g.
   'storeIndexSynced'>}` via `dispatchWork` instead of `startChecklistScan`. Keep the existing ordering
   (scan dispatched before the job goes `done`) and keep the V25 `startMissingAltScan`. Otherwise
   (`full` trigger, or never scanned) keep `startChecklistScan` exactly as today.
   In `handlers/pubsub/subscribeScanIssues.js` the new strategy: no `refreshChecklistDocs` (index is
   fresh), `forceRefresh: true` so the home page is re-crawled, goes through `Runner.auditIssues` →
   `mergeIssueResults` → `finishAudit` (rescored `score` + `categoryScores`, no `scanning`, no wipe).
   Export the 6-type list from `const/checklistRescan.js` (e.g. `STORE_INDEX_TYPES`) and use it on both
   sides (the FE `SEARCH_INDEX_ITEMS` copy in `useSeoScore.js` should import it via `@functions/...`).
4. **Failure.** When an `issueRescan` sync ends failed (or is cancelled/stale), clear `rescanning` on the
   6 types so no item spins forever; the existing failed-sync banner/notice handles messaging. Check
   how the FE treats a stale `rescanning` (rescanStartedAt) and keep it consistent.
5. **FE.** Derive `itemSync = syncing && jobState.syncTrigger === 'issueRescan'` (from
   `useJobDataMigrate`). While `itemSync`:
   - do not mask the 6 items, do not put `syncing` into `isLoading` / context `scanning` (overall score
     keeps its number, no "__", no gauge spinner, no "Syncing your store data · N%" line under the gauge);
   - the Rescan button of the 6 sync items stays visible and clickable; its loading is
     `requesting || issue.rescanning`; pressing it calls the API (which joins and marks it rescanning).
     Non-sync items keep their current rules.
   - The Sync-gate / banner / main Re-scan behaviour for a `full` sync stays exactly as today
     (all 6 masked, "__", progress line).
   A 409 `checklist_scan_running` or 429 `issue_rescan_cooldown` keeps its toast — those only happen
   when no item sync is running.
6. **Out of scope:** main Re-scan, PageSpeed, the Sync-now gate, tracking events (keep existing
   `trackEvent` calls; the rescan click already tracks), deploy.

## Tests (TDD, jest 24)

- `startSearchIndexSync` writes `syncTrigger` issueRescan/full per caller; joining keeps the running
  trigger.
- `rescanIssue` storeIndex: sets `rescanning` on the pressed type on start AND on join; not on 429.
- `triggerNextBulkOperation`: issueRescan + previously scanned → dispatches the 6-type subset scan, not
  `startChecklistScan`; full trigger → `startChecklistScan`; issueRescan never scanned → full scan;
  failed issueRescan → clears `rescanning`.
- `subscribeScanIssues` new strategy → `Runner.auditIssues(shop, types, {forceRefresh:true})`, no
  `refreshChecklistDocs`.
- FE `useSeoScore`: item sync → no masking, score shown, isLoading false; full sync → unchanged.
  `ChecklistItem`: sync item clickable + loading from `issue.rescanning` during item sync.

## Docs

`docs/features/seo-audit.md` Rescan / search-index sync section: trigger field, subset rescore after
item sync, per-item loading, join behaviour.
