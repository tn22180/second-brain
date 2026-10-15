---
name: telegram-notify-only
description: Telegram chỉ để BÁO, không xử lý reply — Tuan điều khiển session Claude từ Orca trên điện thoại
metadata:
  type: feedback
---

Telegram DM chỉ một chiều (báo). Không build đường reply → session (plugin cc-reply đã gỡ 2026-09-30).

**Why:** Tuan có Orca trên điện thoại, điều khiển session trực tiếp ở đó.

**How to apply:** Đừng đề xuất lại reply-to-resume/Channels chung. Ngoại lệ Tuan tự yêu cầu 2026-10-15: lệnh `/cc` qua Hermes cho session dở ([[cc-pending]]) — lệnh tất định, không phải reply tự do. Format tin theo [[telegram-dm-format]].
