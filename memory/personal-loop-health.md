---
name: personal-loop-health
description: loop-health (second-brain/harness) kiểm OUTPUT của mọi loop launchd cá nhân mỗi giờ, alert Telegram DM riêng (bot Hermes → user 1178722633), KHÔNG vào nhóm; thêm loop mới vào loops.yml.
metadata:
  type: project
---

Dựng 2026-09-30: `harness/loop_health.py` + `harness/loops.yml`, launchd `com.tn22180.loop-health` (hourly, RunAtLoad). Kiểm artifact (commit origin/main, report có ngày trong tên, log mtime), không kiểm pid/exit code. Alert macOS + Telegram DM riêng qua bot Hermes (token đọc lúc gửi từ `~/.hermes/.env`, chat_id 1178722633) — Tuan cấm báo vào nhóm chỉ khi đổi trạng thái; nhắc lại sau 24h. State `~/.cache/loop-health/`.

**Why:** loop cá nhân hỏng câm liên tục — brain push 23 đêm, billing thiếu 09-23..27, autofix audit dừng từ 09-27 mà `audit.log` vẫn ghi.

**How to apply:** loop launchd mới → thêm entry vào `loops.yml` cùng ngày. Chưa có gì canh chính loop-health (định cho `brain.py sync` check `last-run`). falcon-fix-bot đã tắt, không còn trong list ([[falcon-fix-bot-mac-runtime]]).
