---
name: insights
description: "Gom tín hiệu từ khách (review App Store, ticket Support, động thái đối thủ) thành insight digest có cấu trúc — cụm theo vấn đề, xếp theo tần suất. Dùng khi: chuẩn bị buổi Discovery cần dữ liệu thật; hoặc tổng hợp ticket/feedback sau khi tính năng đã live để đối chiếu mục tiêu. Triggers: 'discovery digest', 'chuẩn bị discovery', 'gom insight', 'tổng hợp review', 'ticket digest', 'tổng hợp ticket', 'insight sau live', 'feedback 30 ngày'."
user_invocable: true
---

# Insights — gom tín hiệu thành digest

| Anh cần | Đọc |
|---|---|
| Chuẩn bị buổi Discovery (SF1) — gom review + ticket + đối thủ | `references/discovery.md` |
| Tổng hợp ticket/feedback sau live (SF5) — đối chiếu mục tiêu tính năng | `references/tickets.md` |

Mỗi file **tự đủ**.

## Dữ liệu lớn → giao agent
Nếu phải đọc **trên ~50 review/ticket**, đừng nhồi vào context này. Dispatch agent `product-analyst` với phương pháp trong reference tương ứng, rồi tổng hợp kết quả trả về.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
