---
name: share-note
description: Publish, update OR delete a .md/.html file on notes.avada.net (chia sẻ nội bộ, hỗ trợ mã hoá đầu cuối với --private). Create returns a new share URL; update (--update <url-or-id>) edits an existing note in place, keeping the same URL; delete (--delete <url-or-id>) soft-deletes a note bạn tạo ra. Use when "share note", "publish note", "update note", "cập nhật note", "xoá note", "delete note", "share-note <path>", "share-note <path> --update <id>", "share-note --delete <id>", đường dẫn .md / .html cần đẩy lên, sửa hoặc xoá trên notes.avada.net.
model: haiku
---

# share-note

Publish a local `.md`/`.html` file to notes.avada.net, or update an existing note in place. Mặc định chia sẻ nội bộ dạng plaintext, ai có link đều đọc được. Dùng `--private` để tạo note mã hoá đầu cuối, yêu cầu người xem đăng nhập email Avada.

Version 2.2.0 — adds delete (`DELETE /api/upload/:id`) và thông báo lỗi phân biệt được cho nhóm token. Version 2.0.0 đã có in-place update (`PUT /api/upload/:id`). Create vẫn là `POST /api/upload`. Note id là 10-char base62 (legacy 32-char vẫn nhận trên update và delete).

## Usage

Lấy `NOTES_API_KEY` ở đâu: vào my.avada.net, mục Notes key, bấm "Tạo key của tôi" rồi copy token (chỉ hiện đúng một lần). Không xin Sam cấp tay nữa, và không dùng chung key với người khác — key gắn với email của bạn, quyền sửa/xoá note tính theo email đó.

```
share-note <file>                                        Publish new note (POST) → new URL
share-note <file> --update <url-or-id>                   Update existing note (PUT) → same URL
share-note <file> --update <url-or-id> --summary "..."   Update + đính kèm summary
share-note <file> --update <url-or-id> --kind <kind>     Update + phân loại thay đổi
share-note --delete <url-or-id>                          Xoá note (DELETE) → soft delete
```

`<file>` phải là `.md` hoặc `.html` (khác → exit 4). `--delete` KHÔNG cần `<file>` — chỉ cần URL hoặc id. `--update` và `--delete` không dùng chung được (→ exit 2).

`--update` và `--delete` nhận URL đầy đủ hoặc bare id:
- `https://notes.avada.net/KJSEg65ZL1.md`
- `KJSEg65ZL1` (10-char id — ext suy từ file)
- id 32-char (legacy)

Change kinds: `content` (default) | `typo` | `restructure` | `other`.

Xoá thành công in ra `deleted <id> at <ISO timestamp>` và thoát 0.

### Private note (mã hoá đầu cuối)

```
share-note <file> --private                             Tạo private note với password tự sinh
share-note <file> --private --expires <7d|30d|90d|never> Chọn hạn dùng, mặc định 30d
share-note <file> --private --link-key                  Đặt khoá trong URL fragment #k=...
```

`--private` mã hoá toàn bộ file tại máy, kể cả frontmatter. Chỉ nhận `.md` và `.html`; đuôi khác → exit 2. POST `/api/private` chỉ gửi `{ ext, expiresIn, envelope }`, không gửi tên file, password hay khoá lên server.

`--expires` nhận `7d`, `30d`, `90d` hoặc `never` (không hết hạn), mặc định `30d`. `--expires` và `--link-key` chỉ có nghĩa khi có `--private`; dùng riêng hoặc hạn dùng không hợp lệ → exit 2.

Private note KHÔNG sửa được; cần thay đổi thì tạo note mới. Không dùng `--private` chung với `--update` hoặc `--delete` (exit 2). Muốn xoá, dùng `--delete <id>` bình thường.

Người xem phải đăng nhập email Avada. Quên password là mất nội dung vĩnh viễn, server không thể khôi phục. Mặc định stdout in 4 dòng: URL, `Password: <password>`, hạn dùng, và lời nhắc gửi link/password qua HAI kênh khác nhau. Dán chung một tin nhắn là mất tác dụng bảo vệ.

Với `--link-key`, stdout in 3 dòng: URL có `#k=<khoá base64url>`, lời nhắc ai có nguyên link và đăng nhập được Avader là đọc được, rồi hạn dùng. Khoá chỉ nằm trong fragment, không nằm trong URL query. Mất nguyên link chứa khoá thì không thể khôi phục nội dung.

Password và khoá chỉ được in ra stdout tại các dòng trên; không ghi ra file, không log ở nhánh lỗi và không gửi lên server. Hạn dùng in `Hết hạn: YYYY-MM-DD (N ngày)` theo phản hồi server, hoặc `Hết hạn: không`.

## What it does

Các bước dưới đây áp dụng cho chế độ thường; luồng private được mô tả ở phần usage phía trên.

1. Đọc file, nếu `.md` thì parse frontmatter (`title`, `created` — còn lại bỏ qua; `password` legacy bị cảnh báo + drop). Body sau frontmatter là phần được đẩy. `.html` đẩy verbatim.
2. Create (không có `--update`): POST `/api/upload?ext=md|html` với `Authorization: Bearer ${NOTES_API_KEY}`. Server cấp id 10-char ngẫu nhiên, in URL ra stdout.
3. Update (`--update <id>`): PUT `/api/upload/:id?ext=...` với body mới + các header meta bắt buộc (thu tự động):
   - `X-Notes-Git-Email` (git config user.email, fallback `<user>@unknown`)
   - `X-Notes-Hostname`, `X-Notes-Client` (share-note@2.2.0), `X-Notes-Client-Type: cli`
   - optional: `X-Notes-Git-Branch/Commit`, `X-Notes-LLM-Model`, `X-Notes-Session-Id`, `X-Notes-Change-Kind`, `X-Notes-Summary`
   In `URL (update #<seq> of <count>)` ra stdout. Giữ nguyên URL/id.
4. Delete (`--delete <id>`): DELETE `/api/upload/:id` với `Authorization: Bearer ${NOTES_API_KEY}`, không body, không header meta. In `deleted <id> at <ISO>` ra stdout.

## Liệt kê note của mình (API, không có trong CLI này)

Từ 2026-08-27 backend có endpoint đọc. Skill này chưa bọc chúng thành cờ CLI — gọi thẳng bằng `curl` với chính `NOTES_API_KEY`:

```
GET /api/notes?limit=&cursor=   → { notes: [...], nextCursor }   list note của mình, mới nhất trước
GET /api/notes/:id              → metadata 1 note (không trả nội dung)
```

`limit` mặc định 20, trần 100. Phân trang: lặp với `?cursor=<nextCursor>` cho tới khi `nextCursor` là `null` — **đừng** dừng theo `notes.length < limit`, vì note đã xoá mềm bị lọc sau khi đọc nên một trang có thể ngắn hơn `limit` mà vẫn còn trang sau.

Chỉ note tạo bằng token có `ownerEmail` (token cấp qua my.avada.net) mới vào list. Note đẩy bằng key dùng chung đời cũ không gắn `ownerEmail` nên không thuộc về ai và không bao giờ xuất hiện — cố ý, để một người cầm key chung không đọc được danh sách note của người khác. Token cũ gọi endpoint này nhận `403 insufficient_scope`.

`PUT`/`DELETE /api/notes/:id` cũng tồn tại, là alias của `/api/upload/:id` — CLI này vẫn dùng đường `/api/upload/:id`, không cần đổi.

Doc đầy đủ: `30-projects/notes.avada.net/_docs/API.md`.

## Changelog / lịch sử thay đổi (server tự render — KHÔNG inject vào content)

Backend notes.avada.net tự dựng section "Lịch sử thay đổi" (bảng collapsible) ở cuối mỗi note `.md` khi có update, gồm cột: `#`, Thời gian, Ai (tên gắn API key), Email (`X-Notes-Git-Email` = người sửa), Máy, IP, Client, LLM, Diff (`+thêm/-xoá` — server tự tính bằng `computeDiff` so blob cũ/mới), Loại (`--kind`), Tóm tắt (`--summary`).

Vì server tự tính diff từ blob, TUYỆT ĐỐI không tự chèn `## Changelog` hay bất cứ gì vào content khi update — sẽ làm bẩn blob và sai số dòng đổi. Chỉ cần gửi content sạch + `--summary` + `--kind`; "người thay đổi" và "số dòng" hiện tự động.

## Update / delete constraints (do backend enforce)

- Chỉ owner mới update hoặc delete được → lỗi `not_owner`. Owner tính theo `ownerEmail` của key nếu note có, ngược lại theo `keyId` đã tạo note (note cũ).
- Cửa sổ 24h kể từ lần update cuối; quá hạn → `update_window_expired`. Ràng buộc này chỉ áp cho update, không áp cho delete.
- Tối đa 100 update / 24h → `update_limit_reached` (kèm Retry-After).
- Không đổi được extension `.md ↔ .html` → `ext_mismatch`.
- Note không tồn tại, hoặc đã bị xoá trước đó → `note_not_found`.
- Xoá là soft delete: note trả 404 ngay, nhưng document và blob giữ 30 ngày rồi job `purgeDeletedNotes` xoá hẳn. Xoá lại chính note đó lần hai → `note_not_found`.

## Bảng lỗi và cách xử lý

| Mã lỗi backend | HTTP | Nghĩa và việc cần làm |
|---|---|---|
| `invalid_token` | 401 | Token sai định dạng hoặc không tồn tại. Lấy token mới ở my.avada.net, mục Notes key. |
| `token_revoked` | 401 | Token đã bị thu hồi, HOẶC đã hết ân hạn 24h sau khi rotate key. Backend cố tình không phân biệt hai trường hợp này (không rò thông tin vòng đời key), nên thông báo nêu cả hai: dùng token mới nhất, hoặc tạo key mới ở my.avada.net. |
| `insufficient_scope` | 403 | Token không có scope cho thao tác (vd master key chỉ có `keys:provision`). Dùng token cá nhân. Riêng `GET /api/notes`: token đời cũ không gắn `ownerEmail` sẽ luôn nhận lỗi này — xem mục "Liệt kê note của mình". |
| `not_owner` | 403 | Không phải chủ note. Chỉ người tạo note mới sửa hoặc xoá được. |
| `note_not_found` | 404 | Note không tồn tại hoặc đã bị xoá. |

## Required env vars

| Var | Required | Description |
|---|---|---|
| `NOTES_API_KEY` | Yes | Bearer token cá nhân, bắt đầu `notes_` (token cũ tiền tố `ans_` vẫn được backend chấp nhận, không bị ép đổi). Lấy ở my.avada.net → Notes key → "Tạo key của tôi". Key cũ cấp bằng `notes-admin create-key` vẫn chạy. |
| `NOTES_API_BASE` | No | Override API base. Default `https://notes.avada.net`. |

Mỗi Avader chỉ có 1 key active. Tạo key mới ở my.avada.net = rotate: key cũ còn hiệu lực 24h rồi tự mất tác dụng. Sau khi rotate, note tạo TRƯỚC khi tính năng master key live sẽ không sửa/xoá được nữa (`not_owner`) vì note đó gắn quyền theo key gốc chứ không theo email.

## Frontmatter (.md only, optional)

```yaml
---
title: My Note Title
created: 2026-05-19
---
```

## URL format

```
https://notes.avada.net/<id>.<ext>
```

`<id>` = 10-char base62 (legacy 32-char vẫn đọc được), `<ext>` = `md` | `html`. Chế độ thường không `#fragment`, không query. Private dùng URL server trả về; `--link-key` thêm fragment `#k=<khoá base64url>`.

## Exit codes

- 0: success (URL hoặc dòng `deleted ...` in ra stdout)
- 2: bad argument (thiếu file / `--kind` sai / id sai / `--update` kèm `--delete`)
- 3: file not found
- 4: unsupported extension (chỉ .md / .html)
- 5: frontmatter parse error
- 6: upload/network failed, hoặc lỗi 5xx từ server
- 7: update bị từ chối (owner/window/limit/ext/not-found/meta/token/scope)
- 8: `NOTES_API_KEY` thiếu
- 9: delete bị từ chối (not-found/owner/scope/token/rate-limit)

Mã 0 đến 8 giữ nguyên ngữ nghĩa như version 2.0.0 — script cũ không phải sửa.
