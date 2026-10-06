---
name: jira-create
description: Tạo issue/task trên Jira Falcon (project FAL) từ mô tả bằng lời — sinh draft theo naming Solar, HỎI có cần link tới task nào không, duyệt, rồi POST tạo thật qua API. Hỗ trợ tạo NHIỀU issue 1 lượt (batch, vd nhiều bug cùng link 1 task). Skill DUY NHẤT để tạo task Jira (không còn tách theo role). Dùng khi user gõ "/jira-create", "tạo task Jira", "tạo issue FAL", "tạo bug FAL", "tạo sub-task", "giao task", "tạo loạt bug".
---

# jira-create

Skill **duy nhất** tạo một issue Jira Falcon. Không ràng buộc workflow theo role — mọi field tự chọn,
naming theo chuẩn Solar. Trước khi tạo, LUÔN hỏi issue này có cần **link tới task khác** không.

Đọc `$ENGINE_DIR/references/core.md` (lõi chung) TRƯỚC, rồi `$ENGINE_DIR/references/playbook.md` (quy trình).

## ⚙️ Đường dẫn — `$ENGINE_DIR`
`$ENGINE_DIR` = **thư mục skill này** (base directory ở đầu context — dòng *"Base directory for this skill"*).
Khi chạy script, thay `$ENGINE_DIR` bằng đường dẫn tuyệt đối đó (bọc nháy kép nếu có dấu cách). Token đọc
từ `$ENGINE_DIR/.env` (`JIRA_TOKEN=...`).

## Guard tuyệt đối (đọc kỹ core.md §An toàn)
- CHỈ project **FAL**. Không bao giờ POST project khác.
- CHỈ tạo issue. Không update/xoá/đổi cấu hình trong luồng skill. Đây là giới hạn *thiết kế skill*, KHÔNG phải giới hạn năng lực; khi user yêu cầu update/delete sau khi rời luồng, xem `core.md §An toàn` rule 5.
- KHÔNG auto-POST: luôn in draft → chờ user xác nhận rõ ("ok"/"đẩy"/"1") mới chạy `--confirm`.
- Thiếu `JIRA_TOKEN` trong `.env` → dừng ở draft, hướng dẫn tạo tay.
- Tên issue theo Solar `[ROLE][App]` (ROLE ∈ `DEV`/`BUG`/`BA`/`DESIGN`; App bỏ nếu thiếu), assignee mặc định = người tạo (riêng `[DESIGN]` = designer chung) — chi tiết `core.md`.

## Quy trình (chi tiết ở playbook.md)
1. Đảm bảo `$ENGINE_DIR/jira-metadata.json` tồn tại (không có → chạy `node $ENGINE_DIR/scripts/probe.mjs`).
2. Xác định issuetype (mặc định Task) + gom field bắt buộc không suy được → dựng draft (naming Solar).
3. **Hỏi link:** "Task này có cần link tới task nào không?" — không → tạo lẻ; có → resolve task đích (mã `FAL-xxx` hoặc keyword qua `search.mjs`) + chọn link type (mặc định `Relates`).
4. In DRY-RUN đầy đủ (payload + naming + assignee + link nếu có) → chờ duyệt.
5. Duyệt → `node $ENGINE_DIR/scripts/create-issue.mjs --confirm` → trả mã FAL-xxx + link + board.

**Batch:** tạo nhiều issue 1 lượt — stdin nhận mảng hoặc `{ issues:[...], ...common }`. Ca chính: Tester
1 file test nhiều bug cùng link về 1 task. Chi tiết ở `playbook.md §Batch`.
