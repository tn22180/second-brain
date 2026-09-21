> Chế độ của skill `insights`. File này tự đủ — đọc xong là làm được.

# Ticket digest — insight sau live cho PO (SF5)

Biến ticket/feedback thô thành insight cho PO. Dùng agent `product-analyst`. **AI tổng hợp; PO quyết hướng đi tiếp.**

## Input
- Ticket + feedback (khoảng thời gian, vd 30 ngày sau khi lên tính năng).
- (nếu có) mục tiêu tính năng đã đặt ở Discovery.

## Các bước
1. **Cụm theo chủ đề** (không liệt kê thô).
2. Đo **sentiment** & tần suất mỗi cụm.
3. Nếu có mục tiêu tính năng → **đối chiếu**: tính năng đang đạt/không (dấu hiệu adoption, phàn nàn).
4. Rút insight & gợi ý → chuyển PO (nguyên liệu Discovery — SF1).

## Output
```markdown
## TICKET DIGEST — [tính năng] · [khoảng thời gian]
### Cụm chủ đề (tần suất · sentiment)
- …
### Đối chiếu mục tiêu
- Mục tiêu: … → Thực tế: … (đạt/không)
### Insight & gợi ý cho PO
- …
```

## Gate
- Chỉ **tổng hợp & gợi ý**; PO quyết hành động (feed Discovery, sửa, bỏ).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
