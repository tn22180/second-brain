---
name: playwright-mcp-global
description: "Playwright MCP user scope: `playwright` = Chrome riêng isolated + storage-state Shopify; `playwright-ext` = lái Chrome của Tuan qua extension (token từ .env)."
metadata:
  node_type: memory
  type: reference
  originSessionId: 5ab8c006-452d-488f-95cc-d8b18967f355
  modified: 2026-10-14T10:56:02.441Z
---

Từ 2026-10-14 có 2 server Playwright MCP ở user scope (`~/.claude.json`), backup cũ ở `~/.config/playwright/claude.json.bak`:

- `playwright` (mặc định): `@playwright/mcp@0.0.82 --browser chrome --isolated --storage-state ~/.config/playwright/shopify-state.json`. Mỗi session tự mở Chrome riêng, đã login Shopify admin sẵn bằng cookie.
- `playwright-ext`: `~/.config/playwright/mcp-ext.sh` đọc `PLAYWRIGHT_MCP_EXTENSION_TOKEN` từ `second-brain/.env` rồi chạy `--extension`, lái Chrome thật của Tuan qua extension Playwright MCP Bridge mà không cần bấm duyệt.

**Why:** extension bridge chỉ nối được 1 server một lúc. 10-14 có 13 server `--extension` từ nhiều session tranh nhau, `browser_tabs` treo hơn 120s. Token chỉ bỏ được bước bấm duyệt, không chữa được việc tranh nhau đó.

**How to apply:**
- Test app Shopify thì dùng `playwright`, skill shopify-testing.
- Cookie hết hạn (bị đá ra trang login): chạy `PW_CORE=<npx dir>/node_modules/playwright-core node ~/.config/playwright/save-shopify-state.js [store]`, Tuan login trong Chrome hiện ra.
- Không chờ MCP được thì chạy playwright-core thẳng: `chromium.launch({channel:'chrome'})` + `newContext({storageState})`.
- Session mới hoặc `/mcp` reconnect thì đổi config mới có hiệu lực.
