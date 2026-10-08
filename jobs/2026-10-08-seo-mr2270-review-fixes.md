# seo MR !2270 (FAL-837) — review fixes

Source: review of https://git.avada.net/avada/seo/-/merge_requests/2270 after merging master
into `FAL-837` (merge commit `4ca59e874ed`). Fixes go in a **separate MR** targeting `FAL-837`.

Scope (verified in code, 2026-10-08):

1. **i18n key missing** — `Audit.appliedFilters.scoreBelow` used at
   `packages/assets/src/pages/Audit/{Products/List.js:101,Collections/List.js:93,Articles/List.js:200}`
   but absent from `pages/Audit/Audit.json` and every locale → `MissingTranslationError` when the
   checklist's On-page score Fix link sets `scoreBelow`.
2. **Lighthouse `ran` lies** — `services/lightHouseService.js` `getAuditResultByLightHouse` returns
   `ran: !!lightHouseResult`; a PSI result carrying `runtimeError` (NO_FCP, FAILED_DOCUMENT_REQUEST)
   or empty `audits` still counts as ran → imageDelivery / lcpImage / jsLongTime pass falsely.
3. **storeResources reads a half-synced index** — `services/audit/artifacts/storeResources.js` reads
   ES counts without `needsChecklistSync(job)`; a failed/running/old-version sync reads as the whole
   store. `refreshChecklistDocs` (storeScan.js:516-517) already gates the same way.
4. **One bad issue wipes the scan** — `services/audit/audit.js:40` `prepareIssue` maps through
   `convertDataIssue`, which returns `undefined` on catch; `calcScoreDependOnIssues` destructures
   `({severity})` → TypeError → runner catch zeroes the score.

## Decisions

- New MR target → `FAL-837`, not master — the fixed code exists only on FAL-837; a master MR would carry the whole feature.
- Branch `fix/FAL-837-review-fixes` cut from `origin/FAL-837` (incl. master merge `4ca59e874ed`).
- Locale: hand-add the key to all translation files (proper per-language strings) instead of `yarn update-label` — needs GOOGLE_TRANSLATE_API_KEY + network, unavailable in the Codex sandbox; FAL-1038 did the same.
- Yellow findings (runner issueFixed race, fileImageService fan-out, bulk RUNNING race, etc.) are NOT in this MR — listed in the MR description for tunglv to triage.
- 4 independent nodes, disjoint files → graph, maxParallel 4, executor Codex gpt-6-astra.
- MR not Draft: no auth/billing/credits path touched; audit verdict path only.

---

## Progress

Started: 2026-10-08 — **COMPLETE** → MR !2379 (https://git.avada.net/avada/seo/-/merge_requests/2379), target `FAL-837`, not merged.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | i18n-score-below | codex / gpt-6-astra | ✅ | 1/5 | clean | 14 locales + Audit.json |
| 2 | lighthouse-ran | codex / gpt-6-astra | ✅ | 1/5 | clean | early return when !ran |
| 3 | store-resources-sync-gate | codex / gpt-6-astra | ✅ | 1/5 | clean | |
| 4 | prepare-issue-filter | codex / gpt-6-astra | ✅ | 1/5 | clean | runner blocked on pre-commit prettier in test; eslint --fix + manual commit/merge in session |

Final: jest functions+locale 333 pass / 10 fail suites, all pre-existing or flaky (jest 24 `node:*`). Whole-branch security: clean (22 files, +329/−2; no secrets, logs carry shopId/url/runtimeError code only).
