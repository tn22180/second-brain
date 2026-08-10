---
name: seo-recursive-hang-leaks-active-slots
description: Gen1 worker-sdk không enforce job timeout → recursive handler treo pin slot BullMQ active mãi; Gen2 runWithTimeout mới fix.
metadata: 
  node_type: memory
  type: project
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-10T03:04:47.450Z
---

Trên prod SEO worker fleet (Gen1 image `@minhdevtree/worker-sdk`), 1 recursive handler
invocation có thể **treo vĩnh viễn**: kẹt trong 1 `await` Shopify/Firestore/graphql không
timeout. BullMQ renew lock bằng **timer riêng độc lập tiến độ handler** → lock luôn tươi
(TTL ~25s) → job pin `bull:worker-<tier>:active` mãi. Config `recursive.timeout: 540000`
(9 phút, `worker.config.yml`) **không được Gen1 sdk enforce** nên hang không auto-fail;
stalled-recovery cũng không đòi vì lock chưa hết hạn.

**Dấu hiệu chẩn đoán:** job id nằm `active` nhiều giờ/ngày (processedOn cũ, không đổi) +
lock TTL vẫn tươi + **0 log line 30 phút** cho id đó ở mọi worker. Đó = treo, KHÔNG phải
long-running khỏe. (Ca 2026-08-10: 6 recursive treo 8h–62h, 1 worker token ôm 4 → 4/5
slot medium chết.) recursive self-chain khỏe vẫn chạy song song — shop không đứng hẳn,
6 id treo là stub cha chết, drop khỏi active an toàn.

**Impact fleet:** mỗi hang leak vĩnh viễn 1 concurrency slot đến khi restart worker →
saturate dần, rò rỉ thầm lặng (không phải throughput). Phụ: recursive config `tier=heavy`
nhưng Gen1 route sang `medium` (`heavy:active=0`).

**Fix gốc = Gen2 re-image:** `packages/functions/worker.mjs` bọc handler bằng
`runWithTimeout`/abort, enforce 540s → hang auto-fail lúc 9 phút. Đây là lý do reliability
của migration, ngoài telemetry. Xoá tay: LREM id khỏi `:active` + DEL `:lock` + hash + `:logs`
(prod db0 write, cần confirm). Kick lại sạch: [[resume-stuck-job]]. Liên quan
[[seo-prod-error-slack-pipeline]] (recursive count timeout từng gây failed spike job 18).
