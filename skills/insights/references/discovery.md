> Chế độ của skill `insights`. File này tự đủ — đọc xong là làm được.

# Discovery digest — chuẩn bị insight trước buổi Discovery

Gom tín hiệu rời rạc thành 1 bản digest để buổi Discovery (SF1) bàn trên dữ liệu, không bằng trí nhớ. **AI tổng hợp; PO vẫn quyết ý tưởng nào đáng làm.**

## Nguồn tín hiệu
- Review App Store (ưu tiên 1-2 sao gần nhất) — dùng agent `researcher`.
- Ticket Support / feedback — dùng agent `product-analyst` (hoặc [chế độ tickets](tickets.md) nếu đã có).
- Động thái đối thủ, xu hướng — agent `researcher`, skill `/deep-research`.

## Các bước
1. Thu thập tín hiệu từ các nguồn trên (theo app hoặc theo chủ đề PO chỉ định).
2. **Cụm theo vấn đề** (không liệt kê thô) — gộp các phàn nàn/mong muốn giống nhau.
3. **Xếp theo tần suất / mức đau**.
4. Mỗi cụm gắn: app bị ảnh hưởng · metric mục tiêu gợi ý · nguồn (link review/ticket).
5. Đối chiếu nhanh với backlog/roadmap để đánh dấu "đã có / trùng".

## Output
```markdown
## DISCOVERY DIGEST — [ngày]
### Cụm 1: [vấn đề] — [n] tín hiệu
- App: … · Metric gợi ý: … · Nguồn: …
- Trạng thái backlog: mới / trùng [task]
### Cụm 2: …
```

## Gate
- Chỉ **tổng hợp & xếp hạng**; không tự tạo task. PO chốt ở buổi Discovery.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
