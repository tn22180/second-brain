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

Lỗi được chọn: ANALYZE của prod-error-autofix có 17/109 alert (16%) phải chạy round 2 (số đã khử trùng symlink 10-08; bản đầu ghi 72/464, 64, 52 là sai). "query matched nothing" bị loại 17 lần, 13 trong số đó là model khai thật `matched: 0`, kiểu "no 5xx in window". Re-run gcloud xác nhận query đúng, cửa sổ log rỗng thật.

Vá `src/agent/verify.ts`: `matched: 0` được kiểm như bằng chứng vắng mặt; analysis chỉ toàn bằng chứng vắng mặt thì bị loại. Số nền nằm ở `jobs/retro/2026-10-01-autofix.md`.

**Why:** đây là cặp số trước/sau đầu tiên (7c). Không đo lại thì vòng không khép.
**How to apply:** daemon `com.tn22180.prod-error-autofix` đã restart với patch (commit 31a2fb0) lúc 2026-10-01T07:00:45Z. Từ 2026-10-08 chạy `python3 harness/retro_autofix.py --since 2026-10-01T07:01 --until 2026-10-08`, so với 16% và mốc 15,6 "matched nothing"/100 alert.

Đo 10-08 (n=22): round 2 14%, matched nothing 4,5/100, loại nhầm absence 0 → `jobs/retro/2026-10-08-autofix.md`. Mẫu nhỏ; đo lại 10-15.

Vòng 2 (10-08, 31eb13e, Codex code): "schema 18" thật ra là 6 lần bị loại; 4/6 là JSON hợp lệ bị `extractJson` parse hỏng (brace trong string, fragment thắng fenced) → vá string-aware scan. Daemon restart 2026-10-08T04:02Z. Đo 10-15 cả 2 bản vá; nền schema 6/109. Liên quan [[agent-harness-graph-learn]].
