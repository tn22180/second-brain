---
name: prod-logs-leak-credentials
description: Log prod in token merchant + cả env service; autofix lưu nguyên vào brain nên 75 credential thật nằm trong git second-brain
metadata:
  node_type: memory
  type: project
  originSessionId: 5a94b883-9706-43b4-9ded-2efb96ad2add
  modified: 2026-09-23T09:47:54.404Z
---

Log prod là bề mặt credential sống, không phải text vô hại:
- `seo` `packages/functions/src/services/shopifyService.js:39` (`initShopify`)
  `console.log` access token merchant kèm domain shop → mọi người đọc được
  Cloud Logging là thấy token Admin của khách.
- Payload alert/revision dump mang **nguyên block env** của service
  (`GCP_SERVICE_ACCOUNT_KEY`, `SHOPIFY_ACCESS_TOKEN_KEY`, `SHOPIFY_SECRET`,
  `MONGODB_URL`, `SMTP_PASSWORD`, `SWAGGER_JWT_SECRET`, ~60 key khác).

prod-error-autofix lưu thẳng evidence đó vào `brain/incidents/*.md` và
`scripts/jev-eval/eval.jsonl` → 75 giá trị thật vào git. Vá 2026-09-23
(`de6f62b`): `compact()` trong `src/gcloud/logs.ts` redact message/stack/url,
`logs.json` ghi bản đã redact, `redactSecret` thêm rule password trong URI.

Chưa làm: bỏ log token ở `shopifyService.js` (và grep 4 app còn lại), rotate
credential đã dính. Secret KHÔNG lên GitHub — push protection chặn từ đầu.

**Why:** redact chỉ chạy ở nhánh audit-findings; nhánh evidence không ai chặn.

**How to apply:** coi mọi thứ đọc từ Cloud Logging là dữ liệu bẩn, redact tại
điểm nhập trước khi ghi đĩa. Liên quan: [[second-brain-push-blocked-secrets]],
[[seo-prod-token-key-committed]]
