---
name: blogs-prod-deploy-by-tag
description: Blog app prod deploy chỉ chạy khi cắt tag; merge master không deploy, master trôi xa tag rất nhanh.
metadata:
  type: project
---

`blogs/.gitlab-ci.yml` job `deploy-firebase:production` có `only: - tags`. Merge vào master
KHÔNG deploy gì cả — giống seo ([[seo-prod-deploy-by-tag]]).

Hệ quả đã đo 2026-09-03: tag cuối `v1.81.117` cắt 2026-08-14, master hơn **183 commit**,
trong đó có 4 commit của Falcon Fix Bot vá bug thật (nút Add Related keywords `f4dbfd512`
2026-08-23). Merchant vẫn gặp bug đã fix 3 tuần.

**How to apply:** trước khi kết luận "prod không có fix này", chạy `git tag --contains <sha>` —
rỗng = chưa release, không phải chưa fix. Sau khi merge MR blog, nhắc cắt tag, nếu không fix
nằm chết trên master.
