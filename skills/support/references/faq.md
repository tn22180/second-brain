> Chế độ của skill `support`. File này tự đủ — đọc xong là làm được.

# Support FAQ — câu hỏi thường gặp + trả lời mẫu (SF5)

Từ 1 tính năng, dựng bộ FAQ + canned response để Support dùng lại. **AI dựng nháp; Support/PO duyệt trước khi dùng với khách.**

## Input
- Tính năng + support pack (nếu có) + ticket thường gặp (nếu có).

## Các bước
1. Liệt kê câu hỏi khách hay hỏi về tính năng (từ cách dùng, hạn chế, lỗi thường gặp).
2. Mỗi câu → 1 câu trả lời mẫu ngắn gọn, giọng thân thiện, kèm bước xử lý nếu cần.
3. Đánh dấu câu nào nên **escalate** thay vì trả lời tay.

## Output
```markdown
## FAQ — [tính năng]
**Q:** … → **A:** … (escalate? ✅/❌)
```

## Gate
- Câu trả lời mẫu **phải người duyệt** trước khi dùng chính thức với khách.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
