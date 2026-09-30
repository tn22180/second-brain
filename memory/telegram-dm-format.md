---
name: telegram-dm-format
description: Mọi DM Telegram gửi Tuan phải ngắn, dòng đầu là title chung của session in đậm (HTML parse_mode)
metadata:
  type: feedback
---

DM Telegram (bot Hermes, chat 1178722633) phải ngắn: dòng 1 = **title chung cho session** in đậm, rồi 1–2 dòng nội dung.

**Why:** Tuan đọc trên điện thoại, nhiều session bắn cùng lúc; title đậm giúp nhìn ra ngay tin thuộc việc nào (2026-09-30).

**How to apply:** Gửi qua Bot API với `parse_mode=HTML`, `<b>title</b>` + escape phần thân (`hermes send` không có parse mode). Title: `repo · branch` (mr_notify.py), contract id bỏ hậu tố `-tN` (agent-harness notify.ts), `loop-health` (loop_health.py). Notifier mới phải theo cùng format. Liên quan [[personal-loop-health]], [[agent-autonomy-mr-not-merge]].
