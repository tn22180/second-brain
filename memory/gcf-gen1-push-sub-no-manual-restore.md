---
name: gcf-gen1-push-sub-no-manual-restore
description: Tách push subscription của hàm Gen1 (đổi sang pull) thì KHÔNG gắn lại tay được — phải redeploy hàm; dùng làm kill switch là tắt hẳn tới lần deploy sau.
metadata:
  node_type: memory
  type: reference
  originSessionId: 792ef6eb-6a19-45c7-bfea-6329f77b5de3
  modified: 2026-09-29T03:24:36.793Z
---

Endpoint `…appspot.com/_ah/push-handlers/pubsub/…` của Gen1 do GCF quản lý. `modify-push-config --push-endpoint=<url cũ>` trả `INVALID_ARGUMENT: The supplied AppEngine URL project does not match the subscription's parent project`. Chỉ `firebase deploy --only functions:<fn>` tạo lại được.

Đã dùng 2026-09-25 để dừng rescan AEO bị nhân chain (`gcf-aeoAuditRescanSubscriber-us-central1-aeoAuditRescan`, `seo-on-aeo`). Ghi `scan.status=failed` vào Firestore thua race (124 lần ghi / 15 phút) vì chain kế tiếp đọc doc chưa tới 1s sau khi chain trước ghi. Fix: AEO MR !140 (runId+seq claim).

**How to apply:** muốn chặn một self-chaining Pub/Sub job đang chạy loạn thì dùng cách này, nhưng báo trước là cả topic sẽ tắt tới khi deploy. Job tự chain mà message không có run id/cursor thì sẽ nhân bản khi Pub/Sub giao trùng; kiểm tra điều này ở mọi app (xem [[seo-fleet-stuck-slot-leak]]).
