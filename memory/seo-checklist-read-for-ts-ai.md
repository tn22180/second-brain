---
name: seo-checklist-read-for-ts-ai
description: seo checklist read cho TS AI đã có từ v1.86.2 — /api/seo-score qua internal key; /api/seo-issues là GET-ghi lọt internalKeyAudits
metadata:
  node_type: memory
  type: project
  originSessionId: 591d4bd9-a7d5-4214-8e6e-e629ad3c4a08
  modified: 2026-09-29T03:25:01.392Z
---

CS xin "endpoint đọc checklist" 2026-09-29 → không cần build: `GET /api/seo-score?types=` (getSeoScore, buildChecklistPayload, có `pages[]`, `lastScanAt`, `scanned:false` khi chưa scan) đã lên prod từ v1.86.2. TS AI gọi bằng JWT từ `/proxy/internal-token` (swaggerAuth chấp nhận `decoded.internal`).

`/internal/seo-checklist` trên internalGen2 trả payload giống hệt nhưng auth bằng `INTERNAL_REDIS_TOKEN` tĩnh dùng chung, không actor/ticket — không đưa TS AI dùng.

`GET /api/seo-issues` = dispatch rescan + ghi `scanning:true`; vì là GET nên swaggerAuth (chỉ audit non-GET) không ghi internalKeyAudits. Doc sửa ở MR !2327 (chỉ swagger); đổi sang POST chưa có ticket.

**Why:** brief CS tưởng thiếu API vì chỉ nhìn FE + /dev routes; suýt build trùng.
**How to apply:** yêu cầu "đọc X cho TS AI" ở seo → grep `docs/*.yaml` + `routes/api.js` trước. Liên quan [[check-master-before-building]], [[ts-ai-internal-support-key]].
