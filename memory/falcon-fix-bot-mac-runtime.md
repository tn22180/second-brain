---
name: falcon-fix-bot-mac-runtime
description: "falcon-fix-bot chạy NATIVE launchd từ 2026-09-23 ở ~/Projects/falcon-fix-bot (không còn docker/colima); HOME riêng, session default-deny; docker bản cũ bị PAUSED."
metadata:
  node_type: memory
  type: project
  originSessionId: abf45b73-ffd6-4c00-82d4-77b85d4fae88
  modified: 2026-09-23T02:32:00.342Z
---

Từ **2026-09-23 09:11 (+07)** bot chạy native: launchd `com.falcon-fix-bot.daemon` +
`com.falcon-fix-bot.watchdog`, runtime = clone ở **`~/Projects/falcon-fix-bot`** (ngoài
~/Documents vì TCC chặn launchd). Code dev vẫn ở second-brain; update runtime = `git pull`
+ `launchctl kickstart -k gui/$(id -u)/com.falcon-fix-bot.daemon`. MR !9
(`feat/native-launchd-runtime`) — runtime đang chạy từ branch đó tới khi merge.
Flags live giữ nguyên: `DRY_RUN=0 TEST_MODE=0 AUTO_MERGE=0 AUTO_DEPLOY=0 COMMANDS_ENABLED=1`.

Bẫy đã dính khi chuyển, đều đã vá trong MR:
- Không gì trong code đọc `.env` — compose `env_file:` làm hộ. Native thiếu → DRY_RUN default true, OPS_CHANNEL rỗng. Giờ `main.js#loadDotEnv` (env đã set thắng file).
- HOME thật → hook SessionStart + memory của Tuan rò vào mọi session bot (probe INJECTED vs NONE). Daemon dùng `HOME=<runtime>/home`.
- `/opt/homebrew/etc/gitconfig` set osxkeychain → `failed to store: -60006` mỗi fetch. Reset chain per repo.
- Plist nằm trong LaunchAgents + RunAtLoad = tự chạy lúc login dù chưa bootstrap; watchdog load trước daemon → alert giả OPS (2026-09-22 18:03). Installer giờ stage plist tới khi `--start`.
- `bootout` rồi `bootstrap` ngay → `Bootstrap failed: 5`. Phải chờ label biến mất.

Session không còn `--dangerously-skip-permissions`: profile `investigate`/`edit` trong
`src/permissions.js`. Deny prefix **thủng** (`/bin/rm` lọt `Bash(rm:*)`), allowlist mới là rào.
Fix path (edit profile) CHƯA được thử trên bug thật lúc cutover — EMPTY_DIFF = allowlist chặt quá.

Docker/colima cũ: container `restart: unless-stopped`, colima chết sáng 09-23. Đã ghi
`PAUSED` vào `second-brain/.../falcon-bug-fix-agent/data/state/` để nếu colima sống lại thì
container không chạy song song. Dọn hẳn: khi colima up → `docker compose stop`.
Bản mirror watchdog cũ ở `~/Library/Application Support/falcon-fix-bot/` (có 1 copy slack
bot token) đã lỗi thời.

`gitlab.token` scope `api`, hết hạn **2026-10-03**. Claude auth: `secrets/claude-oauth.token`.
Xem thêm [[avada-gitlab-selfhost]].
