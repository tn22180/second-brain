> Chế độ của skill `check-dor`. File này tự đủ — đọc xong là làm được.

# DoR — soát "Sẵn sàng làm" trước khi giao Dev

Soát PRD theo cổng DoR của Master Flow (`workflows/master-flow.md`) (mục 6). **AI báo thiếu; PO chốt & bổ sung.** Dùng agent `qa-reviewer`.

## Checklist DoR
- [ ] Rõ vấn đề & khách hàng nào
- [ ] Có user story
- [ ] Có tiêu chí nghiệm thu
- [ ] Đã hỏi Dev/Tech Lead về ràng buộc kỹ thuật
- [ ] Có hướng giao diện
- [ ] Đã đặt con số mục tiêu (metric)

## Các bước
1. Đọc PRD/tài liệu tính năng.
2. Chấm **từng mục** trên: ĐẠT / THIẾU (nêu cụ thể thiếu gì).
3. Kết luận: **Sẵn sàng giao Dev** hay **Cần bổ sung [danh sách]**.

## Output
```markdown
## CHECK DoR — [tính năng]
- Vấn đề & khách: ✅ / ❌ (…)
- User story: … | AC: … | Ràng buộc kỹ thuật: … | Hướng UI: … | Metric: …
→ KẾT LUẬN: Sẵn sàng / Cần bổ sung: [x, y]
```

## Gate
- Chỉ **đề xuất**; không tự sửa PRD. PO quyết bổ sung rồi mới giao Dev.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
