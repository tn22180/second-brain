> Chế độ của skill `support`. File này tự đủ — đọc xong là làm được.

# Support pack — trang bị Support trước khi live (SF5 / SF7)

Dựng gói thông tin để Support hỗ trợ khách ngay khi tính năng lên. **AI dựng nháp; PO review, Support dùng.**

## Input
- PRD (tính năng làm gì, cho ai).
- Changelog / hướng dẫn sử dụng (nếu có).

## Các bước
1. Tóm tắt **tính năng làm gì** (ngôn ngữ khách, không kỹ thuật).
2. **Cách dùng** — các bước chính khách sẽ thao tác.
3. **Lỗi / hạn chế đã biết** + workaround.
4. **Khi nào escalate** cho Dev/PO (dấu hiệu, kênh).

## Output
```markdown
## SUPPORT PACK — [tính năng]
- Làm gì: …
- Cách dùng: …
- Lỗi/hạn chế đã biết + workaround: …
- Khi nào escalate: …
```

## Gate
- PO review trước khi trao Support. Support **đã nắm gói** là điều kiện để mở 100% (nối SF5).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
