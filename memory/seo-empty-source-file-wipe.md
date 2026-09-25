---
name: seo-empty-source-file-wipe
description: "seo optimizeImg ghi source 0 byte lên Shopify khi tải ảnh gốc 404 → file merchant mất image, preview FAILED; tái hiện trên dev store 2026-09-25"
metadata:
  node_type: memory
  type: project
  originSessionId: 52b0872e-0b7f-49bb-984f-ccb075a4c7e8
  modified: 2026-09-25T03:01:15.506Z
---

Luồng loop `fileImageService.optimizeImg` (V25 cloud-run loop, KHÔNG phải bulk-apply): ảnh gốc 404 → `sharp.js` trả `destBuffer: undefined` → `uploadImageFromBuffer` gọi `file.save(undefined)` (GCS lib 6.12 ghi object **0 byte, content-type theo đuôi**, không throw) → `handleUpdateFile` vẫn gọi `fileUpdate(originalSource)`. Shopify chấp nhận (userErrors rỗng, `fileStatus` vẫn READY) nhưng file mất `image`, preview FAILED; `originalSource` giữ bytes cũ. Mã lỗi theo content-type: `image/jpeg` rỗng → `INVALID_IMAGE_FILE_SIZE` ("too large 20mb" — message sai), octet-stream → `UNSUPPORTED_IMAGE_FILE_TYPE`.

Case gốc: kunstundspiel (SEO-260923-YhMfLQ), 1.836/22.896 file hỏng; 404 vì URL trong bulk export cũ hơn lần rename. Prod `tempV2/` có 104 object 0 byte / 20 shop trong 09-16→09-24 → đang xảy ra fleet-wide.

Fix: worktree `seo-wt-empty-upload`, branch `fix/SEO-260923-empty-source-file-update` → commit `cacab12f71d`, MR !2314 (2026-09-25, chưa merge).

**Why:** file "READY nhưng không có image" trông như lỗi Shopify, dễ đổ cho merchant/Shopify; thật ra do app.
**How to apply:** ticket "ảnh biến mất / Files báo lỗi 20mb" ở app seo → nghĩ tới bug này trước; check `mediaErrors` + `image==null` + history log `unoptimized` 404. Bytes gốc còn nguyên → khôi phục được bằng re-upload. Liên quan [[seo-prod-deploy-by-tag]].
