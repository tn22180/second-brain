---
name: seo-worker-memory-measured
description: "seo worker memoryMb là bản copy GCF, không phải RSS đo được — thực tế nhỏ hơn 2–8x; số đo 2026-08-27 và cách lấy lại."
metadata: 
  node_type: memory
  type: reference
  originSessionId: d30877df-36aa-441d-a8dc-e686dfc6580b
  modified: 2026-08-27T10:28:50.296Z
---

`memoryMb` trong `seo` `packages/functions/worker.config.yml` được chép từ `memory:` của Cloud
Functions. Trên GCF đó là núm provisioning, tính tiền theo 100ms thực dùng; trên fleet nó là
**reservation bin-packing cứng** — worker.mjs chỉ nhận job khi
`sum(running memoryMb) + job.memoryMb <= budget`. Chép sang là khoá RAM không ai đụng.

Budget thật ở prod là **5190MB/replica** (không phải 4096 trong file — env `MEMORY_BUDGET_MB` đè).
Ở mức đó **không tier nào chạm nổi cap `concurrency`** của nó: heavy 2→1, medium 5→2, light 10→5.
Config concurrency phần lớn là trang trí; nâng nó lên chỉ thêm requeue churn.

**Số đo 2026-08-27** — 581 solo window, fleet 6 replica (`seo-worker:2555bb4c`). `peak` = cgroup
`anon` toàn container, `marginal` = phần job cộng thêm trên idle floor:

| job | khai | peak | marginal | n |
|---|---|---|---|---|
| recursive | 4096 | 499 | 247 | 404 |
| bulkAuditFixProduct | 2048 | 562 | 308 | 75 |
| optimizeImageV2 | 1024 | 553 | 299 | 44 |
| handleManualOptimizeImage | 2048 | 465 | 213 | 29 |
| optimizeImage | 2048 | 365 | 95 | 13 |
| fixAuditContent | 1024 | 551 | 297 | 10 |
| optimizeStore | 2048 | 519 | 267 | 6 |

`peak - marginal` = **250–255MB trên mọi worker, mọi job** → đó là baseline Node, không phải chi phí
job. Chi phí thật của một job là 95–308MB.

Lấy lại số: `metrics:rss:<job>` trong redis prod (`redis-cli -p 6380`, hash field = WORKER_ID, value
`peak:marginal:n`, TTL 30 ngày), hoặc `node packages/functions/scripts/report-job-memory.js`.
Sampler chỉ tính window job chạy **một mình**, nên mẫu thiên về lúc fleet vắng.

**`scanIssues` và `handleSpeedupBackground` chưa có mẫu nào** — cả hai spawn Chrome làm process con
và `docs/worker-memory-model.md` ghi scanIssues ≈ 0.8–1.5GiB, gấp ~3 mọi thứ đo được. Đừng hạ hai
thằng này theo bảng trên. Chúng cũng giữ `max(job.memoryMb)` = 4096 nên invariant budget và vòng
clamp replica trong `install.sh` không đổi.

Sửa một `memoryMb` là phải sửa **cả ba**: `worker.config.yml`, `JOB_MEM` trong `spillPolicy.js`, và
`tier` nếu vượt band (`tierMemoryBand.test.js` + `workerConfigDrift.test.js` bắt cả hai).

Liên quan: [[seo-fleet-gcf-spill]], [[seo-gen2-follower-fleet-deploy]], [[fleet-control-queues-down-semantics]].
