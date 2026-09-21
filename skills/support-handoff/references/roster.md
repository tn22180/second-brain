---
title: support-handoff — roster Slack UID (nhan-su/roster.json)
audience: dev
updated: 2026-07-21
related: [prerequisites, render-slack, pipeline]
---

# Roster Slack UID — `nhan-su/roster.json`

> Skill cần **UID Slack** để tag đúng người trong tin báo test. UID nằm ở **một nguồn duy nhất**: [`../../../nhan-su/roster.json`](../../../nhan-su/roster.json), **commit trong repo** — không phải file mỗi máy tự tạo. Cài plugin xong là dùng được ngay, không có bước onboarding.

## Nguồn sự thật — đọc kỹ chỗ này

| File | Giữ cái gì | Ai sửa |
|---|---|---|
| `nhan-su/roster.json` | Danh tính + **Slack UID** + role + board | Sửa ở đây khi team đổi người / có UID mới |
| [`nhan-su/README.md`](../../../nhan-su/README.md) | Bảng người đọc (họ tên, username, email) | Sửa kèm khi roster đổi |
| `skills/jira/team-roster.json` | Cơ cấu **team ↔ board ↔ app**, sprint | Bản phân phối từ brain Tech Lead — xem quy tắc 4 trong `CLAUDE.md` |

`roster.json` **không chép app/sprint** sang. Cần biết app nào thuộc board nào → đọc `team-roster.json`. Chép sang là sớm muộn lệch.

## Cấu trúc

```json
{
  "members": [
    { "jiraUsername": "lamln", "name": "Lại Ngọc Lâm", "email": "lamln@avadagroup.com", "role": "techlead", "board": "board1", "slackUid": "" }
  ]
}
```

- **`jiraUsername` là khoá chính.** Không tra theo `name` — team có tên trùng: `tranggt` (Giáp Thu Trang, Board 1) ≠ `trangdt` (Đào Thị Trang, Board 2); `dungta` (Designer) ≠ `dungtt` (Trịnh Thị Dung, Tester).
- **`email` + `emailAliases`: một người có thể có nhiều địa chỉ, cả hai đều đúng.** Công ty đổi domain từ `@avada.email` sang `@avadagroup.com`; người vào trước đợt đổi vẫn đăng ký Slack bằng địa chỉ cũ (hiện là `tuannv`, `nghiavt`). `email` = địa chỉ hiện hành, `emailAliases` = địa chỉ cũ còn dùng. **Tra người theo email phải khớp cả hai** — dùng `byEmail()` trong `roster.mjs`, đừng so `m.email === x`.
- `role` ∈ `po` | `techlead` | `ba` | `dev` | `tester` | `designer` | `support` (`--role` lọc khớp tuyệt đối).
- `board` = `board1` (Linh·Tuân·Lâm, `boardId 10030`) | `board2` (Nghĩa·Tam, `boardId 10031`) | `null` cho người dùng chung cả Falcon (Designer, CS).
- `slackUid` rỗng = chưa có → agent tag bằng **tên thường** (Slack không resolve thành mention) và nhắc bổ sung.

## Điền `slackUid`

**Cách A — giao diện Slack (không cần token):** mở profile người đó → **More** (`⋯`) → **Copy member ID** → dán chuỗi `U0XXXXXXX`.

**Cách B — API (cần `SLACK_TOKEN` scope `users:read`, xem [`prerequisites.md`](prerequisites.md)):**

```bash
curl -s "https://slack.com/api/users.lookupByEmail?email=tuannv@avadagroup.com" \
  -H "Authorization: Bearer $SLACK_TOKEN" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).user.id))"
```

Email lấy sẵn trong `roster.json`. Điền xong **commit** — cả team dùng chung, không ai phải điền lại.

**Cách C — script sync hàng loạt** (nhanh nhất, và là cách nên dùng):

```bash
node scripts/sync-slack-uids.mjs --channel C06RJ8UHM54            # xem trước, KHÔNG ghi gì
node scripts/sync-slack-uids.mjs --channel C06RJ8UHM54 --confirm  # ghi vào nhan-su/roster.json
node scripts/sync-slack-uids.mjs --channel C06RJ8UHM54 --all      # tra lại cả người đã có UID
```

`C06RJ8UHM54` là channel chứa toàn team Falcon — đổi ID nếu dùng channel khác.

Hai chế độ, **ưu tiên `--channel`**:

| Chế độ | Cách làm | Scope | Điểm yếu |
|---|---|---|---|
| `--channel <id>` | Liệt kê member channel (`conversations.members` + `users.info`) rồi khớp vào roster theo email | `channels:read` (+`groups:read` nếu private), `users:read` | Ai không ở trong channel thì không thấy |
| *(mặc định)* | `users.lookupByEmail` từng địa chỉ trong roster | thêm `users:read.email` | Chỉ tra được đúng địa chỉ roster đang ghi; sai domain là `users_not_found` |

Cả hai chế độ khớp trên **toàn bộ** địa chỉ của một người (`email` + `emailAliases`), nên người còn dùng `@avada.email` vẫn tra ra.

Token đọc theo thứ tự `SLACK_PERSONAL_TOKEN` → `SLACK_TOKEN` → `SLACK_USER_TOKEN`, tìm trong env shell → `.env` của workspace → `.env` của hai skill. Cả ba tên đều là **cùng một token** — hai skill trước đây đặt hai tên khác nhau, nay [`scripts/lib/env.mjs`](../../../scripts/lib/README.md) chấp nhận hết nên không máy nào phải sửa lại `.env`.

Mặc định chỉ tra người còn thiếu UID; in bảng `username  tên  (rỗng) → U0XXXXXXX` rồi dừng, phải `--confirm` mới ghi. Lỗi ở một người không làm hỏng người khác: in `❌ <lý do>` kèm cách xử lý. Chế độ `--channel` còn liệt kê **người có trong channel mà roster chưa có** — dùng để phát hiện người mới chưa được thêm vào roster.

## Kiểm tra

```bash
node "$DIR/scripts/roster.mjs"                              # in hết
node "$DIR/scripts/roster.mjs" --role techlead --board board1
node "$DIR/scripts/roster.mjs" --user tranggt               # tra 1 người theo username Jira
node --test "$DIR/scripts/"                                 # test, gồm cả kiểm roster thật
```

Mỗi dòng in `board  role  jiraUsername  name  <@UID hoặc tên thường>`; cuối lệnh cảnh báo ai còn thiếu UID. JSON sai cấu trúc → `ROSTER_INVALID`; không đọc được file → `MISSING_ROSTER`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo file — hướng dẫn tạo `roster.json` từ `roster.example.json`, lấy Slack UID, điền role/board |
| 2026-07-21 | LamLN | Gộp về 1 nguồn `nhan-su/roster.json` (commit trong repo, khoá `jiraUsername`); bỏ `roster.example.json` + bước onboarding tay; đổi tên file `onboarding-roster.md` thành `roster.md` |
| 2026-07-21 | LamLN | Thêm cách C — `scripts/sync-slack-uids.mjs` điền `slackUid` hàng loạt qua `users.lookupByEmail`, draft-first (`--confirm` mới ghi) |
| 2026-07-21 | LamLN | Điền đủ 19 `slackUid` từ channel team; thêm `emailAliases` (domain cũ `@avada.email` vẫn hợp lệ) + `byEmail()`/`emailsOf()`; script sync thêm chế độ `--channel` |
| 2026-08-14 | LinhNQ | Bỏ tên team cũ 'gộp Speed+Organic' / 'Paid' ở mô tả field `board` |
