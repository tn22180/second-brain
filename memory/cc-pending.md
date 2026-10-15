---
name: cc-pending
description: Hermes cron 09:00 báo Telegram các session Claude Code interactive còn dở; reply /cc tiep|don|bo N → Orca mở tab resume hoặc session dọn worktree.
metadata:
  node_type: memory
  type: project
  originSessionId: 06adf3f8-c40b-4e62-9b94-0f0dfbbc02c3
  modified: 2026-10-15T07:44:52.931Z
---

Dựng 2026-10-15. Code + test: `second-brain/tools/cc-pending/cc_pending.py` (stdlib, chạy dưới Python venv của Hermes). Hermes: cron `ea65987a9126` (`0 9 * * *`, `--script cc-pending.py --no-agent --deliver telegram`; wrapper ở `~/.hermes/scripts/`), plugin `~/.hermes/plugins/cc-pending` đăng ký `/cc` (sync handler → chạy trên executor pool, reload module mỗi lần nên sửa code không cần restart gateway). State `~/.cache/cc-pending/state.json`, có trong loops.yml.

"Dở" = `entrypoint=cli` (bỏ `claude -p`), idle ≥3h, gộp session mới nhất theo cwd, VÀ (worktree linked còn trên đĩa ≤30 ngày, HOẶC turn cuối là user / API error ≤7 ngày). Checkout chính bẩn không tính (second-brain luôn bẩn). User entry `/exit`, local-command không tính là turn bỏ dở.

- `tiep N [msg]`: tab Orca `cd <cwd> && claude --permission-mode auto --resume <sid> <msg>` (resume phải đứng đúng cwd). Host tab = path cwd nếu Orca quản, else repo chính, else second-brain.
- `don N`: session MỚI ở repo chính, prompt bắt check status + commit chưa lên remote → bẩn thì dừng; sạch thì đóng tab Orca của worktree rồi `orca worktree rm` (không --force). Không dismiss — worktree mất thì tự rơi khỏi list.
- `bo N`: dismiss tới khi session có hoạt động mới.

**Why:** Tuan muốn đóng vòng session bỏ dở từ điện thoại; thay quyết định cũ [[telegram-notify-only]] riêng cho luồng này.
**How to apply:** sửa tiêu chí trong cc_pending.py + chạy `python3 -m unittest test_cc_pending` trong thư mục đó. Xem [[hermes-work-openclaw-personal]], [[slack-thread-watch]].
