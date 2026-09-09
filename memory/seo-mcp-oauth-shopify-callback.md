---
name: seo-mcp-oauth-shopify-callback
description: SEO MCP prod OAuth — redirect_uri ĐÃ whitelist (đo được); cái chết thật là CSP form-action thiếu admin.shopify.com ở nhánh form nhập shop.
metadata: 
  node_type: memory
  type: project
  originSessionId: 74fdfe65-e61e-475d-8430-e88d8468cc67
  modified: 2026-09-09T07:24:01.279Z
---

**Đã sửa 2026-09-09.** Bản cũ của memory này ghi "`/mcp-oauth/shopify-callback` chưa whitelist ở
Partner Dashboard" — **sai**. Log prod `avada-seo` 08–09/09 có **16 lần `GET /mcp-oauth/shopify-callback`
trả 200**; nếu chưa whitelist thì con số đó phải là 0. Đừng đi lại giả thuyết này.

Cái chết thật nằm ở **một trong hai nhánh** của `/mcp-oauth/authorize`:

- biết shop từ `resource` → **GET 302** thẳng Shopify → **chạy tốt**, 16/16 callback đều từ đây
- không biết shop → render `mcpShopForm`, merchant **POST** domain sang `/mcp-oauth/shop`
  → **65 lần POST, 0 callback quay về. Chưa từng connect thành công lần nào.**

**Why:** `allowFormRedirect` chỉ khai `form-action 'self' https://*.myshopify.com`. CSP `form-action`
áp cho **cả chuỗi redirect**, không riêng hop đầu, mà chuỗi Shopify là 4 hop và kết ở
`admin.shopify.com/store/<shop>/oauth/authorize` (thêm `accounts.shopify.com` khi merchant chưa đăng
nhập). Browser huỷ navigation ở hop cuối — **không có log server nào**, merchant bị đẩy về form.
Nhánh GET-302 không có form nên không bao giờ dính.

**How to apply:** khi MCP connect "redirect sang Shopify rồi không quay lại", đừng nghi whitelist —
đếm `POST /mcp-oauth/shop` vs `GET /mcp-oauth/shopify-callback` trong log prod trước. Lệch hẳn về 0
là CSP, không phải OAuth config. Mọi host trong chuỗi phải nằm trong `form-action`
(`helpers/mcp/formActionPolicy.js` sau MR !2241). Kích hoạt: `ead10e8531` (08/09) đổi URL copy ở màn
AI Connect sang `/mcp` trần nên merchant rơi vào nhánh form; `docs/features/mcp-connect.md:231` vẫn
ghi URL dạng `/s/<store>` — một trong hai đang sai.

Vẫn đúng: `shopify.app*.toml` bị `.gitignore:98-99` nên repo không mang được redirect URI; nó chỉ
tới prod qua CI var `$PROD_APP_TOML` (`.gitlab-ci.yml:2186-2187`). Xem [[seo-prod-deploy-by-tag]].
