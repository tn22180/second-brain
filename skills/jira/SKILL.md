---
name: jira
user_invocable: true
description: Thao tác issue Jira project FAL của team Falcon — tạo task/bug/sub-task, xem và tìm issue, kéo status, gán người, đưa vào sprint, sửa field, comment, đính kèm, link, xoá. Dùng khi người dùng nêu thẳng một việc Jira RỜI (mã FAL-xxx, "tạo task", "kéo sang Done", "gán cho", "task nào đang mở"). KHÔNG dùng cho quy trình có Slack — dev báo test xong dùng support-handoff, tester intake/verify bug từ thread khách dùng tester-support.
---

# jira

Skill **duy nhất** thao tác issue Jira Falcon (project FAL): tạo mới và đọc/sửa/gán/chuyển sprint/xoá issue đã có. Không ràng buộc workflow theo role. Đọc `$ENGINE_DIR/references/core.md` (lõi chung) TRƯỚC. Tạo issue mới → `references/create.md`. Đọc/sửa/xoá issue đã có → `references/operate.md`.

## ⚙️ Đường dẫn — `$ENGINE_DIR`
`$ENGINE_DIR` = **thư mục skill này** (base directory ở đầu context — dòng *"Base directory for this skill"*). Khi chạy script, thay `$ENGINE_DIR` bằng đường dẫn tuyệt đối đó (bọc nháy kép nếu có dấu cách). Token `JIRA_TOKEN` đọc từ khối `env` của `~/.claude/settings.json` (cách chính), fallback `$ENGINE_DIR/.env`.

## Step 0 — Preflight token (BẮT BUỘC, chạy TRƯỚC mọi bước)

Trước khi làm bất cứ việc gì, chạy:

    node "$ENGINE_DIR/../../scripts/preflight-env.mjs" jira

- Exit 0 (không in gì) → token đủ, tiếp tục quy trình.
- Exit ≠ 0 → script đã in hướng dẫn set up token còn thiếu. DỪNG NGAY: chuyển nguyên hướng dẫn đó cho user, KHÔNG chạy tiếp bước nào, KHÔNG tự điền token.

## Guard tuyệt đối (đọc kỹ core.md §An toàn)
- CHỈ project **FAL**. Không bao giờ thao tác project khác — script chặn ở `assertFalKey`.
- Thao tác chia **4 tầng theo mức nguy hiểm**, script tự xếp tầng, agent không tự quyết. Tóm tắt (bảng
  đầy đủ từng verb thuộc tầng nào → `core.md §An toàn`):
  - **T0** đọc (`get`/`search`/`sprints`/`board`/`transitions`/`meta`) — chạy thẳng.
  - **T1** ghi nhẹ trên issue của mình — chạy thẳng, báo kết quả sau.
  - **T2** issue của người khác, hoặc `update` chạm `summary`/`description` — in DRAFT, chờ `--confirm`.
  - **T3** `delete`/`unlink` — cảnh báo không hoàn tác, luôn phải `--confirm` tay (`--force` không có tác dụng).

- Tên issue theo Solar `[ROLE][App]`, assignee mặc định = người tạo (riêng `[DESIGN]` = designer chung) — chi tiết `core.md`.

## Quy trình
1. Tạo issue mới → `create.md` (draft naming Solar → hỏi link → hỏi sprint → duyệt → `--confirm`).
2. Đọc/sửa/kéo status/xoá issue đã có → `operate.md` (verb tương ứng, tầng T0–T3 tự xếp).
3. **Tạo xong CHƯA phải là hết.** Hỏi tiếp: kéo status / gán sprint / link tới task nào không? Xem `operate.md`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
| 2026-07-16 | LamLN | Thêm bước hỏi sprint (đưa vào sprint hiện tại / backlog); script move issue vào sprint sau khi tạo + `sprints.mjs` |
| 2026-07-22 | LamLN | Mở rộng skill jira ra ngoài create: verb đọc/ghi/xoá + guard phân tầng T0–T3 |
| 2026-07-22 | LamLN | Sửa review: rút bảng T0–T3 (chép trùng với `core.md`) còn tóm tắt 4 dòng, trỏ sang `core.md` cho bảng đầy đủ |
