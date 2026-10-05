---
name: reply-slack-thread-on-done
description: Khi fix bug từ thread Slack support, xong phần nào (MR mở / đã merge) thì tự reply vào thread gốc luôn, không chờ hỏi.
metadata:
  type: feedback
---

Fix bug lấy từ thread Slack (seo-suite-support G01N5G8D562, blog-support C08928RK00H): xong mỗi phần là reply ngay vào thread đó: link MR, nguyên nhân 1 dòng, khách có cần làm gì không, trạng thái deploy (merge ≠ prod, cần cắt tag).

**Why:** Tuan dặn 2026-10-05 "nhớ xong phần nào reply luôn vào thread giúp t"; CS theo dõi ngay trong thread, không đọc MR.

**How to apply:** post bằng bot token qua `createSlack(...).post` của falcon-fix-bot (`~/Projects/falcon-fix-bot/src/slack.js`, truyền `env: {}` để tắt TEST_MODE/DRY_RUN); viết bình thường, không caveman. Chỉ reply thread mình làm; thread người khác đã fix thì để họ báo. Liên quan [[telegram-notify-only]].
