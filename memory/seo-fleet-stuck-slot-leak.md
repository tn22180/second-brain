---
name: seo-fleet-stuck-slot-leak
description: Worker heartbeat xanh nhưng không nhận việc = job treo chiếm hết BullMQ concurrency slot; nhìn tuổi job trong bull:worker-<tier>:active, không nhìn worker:active
metadata:
  type: project
---

2026-09-14: `central-leader` ngừng hoàn thành job ~10h trong khi heartbeat, `/health`, `docker ps`
đều xanh. 10 job `recursive` nằm trong `bull:worker-light:active` 10–19h, lock vẫn được gia hạn →
đầy 10/10 slot light. `worker:active` = 0 vì reaper trong `worker.mjs` đã trả budget — dashboard
vì thế nói "rảnh".

**Why:** `worker-sdk@0.5.7` `JobExecutor.run` timeout chỉ `ac.abort()`, không reject; handler
legacy bỏ qua `signal`. Trigger là Firestore gRPC trên central `DEADLINE_EXCEEDED … Waiting for LB pick`.

**How to apply:** Khi nghi "worker chết": kiểm `processedOn` của các job trong `bull:worker-*:active`
(cùng 1 lock token = cùng 1 process) trước khi tin heartbeat. Cứu nhanh = `docker restart` container
đó (job stalled được pick lại trong ~1 phút). Fix: seo !2271 (guard reject trong wrapper) +
worker-sdk MR !1 trên git.avada.net (executor reject sau grace 5s) → publish 0.5.8 rồi bump seo.
Còn mở: Firestore `preferRest: true` (84 `new Firestore()`), và fleet-control nên hiển thị tuổi job
active theo tier. Liên quan: [[fleet-control-queues-down-semantics]], [[seo-worker-memory-measured]].
