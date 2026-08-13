---
name: gen2-deploy-silent-freeze
description: "Gen2 (Cloud Run) app deploy fail health check thì pipeline vẫn xanh và prod đứng im ở revision cũ — phải check status.traffic revisionName, không tin pipeline"
metadata: 
  node_type: memory
  type: project
  originSessionId: 049a8f93-ca51-4912-9141-c809eaeab230
  modified: 2026-08-13T11:01:23.502Z
---

App Gen2 (Cloud Run) — `firebase deploy` **tạo revision thành công là pipeline xanh**, kể cả khi
container crash lúc startup. Cloud Run giữ nguyên revision cũ phục vụ traffic. Không ai được báo.

APC (`ai-product-copy`) đứng im 14 ngày kiểu này: mọi service serve revision **2026-07-30**, phát
hiện 2026-08-13. `spec.traffic latestRevision=true 100%` vẫn hiển thị bình thường — nhìn config
không thấy gì sai, phải nhìn `status.traffic[0].revisionName`.

```bash
gcloud run services describe <fn> --project=<proj> --region=us-central1 \
  --format='value(status.traffic[0].revisionName)'
gcloud run revisions list --service=<fn> --project=<proj> --region=us-central1 \
  --format='table(name,creationTimestamp,active)' --limit=5
```

Revision fail: `status.conditions` → `reason: HealthCheckContainerError`. Lý do thật nằm trong
`gcloud logging read` với `resource.labels.revision_name=<revision>`.

**Nguyên nhân hay gặp nhất: dep khai sai workspace.** `firebase.json` deploy
`"source": "packages/functions"`, nên dep khai ở **root** `package.json` không đi kèm bundle —
local chạy ngon nhờ yarn workspace hoist, prod `Cannot find module`. Vì `src/index.js` là entry
duy nhất của mọi function, một module thiếu giết **toàn bộ** backend chứ không riêng route đó.

Audit: đi require-graph từ `src/index.js`, so mọi bare import với
`packages/functions/package.json`. APC ra 5 thiếu (`cors`, `jsonwebtoken` không khai ở đâu cả;
`koa2-swagger-ui`, `swagger-jsdoc`, `p-limit` khai ở root). Chạy lại được cho app khác nguyên xi.

AEO là **Gen1** → không có Cloud Run service, không dính kiểu freeze này.

Liên quan: [[firestore-409-index-noop]], [[seo-env-avada-seo-local-override]]
