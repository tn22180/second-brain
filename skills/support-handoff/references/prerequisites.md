---
title: support-handoff — điều kiện chạy (prerequisites)
audience: dev
updated: 2026-07-22
related: [pipeline, roster, render-slack]
---

# Prerequisites — support-handoff

> Đọc file này **1 lần trên máy mới** trước khi dùng skill `support-handoff`. Tự đủ — không cần đọc gì thêm để chạy được.

## Bảng điều kiện

| Điều kiện | Kiểm bằng | Thiếu thì sao |
|---|---|---|
| Node ≥ 18 | `node --version` | Script dùng `fetch`/`node:test` built-in — Node cũ sẽ lỗi import ngay dòng đầu. Cài Node ≥18. |
| `SLACK_TOKEN` (xoxp) | mở `~/.claude/settings.json`, khối `env` có `"SLACK_TOKEN"` | Script Slack (`read-thread.mjs`, `post-slack.mjs`) ném `MISSING_SLACK_TOKEN` → dừng. Cách lấy: mục "Lấy SLACK_TOKEN" dưới. |
| Scope Slack đủ | test thật bằng `read-thread.mjs` trên 1 thread đã join | Thiếu scope → Slack trả lỗi `missing_scope`, xem bảng troubleshooting. |
| `JIRA_TOKEN` | mở `~/.claude/settings.json`, khối `env` có `"JIRA_TOKEN"` | Script Jira (`fetch-task.mjs`, `set-status.mjs`) ném `MISSING_JIRA_TOKEN` → dừng. Lấy tại Jira → ảnh đại diện → **Profile** → **Personal Access Tokens** — một token dùng chung mọi skill Jira, xem [`docs/setup.md`](../../../docs/setup.md#đặt-token-ở-đâu--claudesettingsjson). |
| Roster Slack UID | `node $DIR/scripts/roster.mjs` | Nằm sẵn trong repo (`nhan-su/roster.json`), **không cần onboard**. Ai chưa có `slackUid` → script cảnh báo, agent tag bằng tên thường. Điền UID theo [`roster.md`](roster.md). |
| Jira workflow có transition tới "Waiting to test" | chạy dry-run `set-status.mjs --key <task-thật>` (không `--confirm`) | Không có transition phù hợp từ status hiện tại → `set-status.mjs` thoát exit 2 (non-fatal), agent ghi vào báo cáo cuối, không dừng cả luồng. |

## Nơi đặt token — `~/.claude/settings.json`

Điền vào khối `env`, **một lần cho mọi skill**:

```json
{
  "env": {
    "SLACK_TOKEN": "xoxp-…",
    "JIRA_TOKEN": "…"
  }
}
```

File đã có khối `env` thì thêm key vào, đừng ghi đè cả khối. Sửa xong **khởi động lại Claude Code**, rồi `chmod 600 ~/.claude/settings.json`.

**Đừng đặt token trong thư mục skill.** Mỗi bản plugin mới nằm ở thư mục riêng theo commit SHA (`~/.claude/plugins/cache/falcon/falcon/<SHA>/`) — file `.env` bạn đặt ở đó không được mang sang, nên cứ update là mất token. File `.env` chỉ còn là fallback khi bạn đang sửa repo `team-ops` local; chi tiết ở [`docs/setup.md`](../../../docs/setup.md#fallback-env-trong-thư-mục-skill).

`.env` **không commit** (đã gitignore ở cấp repo cho `.env`). Ngược lại, `nhan-su/roster.json` **có commit** — Slack UID là dữ liệu dùng chung cả team, xem [`roster.md`](roster.md).

## Lấy `SLACK_TOKEN` (xoxp — user token, mỗi dev tự cấp)

Đây là **user token**, không phải bot token — tin đăng ra sẽ hiện là chính bạn (post-as-user), không phải 1 bot.

1. Hỏi PO/Tech Lead xem team đã có sẵn 1 **Slack App nội bộ** dùng chung cho việc này chưa (tên gợi ý: `Falcon Support Handoff` hoặc tương tự). Có sẵn → xin được thêm vào workspace, bỏ qua bước 2, sang bước 3.
2. Chưa có app nào → tạo mới tại [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch** → chọn đúng workspace Avada.
3. Vào **OAuth & Permissions** → mục **User Token Scopes** (không phải Bot Token Scopes) → thêm đủ 4 scope:
   - `channels:history` — đọc thread trong kênh public đã join.
   - `groups:history` — đọc thread trong kênh private đã join.
   - `chat:write` — post reply as user.
   - `users:read` — tra Slack UID theo email (dùng khi điền UID vào `nhan-su/roster.json`).
4. **Install to Workspace** (hoặc **Reinstall** nếu app đã tồn tại và bạn chỉ vừa được thêm scope) → xác nhận quyền.
5. Copy **User OAuth Token** (chuỗi bắt đầu `xoxp-...`) → dán vào `"SLACK_TOKEN"` trong `~/.claude/settings.json`.

> Lưu ý: thread `read-thread.mjs` đọc phải là thread bạn **đã join** (bot/app không tự thấy hết kênh private). Chưa join → Slack trả `not_in_channel`, xem bảng dưới.

## Troubleshooting

| Lỗi in ra | Nguyên nhân | Cách xử lý |
|---|---|---|
| `MISSING_SLACK_TOKEN` | chưa có `SLACK_TOKEN` (hoặc rỗng) ở `~/.claude/settings.json` lẫn `.env` | Làm lại mục "Lấy SLACK_TOKEN" ở trên. |
| `MISSING_*_TOKEN` **dù đã điền đúng settings.json** | Đang gõ lệnh thẳng trong Terminal.app/iTerm — khối `env` của `settings.json` chỉ nạp vào tiến trình do **Claude Code** sinh ra, shell thường không thấy | Chạy trong phiên Claude Code (gõ `! <lệnh>`) hoặc gọi thẳng skill. **Đừng đi tạo token mới** — token không hỏng. Vừa sửa `settings.json` thì khởi động lại Claude Code. |
| `MISSING_JIRA_TOKEN` | chưa có `JIRA_TOKEN` ở `~/.claude/settings.json` lẫn `.env` | Lấy token tại Jira → Profile → Personal Access Tokens, điền vào khối `env` của `~/.claude/settings.json`. |
| `SLACK_conversations.replies_ERROR: not_in_channel` | Bạn (chủ token) chưa **join** kênh chứa thread | Vào Slack, join kênh đó (hoặc nhờ ai trong kênh join hộ nếu private), chạy lại. |
| `SLACK_conversations.replies_ERROR: channel_not_found` | Channel ID sai (thường do dán nhầm link, hoặc kênh đã archive/xoá) | Kiểm lại link permalink gốc; dán lại đúng link từ Slack (chuột phải tin → **Copy link**). |
| `SLACK_..._ERROR: missing_scope` | App thiếu 1 trong 4 scope | Vào **OAuth & Permissions**, thêm scope thiếu, **Reinstall to Workspace**, copy token mới (token cũ không tự có thêm quyền). |
| `MISSING_ROSTER` | Không đọc được `nhan-su/roster.json` | File nằm trong repo — thiếu nghĩa là bản cài hỏng. Cập nhật lại plugin, xem [`roster.md`](roster.md). |
| `ROSTER_INVALID` | `roster.json` không có mảng `members` gồm `{jiraUsername,name,role,board,slackUid}` | Sửa lại đúng cấu trúc, xem [`roster.md`](roster.md). |
| `NO_TRANSITION_TO "Waiting to test" cho FAL-xxx` | Task đang ở status không có transition trực tiếp tới "Waiting to test" (hoặc đã ở đó rồi) | Non-fatal — agent ghi vào báo cáo cuối, dev tự đổi status tay trên Jira nếu cần. Nếu **luôn luôn** báo lỗi này cho mọi task → tên transition trong workflow Jira khác chữ, báo Tech Lead sửa default trong `set-status.mjs` hoặc dùng `--to "<tên đúng>"`. |
| `JIRA_ERROR 401` / `JIRA_TRANSITIONS_ERROR 401` | `JIRA_TOKEN` sai hoặc hết hạn | Cấp token mới tại Jira → Profile → Personal Access Tokens. |

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo file — điều kiện chạy + hướng dẫn lấy SLACK_TOKEN/JIRA_TOKEN + bảng troubleshooting |
| 2026-07-17 | LamLN | Bỏ hàng `git`/CLI GitLab ma khỏi bảng điều kiện + troubleshooting — skill không shell ra tiến trình ngoài nào, `resolve-mr.mjs` chỉ regex field Merge Request/description của Jira (review batch 2/2 docs) |
| 2026-07-21 | LamLN | Bỏ điều kiện onboard `roster.json` từng máy — roster nằm sẵn trong repo (`nhan-su/roster.json`); cập nhật `MISSING_ROSTER`/`ROSTER_INVALID` |
| 2026-07-22 | LamLN | Token chuyển sang `~/.claude/settings.json`, `.env` thành fallback; sửa link gãy `#5-token-chỉ-3-skill-cần` |
| 2026-07-22 | LamLN | Cảnh báo bẫy chạy preflight ngoài terminal — khối `env` của settings.json chỉ nạp vào tiến trình Claude Code, shell thường không thấy token (dễ bị hiểu nhầm là token hỏng) |
