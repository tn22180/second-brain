---
name: slack-reply-as-personal
description: "Claude Code session post Slack bằng tài khoản cá nhân (PERSONAL_SLACK_TOKEN), không bằng bot; tool tự động (falcon-fix-bot…) vẫn dùng bot"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 52b0872e-0b7f-49bb-984f-ccb075a4c7e8
  modified: 2026-10-06T07:39:44.336Z
---

Khi Claude Code (session tương tác) reply/post Slack thay Tuan → dùng user token cá nhân `PERSONAL_SLACK_TOKEN` (xoxp, user `tuannv087` / U04RG72DHCH) trong `/Users/nguyentuan/Documents/second-brain/.env` (gitignored, chmod 600). Đọc token trong process (node fs → `Authorization: Bearer`), không đưa lên command line. Gọi `chat.postMessage` với `thread_ts`, rồi `chat.getPermalink` để báo link.

Ngoại lệ: tool/pipeline tự động (falcon-fix-bot, mr_notify, loop…) giữ bot token như cũ.

**Why:** Tuan muốn tin trong thread support hiện tên anh, không phải "Falcon Fix Bot" (2026-10-06, thread FAL-1041).
**How to apply:** vẫn soạn nháp + đọc lại thread mới nhất trước khi gửi; gửi dưới tên anh là thao tác ra ngoài. `slk` (desktop session) không dùng được trên máy này — Keychain không có Slack Safe Storage key. Liên quan [[telegram-notify-only]].
