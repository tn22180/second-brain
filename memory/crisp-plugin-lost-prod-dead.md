---
name: crisp-plugin-lost-prod-dead
description: "Crisp plugin token cũ bị mất → mọi read Crisp ở prod trả not_subscribed từ ~2026-08-10; token mới mới chỉ nằm ở seo .env.local, prod chưa update"
metadata: 
  node_type: memory
  type: project
  originSessionId: eee9f7cf-a61c-477e-a243-9c27734ba14e
  modified: 2026-09-10T03:16:37.515Z
---

Plugin token Crisp cũ (`97b91091…`/`d157c53d…`, dùng chung cả 5 app) **mất quyền trên website
`dbb461f3-42ba-4046-bd39-cb50fc8f63f3`**. Mọi request trả:

```
404 {"reason":"not_subscribed","message":"the website is not subscribed to the plugin"}
```

Đo được ở prod `avada-seo` (2026-09-09): 552 lần `not_subscribed` trong 30 ngày log, sớm nhất còn
thấy 2026-08-10 (`[findSessionIdByDomain]`); `crispSegments/oneStarShops.syncedAt` đứng ở
**2026-07-29** với 21 shop (6 crisp + 15 appstore) → vỡ trong khoảng 07-29 → 08-10.

Hệ quả: list 1-sao đóng băng, dòng `*Crisp:* Open conversation` trong alert ENT/Pro **chưa bao giờ
render ở prod**, và exclusion `ent_no_reply` là no-op (fail-open nên không gãy gì).

Token mới (`bf3b704a…`) hoạt động — kiểm 2026-09-10: `1-star` 61 conversation, `enterprise` 1028,
`cs-skip-alert` 1. Nhưng **mới chỉ có trong `seo/packages/functions/.env.local`**; prod vẫn chạy key
cũ trong function config, phải update `CRISP_IDENTIFIER`/`CRISP_KEY` ở `PRODUCTION_ENV_FILE` từng
repo rồi deploy (seo phải cắt tag) mới sống lại.

Cách đọc key prod thật (không tin `.env` local): `gcloud functions describe apiGen2 --project
avada-seo --region us-central1 --format="json(serviceConfig.environmentVariables)"`.

Scope token cần, theo call thật trong code: `website:conversation:sessions` (list/search — cả 5
app), `website:conversation:messages` (sendMessageInConversation — seo/blogs/AEO/img),
`website:conversation:metas` read+write (img: updatePlan + getConversationSegments).

Liên quan: [[seo-prod-deploy-by-tag]], [[avada-gitlab-host-migration]]
