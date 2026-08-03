---
name: no-file-dumps-in-reply
description: "Đừng dán nội dung HTML/Markdown đã ghi ra file vào reply — chỉ path, URL, kết quả test."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 81dc84d4-69a7-45f4-967d-77cfd084de38
  modified: 2026-08-03T03:25:14.389Z
---

Khi đã Write/Edit một file (HTML, Markdown, deck, doc), **không dán lại nội dung file đó vào
câu trả lời**. Chỉ đưa: đường dẫn file, URL nếu đã publish, và output verification thật.

**Why:** Tony dính rate limit liên tục và `/resume` là lệnh dùng nhiều nhất của anh
([[user-profile]]). File đã nằm trên đĩa rồi — dán lại là trả tiền token hai lần cho cùng
một nội dung, và đẩy context window tới giới hạn nhanh hơn. Nêu ngày 2026-08-03 sau khi
dựng deck training.

**How to apply:** Sau khi ghi file, báo `path`, cái gì đã đổi, và output lệnh test. Trích
tối đa vài dòng khi *bắt buộc* phải chỉ ra một chỗ cụ thể — không bao giờ trích cả block.
Áp cho cả file mới ghi lẫn file đọc lên để review. Cùng tinh thần với luật "numbers over
adjectives" trong `~/.claude/CLAUDE.md`.
