---
name: seo-fleet-idle-is-gate2
description: "Worker fleet trông rảnh KHÔNG phải thiếu việc hay nghẽn admission — do Gate 2: <2,4% shop bật, fleet chỉ nhận 35% dispatch. Kèm cách đo throughput/utilization thật."
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-09T10:43:06.393Z
  originSessionId: d30877df-36aa-441d-a8dc-e686dfc6580b
---

Đo 8 ngày tới 2026-09-09: **22.272 job, đúng 1 lỗi, 181/192 giờ có việc (94%)**. Fleet không hề
rảnh kinh niên. Nhưng chiếm dụng chỉ **4% trên 36 slot song song** (24% nếu tính 1 job/replica), và
`bull:*:wait = 0` ở cả ba tier — **hàng đợi rỗng, không phải nghẽn admission**.

**Nguyên nhân thật là Gate 2.** Trên 248.366 shop, số bật fleet: `optimizeImage`/`optimizeImageV2`
5.843 (2,4%), `recursive` 4.763, `handleManualOptimizeImage` 1.220, `scanIssues` 595,
`bulkAuditFixProduct` 594. Trong 5.855 shop đã bật ít nhất 1 job, ~80% chỉ bật 2–3 job
(`optimizeImage, optimizeImageV2, recursive`), một nhóm 11 job, chỉ số ít có đủ 23.
Đối chiếu Pub/Sub vs fleet: **~40.900 chạy GCF, 22.272 chạy fleet — fleet chỉ nhận 35%.**

Hai tập này **loại trừ nhau**, trừ được: `dispatchWork` mọi nhánh đều `return` hoặc `publishTopic`
hoặc `dispatchJob`, và `subscribeRecursive.js` gọi `dispatchWork(` 12 lần, `publishTopic(` 0 lần —
chuỗi tự nối cũng qua gate.

**Đừng cắt replica.** Nhu cầu đỉnh chỉ **8,8 slot** (p99 5,5 · p95 3,8 · p50 1,2) trên 181 giờ.
Nhưng box là phần cứng đã mua, để không không tốn gì; cắt chỉ mất dự phòng. Cẩn thận với "giờ
nhiều job nhất" — giờ 1809 job là `handleManualOptimizeImage` 8s/job = 4,1 slot, KHÔNG phải giờ
căng nhất. Phải nhân số job với thời lượng trung bình của **đúng job đó**.

Lý do đẩy việc xuống fleet **không phải tiền**: Cloud Run Functions $256/8 ngày (~$960/tháng) nhưng
tiền nằm ở `handleHookSubscriberGen2` $43, `speed-audit-multi-worker` $27, `proxyGen2` $26,
`apiGen2` $24 — HTTP/webhook, không chuyển được. Toàn bộ subscriber của migrated topic chỉ ~$31/8
ngày. `resolveAllRedirects` 194.858 message nhưng chỉ $3,97 — to về lượng, bé về tiền.
**Lý do thật là timeout**: `bulkAuditFixProduct` p90 333s, `recursive` p90 146s, `fixAuditContent`
p90 151s — GCF có trần, fleet không.

**Cách lấy lại số** (Redis prod đòi AUTH; password KHÔNG nằm trong `/proc/1/cmdline` của container
redis vì redis-server tự viết lại argv thành `redis-server *:6379`). Chạy node ngay trong worker
container, nó có sẵn `REDIS_PASSWORD` trong env và ioredis ở `/app`:
`ssh avada@100.87.235.36 'docker exec -i -w /app seo-worker-gen2-central-leader node --input-type=module' <<'JS' ... JS`
Dữ liệu: `metrics:jobs:<YYYYMMDDHH>` hash `{job: n, _total: n}` (throughput theo giờ),
`worker:history:<id>` list 50 job gần nhất `{name,ms,at,ok,shopId}` (thời lượng + tập trung theo
shop), `metrics:rss:<job>` (`peak:marginal:n`). **Dùng SCAN, không KEYS** — db0 prod.

Tải dồn rất lệch: top 2 shop chiếm **59,5%** worker-giây, top 5 chiếm 67,8% trên 268 shop.

Liên quan: [[seo-worker-memory-measured]], [[seo-fleet-gcf-spill]],
[[seo-worker-box-credential-surface]], [[seo-prod-deploy-by-tag]].
