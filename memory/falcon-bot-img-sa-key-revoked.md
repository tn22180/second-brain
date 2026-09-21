---
name: falcon-bot-img-sa-key-revoked
description: SA key image-optimizer trong falcon-bug-fix-agent/secrets đã bị xoá khỏi GCP → mọi truy vấn prod của app đó trả UNAUTHENTICATED.
metadata:
  type: project
---

`falcon-bug-fix-agent/secrets/sa/image-optimizer-prod-sa.json` mang key id `f7b48da0…` của
`firebase-adminsdk-r606f@app-plaza-image-optimizer.iam.gserviceaccount.com`. Key đó **không
còn** trong `gcloud iam service-accounts keys list` (còn 3 key: 2 cái 2026-04-02 hết hạn
2027-04-02, 1 cái `b8a7eed5…` tạo 2026-08-25 không hết hạn).

Triệu chứng: `tools/fs-query.js --app image-optimizer <bất kỳ>` →
`16 UNAUTHENTICATED: Request had invalid authentication credentials`.

**Why:** bot mất toàn bộ evidence prod của image-optimizer — diagnose app đó sẽ chạy mù mà
section chỉ báo MISSING, không ai để ý.

**How to apply:** thay file secret bằng key `b8a7eed5…` (hoặc phát key mới), rồi đẩy qua
GitLab CI/CD variable theo `push-env.sh` — xem [[falcon-fix-bot-mac-runtime]]. 4 app kia đọc
bình thường.
