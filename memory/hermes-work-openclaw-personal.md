---
name: hermes-work-openclaw-personal
description: "Two agent gateways on this Mac — Hermes is the work lane, OpenClaw the personal one; how they are kept apart"
metadata: 
  node_type: memory
  type: project
  originSessionId: dee087f4-80c6-4da2-b73e-40906ee61f97
  modified: 2026-09-22T11:05:37.144Z
---

Từ 2026-09-22 máy này chạy **hai** agent gateway, cố ý tách vai:

- **Hermes Agent** (`~/.hermes`, v0.21.4) = **công việc**. launchd `ai.hermes.gateway`,
  điều khiển qua **unix socket** `~/.hermes/gateway.sock` — KHÔNG chiếm cổng TCP.
- **OpenClaw** (`~/.openclaw`) = **trợ lý cá nhân**. launchd `ai.openclaw.gateway`, TCP `:18789`,
  giữ bot Telegram hiện có. Xem [[openclaw-ollama-cloud-setup]].

Không đụng nhau: khác plist, khác config dir, khác auth store, khác kiểu bind.

**Dùng chung đúng một thứ:** `OLLAMA_API_KEY` lấy từ
`projects/Falcon/seo/packages/functions/.env` (ollama-cloud, model free, primary `kimi-k3`).
Hermes lưu nó ở `~/.hermes/.env` và pool lại trong `~/.hermes/auth.json` với
`base_url https://ollama.com/v1`.

**`auth.adopt_external_logins` phải giữ `false`.** Mặc định Hermes BẬT cái này và sẽ mượn login
Claude Code + Codex CLI. Refresh token của chúng là single-use → hai chương trình dùng chung một
login đá nhau ra ngoài. Đã tắt ngay sau khi cài, `auth.json` lúc đó mới chỉ có `ollama-cloud`.

**Skill dùng chung, không copy:** `skills.external_dirs: [~/.claude/skills]` (read-only). Hermes
thấy 97 skill = 12 bộ của nó + 38 skill Avada. Định dạng trùng nhau (`<dir>/SKILL.md`, frontmatter
`name`/`description`), và 0 skill Avada nào gọi tool riêng của Claude Code nên chạy được nguyên
trạng. Skill Hermes tự sinh luôn ghi vào `~/.hermes/skills/`, không bao giờ ghi ngược.

**Cài bằng installer đã audit, không `curl | bash`.** Hai thứ đã chặn bằng cờ:
`--skip-computer-use` (mặc định nó `curl|bash` lồng từ repo bên thứ ba `trycua/cua` và cài
`CuaDriver.app` điều khiển desktop) và `--skip-setup`. `mcp_servers` chỉ có `prompt-audit`;
`google-workspace` cố tình để ngoài vì mang quyền gửi Gmail + ghi Calendar.

**How to apply:** trước khi debug "Hermes không thấy skill/model", kiểm tra đúng ba chỗ:
`~/.hermes/config.yaml` (`provider`, `external_dirs`), `~/.hermes/.env` (`OLLAMA_API_KEY` phải là
dòng KHÔNG comment — file mẫu có sẵn dòng `# OLLAMA_API_KEY=` dễ khớp nhầm khi sửa bằng script),
và `hermes gateway status`.
