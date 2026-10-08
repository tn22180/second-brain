# seo MR !2270 (FAL-837) — review round 2 fixes

Base: `origin/FAL-837` @ `f79432a6939` (round-1 fixes !2379 merged). MR target `FAL-837`, Draft
(touches AI-credit charging). Findings verified by 4 adversarial verifiers on 2026-10-08.

| # | Finding | Node |
|---|---|---|
| 1 | Bulk ISSUES uses unfiltered `fetchTabPage` → draft/archived resources generated and charged 1 credit each | issues-from-index |
| 2 | Fix-link `hasMetaIssue` ≠ checklist `checklistFieldsFor` (HTML meta credit, shop-name strip) → list ≠ count, credits on resources the checklist calls fine | issues-from-index |
| 8 | metaIssue branch: up to 10 sequential GraphQL pages, `maxRetries: 0`, throttle → empty 200; `fetchShopifyByIds` swallows errors | issues-from-index |
| 3 | `scoreBelow: 60` left in shared QueryContext → AI Content select-all estimate filtered, server runs on all | clear-score-filter |
| 9 | `useModalChecklistPages` stale-response race, cursor not reset, error shows "no pages" | modal-race |
| 4 | `count_optimized_images` dispatched per image → N full-history scans | recount-coalesce |
| 5 | every meta write runs shop-level `applyStoreResourcesResult` inline → N recomputes on bulk paths | recompute-coalesce |
| 6 | runner overwrites `issueFixed` with scan-start snapshot | runner-races |
| 7 | alt webhook count overwritten by scan's final push | runner-races |
| + | `bulkOperationHook` `!url` writes `missingAltCount: 0` even when the bulk op failed → checklist pass | runner-races |

## Decisions

- #1 #2 #8 → one fix: the checklist's ES verdict (`checklistIssues`, already written per doc at sync and refreshed on write) becomes the single source for "has a meta issue" in the Fix list, the ISSUES bulk run and `issueCount`. Rejected: re-implementing `checklistFieldsFor` inside `hasMetaIssue` — needs crawled HTML the Admin-API path doesn't have. Index docs are published-only (checklistDocsQuery), which also closes #1. Unsynced shop → ISSUES matches nothing (0 credits); the FE already gates on sync.
- #4 and #5 → coalesce with a Firestore "queued" flag cleared when the job starts (bounded to ≤1 running + ≤1 queued per shop), not a timer debounce — a debounce drops the trailing batch.
- #5 keeps the per-doc `refreshChecklistDocs` inline (cheap, keeps the doc current); only the shop-level recompute moves to a coalesced background job. `refresh: true` in elasticsearch.service is shared by other callers — not touched.
- #3: clear `scoreBelow` when AI Content mounts; the On-page list keeps it (that is where the Fix link sends you, chip is removable).
- Not fixed (low): RUNNING-after-create race (cosmetic), categories on custom-runner path, `?type=constructor`, `scoreBelow=abc`.
- Graph: 6 nodes, disjoint files, all parallel; Codex gpt-6-astra.

---

## Progress

**COMPLETE** → Draft MR !2381 (https://git.avada.net/avada/seo/-/merge_requests/2381), target `FAL-837`, not merged.

| # | Node | Agent / Model | Status | Rounds | Sec |
|---|------|---------------|--------|--------|-----|
| 1 | issues-from-index | codex / gpt-6-astra | ✅ | 2/5 | fixed (review: `await import` → `require`, 7fa54f5e351) |
| 2 | clear-score-filter | codex / gpt-6-astra | ✅ | 1/5 | clean |
| 3 | modal-race | codex / gpt-6-astra | ✅ | 2/5 | clean |
| 4 | recount-coalesce | codex / gpt-6-astra | ✅ | 2/5 | clean |
| 5 | recompute-coalesce | codex / gpt-6-astra | ✅ | 1/5 | clean |
| 6 | runner-races | codex / gpt-6-astra | ✅ | 1/5 | clean |

Final jest functions+assets: 388 pass / 6 fail suites, all pre-existing or flaky. Security on the whole branch: clean. Every new query is scoped by shopId, no secrets, the new Firestore collection `storeChecklistRecompute` is keyed by shopId.
