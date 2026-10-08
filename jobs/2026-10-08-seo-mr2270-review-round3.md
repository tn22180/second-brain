# seo MR !2270 (FAL-837) — review round 3 fixes

Base: `origin/FAL-837` @ `69c030bd406` (round 2 !2381 merged + master merged again). MR target `FAL-837`.
Round 3 review: 5 reviewers, each finding self-disproved before reporting; 0 🔴.

| Finding | Node |
|---|---|
| Round-2 regression: `recountQueuedAt` never cleared by the Pub/Sub `count_optimized_images` job → recounts suppressed 15 min, trailing recount lost | recursive-markers |
| Round-2 regression: queued store recompute uses the writer's stale `shop.issueFixed` → reopens dismissals | recursive-markers |
| Failed recompute dispatch leaves its marker → 10 min of writes queue nothing | recursive-markers |
| ISSUES bulk preview filters Admin API nodes (≠ what the run generates) | issues-preview-report |
| getResourceReport ES read before cache, no catch → ES down = all zeros | issues-preview-report |
| Dead `scanForIssueNodes` | issues-preview-report |
| Missing input reported as pass/fail: errored Lighthouse audits, PSI failure (invented 50/50), lazyLoad/preload with nothing crawled, review-snippet fetch error → pass, onpage score counts unpublished/old-version docs, empty COMPLETED alt scan never reaches checklist | notchecked-inputs |
| Modal treats `{success:false}` (HTTP 200) as empty; missing `loadingMore` key; needsSync/notChecked ignored by Fix + issues option; sync banner flashes before first snapshot; AI Content lists fetch with stale score filter | frontend-states |
| seo-audit.md: stale anchors (docs gate passes anyway) + 4 stale claims; bulk-optimize-apply.md recount | docs-sync |

## Decisions

- Not fixed (deferred, listed in MR): inline `refreshChecklistAfterWrite` cost on bulk-edit paths (extra Shopify nodes query + loadAppMetaContext per 25-batch) — needs a caller opt-out across bulkEditService/analysisRepository, out of review-fix scope; settings artifact `{}` on error and htmlPageContent '' on fetch failure (touch ~8 issue classes, pre-existing).
- Docs gate passes with stale line numbers → gate only checks the cited line exists, not that it still holds the symbol. Reported, not fixed here (tooling).
- Graph: 4 parallel code nodes + docs node after all; Codex gpt-6-astra; prompts carry the no-`await import()` rule.

---

## Progress

**COMPLETE** → MR !2383 (https://git.avada.net/avada/seo/-/merge_requests/2383), target `FAL-837`, not merged.

| # | Node | Agent / Model | Status | Sec |
|---|------|---------------|--------|-----|
| 1 | recursive-markers | codex / gpt-6-astra | ✅ 3 rounds | clean |
| 2 | issues-preview-report | codex / gpt-6-astra | ✅ | clean (getResources keeps doc.shopId gate) |
| 3 | notchecked-inputs | codex / gpt-6-astra | ✅ 2 rounds | fixed in review: hasAuditInput rejected `notApplicable` audits → image delivery notChecked on every clean page (9f9cd84e127) |
| 4 | frontend-states | codex / gpt-6-astra | ✅ | clean |
| 5 | docs-sync | codex / gpt-6-astra | ✅ | clean |

Review commits (Claude, from local UI test on linhnguyen11 / SEO Tony):
- 9f9cd84e127 — notApplicable Lighthouse audits; `status_scanning` items printed the pass sentence.
- 1707c8b8f99 — checklist `syncing` ignored `isStaleScanJob` → dead sync = "Syncing" forever.

jest (repo root): same 4 failing suites as FAL-837 baseline; others are parallel-load flakes (pass isolated). No `await import(`.

Local test env notes: `packages/functions/.env` has no `ELASTICSEARCH_NODE` → localhost:9200; ran ES 8.19.1 in colima (`seo-es-local`). Sync still fails locally: storefront/REST ETIMEDOUT under ~100 concurrent fetches per chunk, and a `got` rejection goes unhandled → "Your function was killed because it raised an unhandled error" → whole chunk lost → `sync failed`. Follow-up: find the unawaited `got` promise in the export chunk path (one Shopify timeout should not kill a chunk in prod either).
