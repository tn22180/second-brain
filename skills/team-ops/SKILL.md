---
name: team-ops
description: "Bảo trì hệ thống tài liệu vận hành của team (repo team-ops): thêm/định nghĩa lại vai trò, thêm subflow (mối nối giữa các vai trò), và rà tính nhất quán toàn hệ thống (link gãy, khớp 2 chiều role↔subflow, chồng chéo quyền quyết định). Triggers: 'thêm role', 'định nghĩa vị trí', 'định nghĩa lại role', 'thêm subflow', 'mối nối mới', 'quy trình tương tác', 'audit team-ops', 'rà nhất quán', 'check team-ops', 'soát chồng chéo'."
user_invocable: true
---

# Team-Ops — bảo trì tài liệu vận hành

Chạy **trong repo team-ops**.

| Anh cần | Đọc |
|---|---|
| Thêm mới / định nghĩa lại một vai trò | `references/add-role.md` |
| Thêm một subflow (mối nối giữa vai trò) | `references/add-subflow.md` |
| Rà nhất quán toàn hệ thống, tìm lệch | `references/audit.md` |

Mỗi file **tự đủ**.

## Nguồn sự thật
`roles/interaction-matrix.md` là **nguồn duy nhất** cho "ai làm gì / ai quyết gì". `roles/<role>.md` và `workflows/master-flow.md` chỉ **mô tả và link** sang ma trận — không được chép lại bảng quyền quyết định.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
