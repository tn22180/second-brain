---
name: seo-prod-deploy-by-tag
description: "seo prod deploy chạy theo TAG, không theo merge master — pipeline master chỉ có docs_gate"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-20T00:00:00.000Z
---

**Merge vào `master` KHÔNG deploy prod.** Pipeline trên master chỉ render đúng **1 job: `docs_gate`**
(kiểm 2026-08-20, pipeline 208894 và 208960). Deploy chạy khi **cắt tag**: `deploy_worker` là
`only: - tags` (`.gitlab-ci.yml:122`), `deploy_production` cùng điều kiện. Comment ở `:96-97` nói rõ
*"The old master + [deploy-worker] title gate is gone."* — [[seo-master-no-detect-worker]] đã lỗi thời
ở phần cơ chế trigger.

Marker `[deploy-only]` / `[deploy-changed]` trong commit title giờ là **điều kiện loại trừ / chọn
lọc trên tag**, không phải cách bật deploy từ master.

Hệ quả hay đánh lừa: sau khi merge, `status.traffic[0].revisionName` không đổi và pipeline vẫn xanh.
Đó **không phải** [[gen2-deploy-silent-freeze]] — đơn giản là chưa có deploy nào chạy. Phân biệt bằng
cách liệt kê job của pipeline: chỉ thấy `docs_gate` nghĩa là chưa deploy; thấy `deploy_production`
mà revision vẫn cũ mới là freeze thật.

Xác nhận 2026-08-20: `v1.85.78` (`ea81ff9d`) → pipeline 208961 → `deploy_worker success`,
`deploy_production running` → 5 function AI nhận revision mới trong 7 phút.
`v1.85.76` (`a512634a`) hôm trước cũng vậy.
