# Blog DevZone: CS-granted features (MCP first)

Source: Slack #dich-vu-5-seo, Ricky (U08A3VC53S5), 2026-10-13 14:34 —
"thêm một option no limit trong dev zone cho app blog, hoặc grant feature như SEO, để khách nào cần
mình apply cho, ngoài ra CS cần test thì có cái mà test, hiện tại MCP connection đang ko test được ở free".
Tuan replied "ok". No Jira (CS request, small).

## Why

Blog MCP (AI assistant connection) is Pro-only, hard-coded in two gates:
- `packages/functions/src/mcp/mcp.admin.controller.js` `eligibility()` — `proPlans.includes(shop.plan)`
  (startConnect, listTokens, issueToken all use it)
- `packages/functions/src/mcp/mcp.middleware.js:58` — `ctx.state.mcpBlocked = !proPlans.includes(shop.plan)`

CS has no way to unlock it per shop, so a free test store can't test MCP and a merchant who needs
it can't be granted it. SEO solved the same problem with `grantedFeatures`
(seo `packages/functions/src/config/subscription/grantedFeatures.js` + DevZone
`GrantedFeaturesContainer`). Blog has nothing equivalent (0 hits for grantedFeatures/noLimit on master).

## Decisions (binding)

1. Port SEO's pattern, not a blanket `noLimit`. A blanket flag would have to be wired into every
   plan gate in the app; a registry lets CS grant one feature and grows by one line per feature.
2. New `packages/functions/src/config/subscription/grantedFeatures.js`: `GRANTABLE_FEATURES`
   (start with `mcp: {label: 'AI assistant (MCP) connection'}`), `hasGrantedFeature(shop, key)`,
   `sanitizeGrantedFeatures(value)`. Use hasOwnProperty, never bare lookup (prototype keys).
   Unknown keys never persisted.
3. Both MCP gates become `proPlans.includes(shop.plan) || hasGrantedFeature(shop, 'mcp')`.
   Factor into one helper so the two can't drift.
4. DevZone: new `update` case `granted-features` that writes `{grantedFeatures: sanitize(data.grantedFeatures)}`
   to the shop doc via `updateShopData`. Shop doc already flows to FE? verify; FE needs current
   `grantedFeatures` to render checkboxes.
5. FE: a DevZone section "Granted features" — one checkbox per GRANTABLE_FEATURES key, Save button,
   toast on success/fail. Mirror the existing DevZone section style (CardCollapse etc.).
6. Revoking (unticking) must re-block MCP on the next request — no caching of the grant beyond the
   shop read the gates already do.
7. Do not change MCP_BLOCKED / UPGRADE_MESSAGE copy. Do not touch the internal-key whitelist for
   dev_zone types (TS AI) — CS AI owner (Fennic) asked to be told before route/auth changes;
   adding a new dev_zone type without whitelisting it changes nothing for the bot.

## Done when

- free shop + grant `mcp` → listTokens `canConnect: true`, startConnect/issueToken pass, middleware
  not blocked; ungrant → blocked again. Pro shop unchanged.
- Unknown key in PUT body is dropped.
- docs/features/mcp.md (plan gate section) + a short note in the DevZone doc if one exists.

## Log

- 2026-10-13: harness run done (Codex). Review: reverted out-of-scope eslint shim (eslintCompatibility.js + 2 .eslintrc.js) and 3 unrelated test edits; switch→if. 96/96 tests, eslint clean. MR !923 open, not merged/deployed. No Slack reply (per Tuan).
