# Falcon Nexus — feature detail page + system-event exclusion

Repo: `avada/seoon-team/falcon-event-tracking` (git.avada.net), base `main` @ 0b77e9b.
Branch: `feat/feature-detail`. App: `apps/dashboard` (Next.js 16 — read `apps/dashboard/AGENTS.md`
first: this Next version has breaking changes vs. training data).

## Why (Tuan, 2026-10-13)

The SEO checklist redesign (seo FAL-837) ships soon and the team needs one place to see whether a
feature is used and whether it helps merchants. `/features` already shows adoption per card and the
app-wide funnel, but a card cannot be opened: there is no per-feature breakdown, no trend, and no
outcome. CS feedback and App Store reviews are out of scope (Tuan asks CS directly).

## Decisions — binding

1. **System events are not usage.** Some apps now emit outcome rows the app records itself, not a
   merchant action. They carry `payload.system = true` (first one: SEO Suite
   `menu=seo-audit, card=checklist-v2, event_type=feature_completed, payload.element='checklist_scan_result'`,
   payload `score`, `category_scores`, `failing_count`, `failing_types[]`, `not_checked_types[]`; it
   also fires on background scans). Every usage number — `/features` funnel and adoption,
   `/overview`, and any other query that counts shops/events as usage (grep `queries.ts` and the MCP
   tools under `src/lib/mcp/tools/`) — excludes `JSON_VALUE(payload, '$.system') = 'true'` rows, the
   same way `getFeaturesData` already excludes `payload.visibility_check`. Do it once in a shared SQL
   helper, not per query. Document it in the `adoption` docs item (`docs-content.ts`).
2. **Feature detail page.** Clicking a row in "Adoption by card" on `/features` opens
   `/features/[menu]/[card]` (respecting the selected app and range exactly like `/features`). It shows,
   for that card in the range, all from `falcon-ecb55.product_analytics.events`, system rows excluded
   unless stated:
   - Header: shops used, adoption rate vs app active shops, completions — same definitions as the
     adoption table so numbers match the row clicked.
   - Weekly trend (calendar-aligned VN weeks, like the existing windows): shops opened
     (`feature_opened`), shops started, shops applied/completed.
   - Breakdown by action: group by `COALESCE(payload.issue_type, payload.action, payload.element)`
     and event_type → events + distinct shops. This is how the checklist shows which items merchants
     fix (`feature_applied` with `payload.issue_type`) and which new actions they press.
   - Failures: `feature_failed` grouped by `payload.error_reason`.
   - **Outcome (only when the card has system rows with a numeric `payload.score`)**: average score per
     day across shops, and per item from `failing_types`: shops failing it at their first recorded
     scan in the range and how many no longer fail it at their latest (shops with ≥2 scans). Empty state
     when there are none yet — that is the checklist until the seo release.
3. Follow the existing page patterns exactly: server component + `getXData` in
   `src/lib/bigquery/queries.ts` with parameterised SQL (`@appId`, `@from`, `@to`, plus `@menu`,
   `@card` — never string-interpolate user input), `PendingContent` + `loading.tsx`, `Card`/`Table`/
   `Chart` components, `CHART_COLORS`, `DocsHelpButton` + a docs item for every new metric, every new
   string in BOTH dictionaries in `src/lib/i18n.ts` (en + vi). Unknown menu/card → the existing empty
   state, not a crash. Keep cost down: one query per section at most, select only needed columns.
4. Tests (vitest, TDD): the system-row exclusion helper and that the adoption/funnel SQL uses it; the
   detail data mapper (breakdown, trend, outcome first-vs-latest logic) with fixture rows; the page
   renders empty states. No live BigQuery in tests — mock `runQuery` like the existing
   `events-query.test.ts` does.
5. Out of scope: CS/Crisp, App Store reviews, changing the event tracker package, deploy.
