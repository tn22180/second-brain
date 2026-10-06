---
name: gcloud-sa-config-no-reauth
description: "gcloud config `sa` was tony-cli SA (09-29) to dodge Workspace reauth — BROKEN 2026-10-06: `sa` now holds the user account, reauth fails again; ~/.openclaw/firebase-sa.json (ADC) also missing."
metadata:
  node_type: memory
  type: reference
  originSessionId: 71d6bb5d-36b7-4a9c-9e0d-414bbdffc0fa
  modified: 2026-09-29T09:37:15.946Z
---

User account `tuannv@avadagroup.com` hết phiên định kỳ vì **Workspace reauth policy** (Google Cloud session control) → mọi lệnh non-interactive chết với `Reauthentication failed. cannot prompt during non-interactive execution` (202 lần trong ~/.config/gcloud/logs tới 2026-09-29). Không phải lỗi gcloud.

Fix 2026-09-29: gcloud configuration `sa` = `tony-cli@avada-seo.iam.gserviceaccount.com`, project `avada-seo`, **đang ACTIVE**. Config `default` = user account, vẫn còn.

- Đã test OK bằng SA: `bq` (billing report 2026-09-28 render xong), `gcloud logging read` + Firestore REST read trên cả 5 prod: avada-seo, avada-blog-app, ai-product-copy, seo-on-aeo, app-plaza-image-optimizer.
- Binding cấp project `avada-seo` chỉ là `roles/viewer`; quyền đọc 4 project kia đến từ chỗ khác (chưa xác định folder/org hay grant riêng).
- **Read-only.** Ghi Firestore / IAM / deploy → `gcloud --configuration=default ...` hoặc `gcloud config configurations activate default` (cần `gcloud auth login` khi hết phiên).
- Impersonation (`auth/impersonate_service_account`) KHÔNG cứu được: vẫn cần token user → vẫn dính reauth.
- ADC (`GOOGLE_APPLICATION_CREDENTIALS` → `~/.openclaw/firebase-sa.json`) tách biệt; gcloud/bq không đọc biến này.
- Fix triệt để = Workspace admin đổi Google Cloud session control (Never require reauth / exempt trusted apps) — policy toàn domain.

**2026-10-06 — đã hỏng:** `gcloud config configurations list` cho thấy `sa` ACCOUNT = `tuannv@avadagroup.com` (không còn tony-cli) → `gcloud --configuration=sa logging read` chết reauth. File ADC `~/.openclaw/firebase-sa.json` không tồn tại nhưng shell vẫn export `GOOGLE_APPLICATION_CREDENTIALS` tới nó → test jest init firebase-admin fail (workaround `env -u GOOGLE_APPLICATION_CREDENTIALS`). Bot SA `firebase-adminsdk-5luw0@avada-blog-app` (falcon-fix-bot secrets) KHÔNG có quyền logging. Cần re-set `sa` về key tony-cli.

**How to apply:** lỗi reauth → check `gcloud config configurations list` trước khi bảo user login. PERMISSION_DENIED trên lệnh ghi → đang ở `sa`, chuyển `default`. Key SA không hết hạn → giữ quyền tối thiểu (xem [[seo-worker-box-credential-surface]]).
