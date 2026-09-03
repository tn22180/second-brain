---
name: falcon-fix-bot-mac-runtime
description: falcon-bug-fix-agent chạy trên máy Tuan qua colima; watchdog launchd phải mirror ra ~/Library/Application Support vì TCC chặn ~/Documents.
metadata: 
  node_type: memory
  type: project
  originSessionId: 74fdfe65-e61e-475d-8430-e88d8468cc67
  modified: 2026-09-03T03:45:07.729Z
---

`falcon-bug-fix-agent` (falcon-fix-bot) được setup chạy trên máy Tuan ngày 2026-09-03,
live từ 10:43 (+07): `DRY_RUN=0 TEST_MODE=0 AUTO_MERGE=0 AUTO_DEPLOY=0 COMMANDS_ENABLED=1`,
`RUN_INTERVAL_MIN=60`, ops+test channel đều là `C0BHX62MN2Z`.

Runtime **không phải Docker Desktop** — Docker Desktop đã gỡ nhưng để lại
`~/.docker/cli-plugins/*` symlink chết (làm `docker compose` báo "unknown command")
và `credsStore: desktop` trong `~/.docker/config.json` (làm mọi `docker pull` chết với
`docker-credential-desktop not found`). Đã xoá cả hai. Engine hiện tại là **colima**
(`colima start --cpu 4 --memory 6 --disk 40 --vm-type vz --mount-type virtiofs`),
compose plugin link tay từ `/opt/homebrew/bin/docker-compose`. Không có buildx →
compose dùng classic builder, vẫn build được.

**Watchdog không chạy được từ trong repo.** Repo nằm dưới `~/Documents/second-brain/...`,
và process do launchd spawn bị TCC chặn đọc `~/Documents` → `scripts/install.sh` cài plist
xong nhưng job exit **126** `/bin/bash: .../watchdog.sh: Operation not permitted`, tức
watchdog mù hoàn toàn mà vẫn "loaded". Fix đang dùng: mirror ra
`~/Library/Application Support/falcon-fix-bot/` (`scripts/watchdog.sh`, `.env` chỉ có
`OPS_CHANNEL=`, `secrets/slack-bot.token` 600, `data/state/` cho marker+log); plist trỏ
vào đó nên `DIR=$(dirname $0)/..` tự đúng. Hệ quả: watchdog.sh là bản copy — sửa upstream
phải sync tay; slack bot token tồn tại thêm 1 bản ngoài repo.

`secrets/` giờ nằm trong repo (gitignored), không còn ở `~/Downloads/secrets`.
`gitlab.token` phải là PAT của account có Developer+ trên 5 app + `falcon/team-ops` +
`falcon/product/*` với scope `api` (không phải `read_api` — MR create cần `api`);
token của user `ci` chỉ thấy được các repo `*-artifacts`. Bản đang dùng hết hạn **2026-10-03**.
Claude auth: `secrets/claude-oauth.token` (`claude setup-token`) — không mượn được login
sẵn trên máy vì macOS giữ credential trong Keychain, container Linux không đọc được.

Xem thêm [[avada-gitlab-selfhost]].
