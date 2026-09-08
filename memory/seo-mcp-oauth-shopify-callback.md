---
name: seo-mcp-oauth-shopify-callback
description: SEO MCP prod OAuth chết ở chặng Shopify vì /mcp-oauth/shopify-callback chưa whitelist; repo không encode được vì shopify.app*.toml bị gitignore.
metadata:
  type: project
---

SEO MCP lên prod (`avada-seo`, issuer `https://seo.apps.avada.io`) từ tag `v1.86.9` (2026-09-08)
nhưng bỏ bước whitelist. `mcpOAuthController.js:193` redirect sang Shopify với
`redirect_uri = <issuer>/mcp-oauth/shopify-callback` → Shopify từ chối, merchant chết ở chặng đó.

**Why:** `shopify.app.toml` và `shopify.app.*.toml` bị `.gitignore:98-99` → per-dev, không tracked.
Không có file nào trong repo mang được URL này; chỉ Partner Dashboard. `docs/features/mcp-connect.md`
đã ghi sẵn bước 2 phần Deploying ("Nothing in this repo can do this") nhưng deploy prod vẫn bỏ qua.

**How to apply:** trước khi bật MCP OAuth ở bất kỳ project nào (staging lẫn prod), thêm
`<issuer>/mcp-oauth/shopify-callback` vào allowed redirection URLs của app đó trong Partner Dashboard.
Lớp discovery không bắt được lỗi này — `/.well-known/*`, `/mcp-oauth/register`, `/authorize`, `/token`
đều trả đúng; chỉ chặng Shopify chết. Xem [[seo-prod-deploy-by-tag]].
