---
name: apc-prod-error-no-consumer
description: APC prod có log sink bắn vào topic prod-error-logs nhưng không có subscription và không có function handleProdErrorAlertGen2 — mọi lỗi prod bị vứt.
metadata:
  type: project
---

`ai-product-copy` (prod) là app DUY NHẤT trong 5 app không nhận prod-error alert.

Đo 2026-09-21:
- sink `prod-error-alerts` **có**, đích `pubsub.../topics/prod-error-logs`
- `gcloud pubsub topics list-subscriptions prod-error-logs --project ai-product-copy` → **0 items**
- `handleProdErrorAlertGen2` → 404, không tồn tại ở region nào (project có 21 function khác)
- collection `errorAlerts` → **0 doc**

Code thì có đủ: `packages/functions/src/index.js:106` export `handleProdErrorAlertGen2` với
`topic: 'prod-error-logs'`, `handlers/pubsub/handleProdErrorAlert.js` import
`avada-prod-error-alert`. Tức là **code chưa bao giờ được deploy**, không phải cấu hình sai.

**Why:** mọi lỗi prod của APC từ lúc dựng sink tới giờ bị vứt, không ai biết. Nghi ngờ liên
quan [[gen2-deploy-silent-freeze]] (APC từng đứng im 14 ngày).

**How to apply:** deploy `handleProdErrorAlertGen2` ở APC rồi kiểm lại bằng
`list-subscriptions`. 4 app kia đều có sub (eventarc/gcf) — so sánh với chúng.

Liên quan: [[seo-erroralerts-lastseenms]]
