---
name: playwright-mcp-global
description: Playwright MCP at user scope (2026-10-08), --extension mode drives Tuan's own Chrome via the Playwright MCP Bridge extension
metadata:
  node_type: memory
  type: reference
  originSessionId: d9f700f9-18f8-43eb-8852-b9f16cc1d3b7
  modified: 2026-10-08T04:16:36.912Z
---

Playwright MCP is at user scope (2026-10-08), in **extension mode**:
`claude mcp add playwright -s user -- npx -y @playwright/mcp@0.0.82 --extension`
It drives Tuan's own running Google Chrome (his logins) through the Chrome extension "Playwright MCP Bridge". He chose this over a separate browser. The extension asks him to approve each connection/tab.

- `mcp__playwright` is allowed in `~/.claude/settings.json`.
- If the extension mode is dropped, the standalone mode needs `chromium-1246`, which is installed. Its profile was `~/.cache/claude-playwright-profile`.
- The tools only appear in sessions started after the install, so a session that was running at install time needs `/resume`.
- The workflow is the `shopify-testing` skill (embedded app URL pattern `admin.shopify.com/store/{store}/apps/{handle}`). Store and app handle come from `shopify.app.*.toml`; seo has a per-dev toml for each person, see [[seo-shopify-toml-per-dev]].

Tuan wants Claude to test UI/UX itself with this, not just read diffs.
