---
title: support-handoff — pipeline chi tiết (7 bước)
audience: dev
updated: 2026-07-17
related: [prerequisites, roster, render-slack]
---

# Pipeline — support-handoff

> Quy trình đầy đủ đứng sau `SKILL.md`. File này tự đủ: mỗi bước ghi rõ đầu vào lấy đâu, chạy lệnh gì, đọc field nào của JSON trả về, và xử lý lỗi/nhánh thế nào — không cần đọc code script để chạy được.
>
> Chưa cài token → dừng lại đọc [`prerequisites.md`](prerequisites.md) trước. Toàn bộ lệnh dưới chạy với `node $DIR/scripts/<file>.mjs ...`, `$DIR` = thư mục skill này.

## 1. Intake — dev dán link

Dev dán **1 link** (Slack permalink của tin/thread, link Jira, hoặc key trần `FAL-xxx`).

```bash
node $DIR/scripts/parse-link.mjs "<link dev dán>"
```

3 dạng output có thể gặp:

| `type` | Ví dụ input | Output |
|---|---|---|
| `slack` | `https://avada.slack.com/archives/C0ABC123/p1699999999123456` | `{"type":"slack","channel":"C0ABC123","ts":"1699999999.123456","threadTs":"1699999999.123456"}` |
| `jira` | `FAL-231` hoặc `https://space.avada.net/browse/FAL-231` | `{"type":"jira","key":"FAL-231"}` |
| `unknown` | link lạ / không khớp 2 dạng trên | `{"type":"unknown","raw":"<nguyên văn>"}` |

- `type:"unknown"` → báo dev link không nhận diện được, xin dán lại (permalink Slack lấy qua **chuột phải tin → Copy link**; nếu là reply trong thread thì permalink có kèm `?thread_ts=...` — script đã tự lấy đúng `threadTs` gốc thay vì `ts` của riêng reply đó).

## 2. Context — ra được Jira key + nội dung khách + (nếu có) toạ độ thread Slack

Nhánh theo `type` ở bước 1. **Mục tiêu cuối bước này: có đủ `channel` + `threadTs` (để post reply) VÀ 1 Jira `key` (để đổi status)** — thiếu bên nào phải hỏi dev bù vào trước khi qua bước 5.

### Nhánh Slack (`type:"slack"`)

```bash
node $DIR/scripts/read-thread.mjs "<channel>" "<threadTs>"
```

Output: `{"messages":[{"user":"U0123","text":"...","ts":"..."}...],"jiraKeys":["FAL-231"]}`.

- Đọc `messages[].text` để lấy nội dung khách báo (tóm tắt ở bước 3).
- Đọc `jiraKeys` (đã dedup, ưu tiên key trong link `/browse/`, fallback key trần dạng `FAL-<số>`):
  - **0 key** → thread không nhắc Jira nào → hỏi dev dán tay key task (rồi chạy `fetch-task.mjs` như nhánh Jira dưới để lấy `summary/status/mergeRequestRaw/description`).
  - **1 key** → dùng luôn, chạy tiếp `fetch-task.mjs <key>`.
  - **≥2 key** → in danh sách, hỏi dev chọn đúng key của task đang xử lý (thread support đôi khi nhắc chéo nhiều task).
- Lỗi thường gặp: `SLACK_conversations.replies_ERROR: not_in_channel` (bạn chưa join kênh) — xem bảng troubleshooting ở `prerequisites.md`.

### Nhánh Jira (`type:"jira"`)

```bash
node $DIR/scripts/fetch-task.mjs "<key>"
```

Output: `{"key":"FAL-231","summary":"...","status":"In Progress","mergeRequestRaw":"...|null","description":"..."}`.

- Đọc `description` để lấy nội dung khách báo (tóm tắt ở bước 3) — nếu mô tả sơ sài, hỏi dev bổ sung ngữ cảnh.
- Nhánh này **không tự có `channel`/`threadTs`** (không xuất phát từ thread Slack). Trước khi qua bước 6/7 (post reply), phải hỏi dev dán thêm **link Slack của thread support gốc** rồi chạy lại `parse-link.mjs` trên link đó để lấy `channel`/`threadTs` — không được bịa/chọn kênh khác. Nếu dev xác nhận task này **không có** thread Slack gốc (task nội bộ), bỏ qua bước 7 phần post Slack, chỉ còn phần đổi status (ghi rõ trong báo cáo cuối).

## 3. Tóm tắt — in cho dev xem

Không gọi script — agent tự tóm tắt 2-4 câu từ `messages[].text` (nhánh Slack) hoặc `description` (nhánh Jira): khách gặp vấn đề gì, môi trường/app nào, mức độ ảnh hưởng nếu thấy rõ. In ra cho dev xác nhận đã hiểu đúng trước khi qua bước 4.

## 4. Fix (tuỳ chọn)

Hỏi dev: *"Cần agent hỗ trợ tìm/fix code không, hay anh tự làm rồi báo em khi xong?"*

- Dev tự làm → agent chờ, không tự ý đọc/sửa code ngoài phạm vi được yêu cầu.
- Dev nhờ hỗ trợ → làm trong đúng phạm vi task này (đọc code, đề xuất fix); **không đụng production** — nằm ngoài scope draft-first của skill này (guard `SKILL.md`).

Dev báo "xong"/"done" → qua bước 5.

## 5. Done → gom info

Cần gom đủ 3 thứ trước khi render draft: **MR**, **deploy target**, **người tag**.

### 5a. Tìm MR

```bash
node $DIR/scripts/fetch-task.mjs "<key>" | node $DIR/scripts/resolve-mr.mjs
```

(`resolve-mr.mjs` đọc `mergeRequestRaw` + `description` từ stdin — nếu bước 2 đã chạy `fetch-task.mjs` rồi thì tái dùng JSON đó luôn, không cần fetch lại.)

Output: `{"found":true,"projectPath":"avada/speed","mrIid":"224","webUrl":"https://gitlab.com/avada/speed/-/merge_requests/224","reason":"field"}` hoặc `{"found":false,"reason":"not_found"}`.

- `reason:"field"` — lấy từ field Jira "Merge Request", tin cậy nhất.
- `reason:"description"` — không có trong field, tìm thấy link MR trong mô tả task.
- `found:false` (`reason:"not_found"`) — hỏi dev dán tay link MR; nếu task không có MR (không sửa code) → bỏ dòng `*MR:*` khi render (xem `render-slack.md`).

### 5b. Hỏi deploy target

Hỏi thẳng dev: *"Đã deploy lên đâu — staging, production, hay cả hai?"* Không tự suy đoán từ trạng thái Jira hay nhánh git.

### 5c. Chọn Tech Lead + Tester

```bash
node $DIR/scripts/roster.mjs --role techlead --board <board1|board2>
node $DIR/scripts/roster.mjs --role tester --board <board1|board2>
```

In bảng tab-separated `board  role  jiraUsername  name  <@UID hoặc tên thường>`. Không biết board của task → chạy không kèm `--board` để liệt kê hết, hỏi dev chọn theo board đúng của app đang xử lý. Biết sẵn username Jira → `--user <username>` (đừng tra theo tên: `tranggt` ≠ `trangdt`). Danh sách rỗng theo filter → in `(roster rỗng theo filter)`, hỏi dev kiểm lại role/board trong `nhan-su/roster.json`.

Cuối output, script cảnh báo `⚠️ Chưa có slackUid: ...` → người đó sẽ được tag bằng **tên thường**, Slack không resolve thành mention. Báo dev biết và gợi ý bổ sung UID theo [`roster.md`](roster.md).

- Lỗi `MISSING_ROSTER` → không đọc được `nhan-su/roster.json` (bản cài hỏng), dừng và trỏ dev sang [`roster.md`](roster.md).
- Lỗi `ROSTER_INVALID` → `roster.json` sai cấu trúc (thiếu mảng `members`), cùng trỏ tài liệu trên.

Dev chọn xong 1 Tech Lead + 1 Tester (theo `slackUid`) → sang bước 6.

## 6. Draft — render và chờ duyệt

Render tin theo đúng template + quy tắc ở [`render-slack.md`](render-slack.md), dùng dữ liệu đã gom: tóm tắt (bước 3), `webUrl` (5a), deploy target (5b), `JIRA_BASE` + `key` (bước 2), UID Tech Lead + Tester (5c).

**In nguyên văn draft ra chat** (đúng như sẽ post, không tóm tắt lại) rồi hỏi dev duyệt — vd: *"Đúng chưa anh? Gõ "ok"/"post" để em đăng, hoặc sửa chỗ nào cần chỉnh."*

Đây là **guard draft-first bắt buộc** (`SKILL.md`) — tuyệt đối không tự động qua bước 7 khi chưa có xác nhận rõ ràng bằng lời của dev.

## 7. Post & status — dev duyệt rồi mới chạy thật

Dev gõ "ok"/"post" (hoặc tương đương rõ ràng) →

### 7a. Post Slack

```bash
echo "<nội dung draft đã duyệt>" | node $DIR/scripts/post-slack.mjs --channel "<channel>" --thread "<threadTs>" --confirm
```

- Không có `--confirm` → chỉ in `[DRY-RUN] ...` (dùng để soát trước khi hỏi duyệt nếu muốn double-check định dạng, không bắt buộc — bước 6 đã in draft rồi).
- Có `--confirm` → post thật, in `POSTED Slack reply ts=<ts>` kèm permalink tin vừa đăng (nếu lấy permalink thất bại, permalink là phụ, vẫn coi là post thành công miễn có dòng `POSTED`).
- Lỗi (network/token/`channel`+`thread` thiếu, `EMPTY_BODY`) → **dừng ngay, không chạy 7b**, báo lỗi cho dev, giữ nguyên draft để dev sửa/thử lại.

### 7b. Đổi status Jira — CHỈ sau khi 7a thành công

```bash
node $DIR/scripts/set-status.mjs --key "<key>" --confirm
```

(Mặc định `--to` là `"Waiting to test"` — chỉ truyền `--to` khác nếu Tech Lead xác nhận workflow team dùng tên transition khác, xem `prerequisites.md`.)

3 nhánh theo exit code:

| Exit | Ý nghĩa | Agent làm gì |
|---|---|---|
| 0 | Chuyển status thành công (hoặc dry-run nếu thiếu `--confirm`) | In `MOVED <key> → "Waiting to test"`, ghi ✅ vào báo cáo cuối. |
| 1 | Lỗi API Jira (token sai/hết hạn, network...) | Báo lỗi cho dev, ghi ❌ + lý do vào báo cáo cuối. Slack đã post rồi nên **không rollback** — dev tự đổi status tay. |
| 2 | Không có transition phù hợp (`NO_TRANSITION_TO`) — **non-fatal** | KHÔNG dừng luồng, in cảnh báo, ghi vào báo cáo cuối "chưa đổi được status — tự đổi tay" kèm danh sách transition khả dụng script đã in ra. |

## Báo cáo cuối

Sau bước 7 (dù 7b có đổi được status hay không), in bảng tổng kết:

| Task | Tóm tắt | MR | Deploy | Đã post Slack? | Status → Waiting to test? | Ghi chú |
|---|---|---|---|---|---|---|
| FAL-231 | Ảnh không nén được, lỗi 500 khi bulk >50 ảnh | [MR 224](https://gitlab.com/avada/speed/-/merge_requests/224) | staging | ✅ (ts 1700000001.000100) | ✅ | — |

Cột "Ghi chú" dùng cho các trường hợp lệch chuẩn: không có MR (không sửa code), không có thread Slack gốc (chỉ đổi status), exit 2 của `set-status.mjs` (liệt kê transition khả dụng), lỗi 7a khiến dừng sớm (ghi rõ dừng ở đâu).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo file — mở rộng 7 bước từ SKILL.md: lệnh cụ thể, ví dụ input/output JSON, nhánh Slack/Jira, xử lý MR not-found, 3 nhánh exit code của set-status.mjs, format báo cáo cuối |
| 2026-07-21 | LamLN | Bước gom info: `roster.mjs` đọc nguồn chung `nhan-su/roster.json`, thêm `--user <jiraUsername>`, cảnh báo người chưa có `slackUid` |
