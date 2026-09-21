---
name: release
description: "Công bố tính năng đã ship, lấy dữ liệu từ GitLab MR. Dùng khi: viết changelog hằng tháng đăng docs.avada.io (bản kỹ thuật nội bộ + bản cho merchant), hoặc viết release note ngắn đăng Slack cho một tính năng vừa ra. Triggers: 'viết changelog', 'update changelog', 'cập nhật changelog', 'viết release note', 'release note', 'thông báo tính năng mới'."
user_invocable: true
---

# Release — công bố tính năng

Cả hai chế độ đều lấy MR từ GitLab qua `scripts/fetch-gitlab-mrs.sh`.

| Anh cần | Đọc |
|---|---|
| Changelog hằng tháng lên docs.avada.io (bản nội bộ + bản merchant) | `references/changelog.md` |
| Release note ngắn, đăng Slack, cho 1 tính năng vừa ra | `references/slack-note.md` |

Mỗi file **tự đủ**.

## Step 0 — Preflight token (BẮT BUỘC, chạy TRƯỚC mọi bước)

Trước khi làm bất cứ việc gì, chạy (thay `<skill-root>` = base directory của skill này — dòng *"Base directory for this skill"* ở đầu context):

    node "<skill-root>/../../scripts/preflight-env.mjs" release

- Exit 0 (không in gì) → token đủ, tiếp tục quy trình.
- Exit ≠ 0 → script đã in hướng dẫn set up token còn thiếu. DỪNG NGAY: chuyển nguyên hướng dẫn đó cho user, KHÔNG chạy tiếp bước nào, KHÔNG tự điền token.

## Khác nhau chỗ nào
- **changelog** = định kỳ, đăng site docs, 2 bản (kỹ thuật + merchant), có deploy Nextra.
- **slack-note** = ad-hoc, đăng Slack, 1 bản ngắn, thường kèm ảnh chụp màn hình.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
