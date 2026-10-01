---
name: autofix-absence-evidence-retro
description: "Vòng Level-7 đầu tiên (2026-10-01) — autofix verify loại nhầm bằng chứng phủ định matched:0; đã vá, đo lại bằng harness/retro_autofix.py sau 1 tuần chạy daemon mới."
metadata:
  node_type: memory
  type: project
  originSessionId: 3e0fb477-5640-4bbb-b4b1-2a1ccd55d643
  modified: 2026-10-01T06:58:34.174Z
---

Audit 7-Level (2026-10-01) chấm Tuan 6.5; thiếu 7b/7c, tức vá có số đo trước/sau. Chọn phương án B: retro dựa trên lỗi đo được.

Lỗi được chọn: ANALYZE của prod-error-autofix có 72/464 alert (16%) phải chạy round 2. Lý do bị loại nhiều nhất là "query matched nothing" (64 lần), và 52 trong số đó là model khai thật `matched: 0`, kiểu "no 5xx in window". Re-run gcloud xác nhận query đúng, cửa sổ log rỗng thật.

Vá `src/agent/verify.ts`: `matched: 0` được kiểm như bằng chứng vắng mặt; analysis chỉ toàn bằng chứng vắng mặt thì bị loại. Số nền nằm ở `jobs/retro/2026-10-01-autofix.md`.

**Why:** đây là cặp số trước/sau đầu tiên (7c). Không đo lại thì vòng không khép.
**How to apply:** daemon `com.tn22180.prod-error-autofix` đã restart với patch (commit 31a2fb0) lúc 2026-10-01T07:00:45Z. Từ 2026-10-08 chạy `python3 harness/retro_autofix.py --since 2026-10-01T07:01 --until 2026-10-08`, so với 16% và mốc 64 lần "matched nothing". Liên quan [[agent-harness-graph-learn]].
