---
name: harness-graph-verify-pitfalls
description: Graph verify trên seo/blogs — đừng dùng jest --findRelatedTests; Codex hay "sửa" test đỏ sẵn trên master và test mở socket.
metadata:
  type: feedback
---

`jest --findRelatedTests` chết ở bước config trên seo (`require` động `@assets/locale/translations/${locale}.json`) → node block 5 vòng dù code đúng (2026-10-15). Trên blogs nó chạy nhưng kéo theo hàng trăm test liên quan → gặp suite đỏ sẵn.
Dùng verify: jest theo thư mục của file đổi + `--testPathIgnorePatterns` các suite đỏ sẵn.

Codex sandbox (workspace-write) không mở được socket → nó viết lại `gdprService.test.js` (HMAC qua http server), và "sửa" test đỏ sẵn trên master (themeExtensionSchemaGuards, subscribeSaveAltVersion.covers, ellisAttack A6), có lần xoá luôn file pricing chết.

**Why:** diff security bị lẫn thay đổi ngoài scope; test đỏ sẵn bị đổi expectation là che lỗi thật.
**How to apply:** review graph diff bằng `--stat` trước, revert test/file ngoài scope về origin/master, rồi chạy lại cùng suite trên worktree master sạch để chứng minh "đỏ sẵn". Xem [[agent-harness-graph-learn]], [[codex-astra-codes]].
