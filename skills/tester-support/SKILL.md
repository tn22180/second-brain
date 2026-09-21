---
name: tester-support
description: "Vòng lặp support của Tester (SF8) — thao tác Slack + Jira qua agent, có gate duyệt trước mọi tin gửi đi. Dùng khi tester ĐANG XỬ LÝ một ca cụ thể: (1) có LINK THREAD Slack khách/CS báo lỗi → đọc thread, confirm bug, tạo task FAL kèm link thread, soạn + post tin tag dev/techlead; (2) dev báo fix xong một task cụ thể → verify, attach evidence vào Jira, chuyển Done, soạn + post tin 'đã hết lỗi' lên thread. KHÔNG dùng cho câu hỏi quy trình chung kiểu 'khách báo lỗi thì làm sao' (→ team-context), và KHÔNG dùng khi chỉ cần tạo issue Jira không dính thread Slack (→ jira)."
user_invocable: true
---

# tester-support — vòng lặp support của Tester qua agent

Chạy được ở mọi repo — token đọc từ khối `env` của `~/.claude/settings.json` (fallback: `.env` trong thư mục skill). Trong các reference, `<skill-root>` = thư mục chứa file SKILL.md này (nơi có `scripts/`, `references/`).

## Step 0 — Preflight token (BẮT BUỘC, chạy TRƯỚC mọi bước)

Trước khi làm bất cứ việc gì, chạy (thay `<skill-root>` = base directory của skill này — dòng *"Base directory for this skill"* ở đầu context):

    node "<skill-root>/../../scripts/preflight-env.mjs" tester-support

- Exit 0 (không in gì) → token đủ, tiếp tục quy trình.
- Exit ≠ 0 → script đã in hướng dẫn set up token còn thiếu. DỪNG NGAY: chuyển nguyên hướng dẫn đó cho user, KHÔNG chạy tiếp bước nào, KHÔNG tự điền token.

## Cần gì → đọc file nào

| Tester đang ở mốc | Đọc |
|---|---|
| Có thread Slack báo lỗi, cần confirm bug + tạo task + nhắn thread | `references/intake.md` |
| Dev fix xong, cần verify + evidence + Done + báo thread | `references/verify.md` |

Mỗi file **tự đủ** — đọc file đó là làm được, không cần quay lại đây.

## Nếu chưa rõ mốc nào

Hỏi một câu: *"Anh/chị đang ở mốc nào — vừa nhận thread báo lỗi (intake), hay dev đã fix xong cần verify (verify)?"*

## Nguyên tắc cứng

- Agent KHÔNG test hộ — người tự test, agent chỉ hỏi confirm.
- KHÔNG BAO GIỜ post Slack khi tester chưa duyệt draft.
- Chưa có evidence → không chuyển Done.

## Liên quan

- Quy trình gốc: SF8 (`workflows/subflows/sf8-production-bug.md`) · tạo issue: skill `jira`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo skill tester-support theo spec |
| 2026-07-21 | LamLN | Wrapper Slack + đọc token chuyển sang lib chung `scripts/lib/` — kèm phân trang, retry 429, kiểm content-type mà bản riêng của skill này chưa có |
| 2026-07-22 | LamLN | Nơi đặt token chính chuyển sang khối `env` của `~/.claude/settings.json` (sống qua mọi lần update plugin); `.env` cạnh skill xuống làm fallback — không đụng `description` |
