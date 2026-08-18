---
name: seo-prod-token-key-committed
description: SHOPIFY_ACCESS_TOKEN_KEY của prod bị hardcode trong fixProBackToFree.js:95, nằm trong 6 commit — cần rotate
metadata:
  type: project
---

`packages/functions/src/commands/fixProBackToFree.js:95` hardcode literal 32 ký tự truyền vào
`prepareShopData`. Fingerprint `ee21a87f/32` — **trùng đúng** `SHOPIFY_ACCESS_TOKEN_KEY` trong
`PRODUCTION_ENV_FILE` (CI var, project 426). Còn trong build output `packages/functions/lib/`.

Key này giải mã `accessTokenHash` → access token Shopify của **mọi** merchant trên `avada-seo`.
Phát hiện 2026-08-18 khi lần lỗi khác. Chưa rotate tính đến ngày đó.

**Why:** xoá dòng không cứu được — key đã nằm trong 6 commit lịch sử. Chỉ rotate mới đóng được.

**How to apply:** rotate = đổi `SHOPIFY_ACCESS_TOKEN_KEY` prod **và** re-encrypt `accessTokenHash`
toàn bộ collection `shops` — đụng dữ liệu prod, phải có kế hoạch, không sửa kèm MR khác.
Token nằm ở field `accessTokenHash` (AES), không phải `accessToken`;
`@avada/core` `shopRepository.js:114-120` giải mã trong `prepareShopData`.
