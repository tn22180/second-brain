---
name: check-dor
description: "Soát tài liệu PRD trước khi giao Dev — trả lời 'trước khi giao dev cần chuẩn bị gì / PRD còn thiếu gì / PRD xong ai check / giao dev được chưa'. 2 cổng: (1) DoR — PO/BA tự soát checklist 'Sẵn sàng làm', cổng phụ trợ SF2; (2) Dev-ready — chấm PRD final theo Gate G3, PASS/FAIL từng mục, agent qa-reviewer dùng trước handoff Dev."
user_invocable: true
---

# Check DoR — soát tài liệu trước khi giao Dev

| Anh cần | Đọc |
|---|---|
| PO tự soát PRD theo checklist "Sẵn sàng làm" (DoR) trước khi giao Dev — cổng SF2 | `references/dor.md` |
| Chấm PRD theo checklist Dev-ready (G3) — bản agent `qa-reviewer` dùng | `references/dev-ready.md` |

Mỗi file **tự đủ**.

## Hai cổng khác nhau
- **DoR (SF2)** — PO/BA tự soát trước khi giao. Nhẹ, nhanh.
- **Dev-ready (G3)** — cổng chính thức, **agent kiểm phải KHÁC agent làm** (`qa-reviewer` chấm, không phải `prd-writer`).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
