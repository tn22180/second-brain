---
name: seo-mcp-oauth-secret-weak
description: MCP_OAUTH_SECRET ở prod avada-seo là chuỗi 5 ký tự (1 từ) — HMAC key ký access token MCP, phải rotate
metadata:
  type: project
---

Cloud Run `mcpgen2` và `mcpoauthgen2` (project `avada-seo`) đặt `MCP_OAUTH_SECRET` = chuỗi **5 ký tự,
1 từ tiếng người** (kiểm 2026-09-21). Đó là khoá HMAC-SHA256 ký access token MCP
(`helpers/mcp/accessToken.js:sign/verify`); payload chỉ chứa `{c: connectionId, s: scopes, e: exp}`.

**Why:** có 1 token hợp lệ (ai cũng lấy được bằng cách connect shop của chính mình) là brute-force
offline ra secret trong vài giây → forge token cho `connectionId` bất kỳ, đọc/ghi MCP shop khác.
Rào cản duy nhất còn lại là đoán `connectionId` (Firestore auto-id 20 ký tự) — nhưng
`upsertDevConnection` dùng id đoán được `dev-<shopId>`.

**How to apply:** rotate sang >= 32 byte random ở cả hai service (token đang phát TTL 3600s nên
rotate = mọi client phải OAuth lại). Prod đang đặt `MCP_LEGACY_LINK_ENABLED=false` — giữ nguyên.
