---
title: "Operate — đọc, sửa, xoá issue Jira Falcon"
audience: dev
updated: 2026-07-22
related: [core.md, create.md, ../SKILL.md]
---

# Operate — thao tác issue đã tồn tại

Tạo issue mới → `create.md`. File này cho mọi việc còn lại. Token/base URL/guard chung → `core.md`.

Một entrypoint duy nhất:

    node "$ENGINE_DIR/scripts/jira.mjs" <verb> [đối số] [--confirm] [--force]

Exit code: `0` ok hoặc dừng ở draft · `1` sai đối số · `2` lỗi API · `3` thiếu token.

## Đọc (T0 — chạy thẳng, đừng hỏi người dùng)

| Việc | Lệnh |
|---|---|
| Xem 1 hay nhiều issue | `jira.mjs get FAL-279,FAL-280` |
| Tìm theo JQL | `jira.mjs search "project = FAL AND status = Doing" 50` |
| Sprint đang chạy + id | `jira.mjs sprints` |
| Toàn bộ sprint hiện tại | `jira.mjs board` |
| Nước đi hợp lệ (1 hay nhiều issue) | `jira.mjs transitions FAL-279,FAL-280` |
| Issue type / app / status / field id | `jira.mjs meta` |

## Ghi

| Việc | Lệnh |
|---|---|
| Kéo status | `jira.mjs transition FAL-280,FAL-281 Done` |
| Gán người | `jira.mjs assign FAL-279 lamln,dungtt` |
| Vào sprint / về backlog | `jira.mjs sprint FAL-279 --active` · `--id=59` · `--backlog` |
| Sửa field | `echo '{"devPoint":3,"dueDate":"2026-08-01"}' \| jira.mjs update FAL-279` |
| Comment | `jira.mjs comment FAL-279 "đã deploy staging"` |
| Đính kèm | `jira.mjs attach FAL-279 ./evidence-1.png ./evidence-2.png` |
| Link | `jira.mjs link FAL-280 Relates FAL-279` |
| Xoá (T3) | `jira.mjs delete FAL-285 --confirm` |
| Ca lạ | `echo '{"fields":{…}}' \| jira.mjs raw PUT /issue/FAL-279` |

**Verb ghi theo lô** (`transition`, `update`, `assign`, `comment`, `delete`) nhận nhiều key phẩy-ngăn.
**`attach` và `link` chỉ nhận đúng 1 key** (`link` là 1 key nguồn + 1 key đích) — đưa nhiều key vào 2 verb
này sẽ báo lỗi `MULTI_KEY_UNSUPPORTED` (exit 1), không âm thầm chỉ chạy phần tử đầu rồi bỏ phần còn lại.
Tầng của cả lô = tầng **nghiêm nhất** trong lô: lô có một issue của người khác thì cả lô phải duyệt.
Verb đọc `transitions` cũng nhận nhiều key phẩy-ngăn (không có khái niệm tầng — verb đọc chạy thẳng):
in một khối riêng cho từng issue, một issue lỗi (404, không quyền…) chỉ báo lỗi cho issue đó rồi chạy
tiếp, không dừng cả lô.

## Ba điều hay sai

1. **Status "In Progress" không tồn tại trên board FAL** — tên đúng là **Doing**. Gõ sai thì script in
   danh sách nước đi hợp lệ của đúng issue đó; đọc rồi gõ lại, đừng đoán tiếp.
2. **Đừng nhớ field id bằng đầu.** Truyền tên (`app`, `devPoint`, `assignees`), script tự dịch. Sprint
   ở instance này là `customfield_10101`, **không** phải `customfield_10004` của Jira Cloud — đoán nhầm
   thì đọc ra rỗng mà không báo lỗi.
3. **`--force` chỉ bỏ qua T2, không bỏ qua T3.** `delete` và `unlink` luôn phải `--confirm`.

## Khi script dừng ở DRAFT

In `DRAFT [T2]` hoặc `DRAFT [T3]` = **chưa ghi gì lên Jira**. Đưa nguyên draft cho người dùng xem, chờ
đồng ý rõ ràng, rồi chạy lại y hệt lệnh đó kèm `--confirm`. Không tự thêm `--confirm` ngay lần đầu.

**Ngược lại: KHÔNG thấy `DRAFT [...]` nghĩa là ĐÃ GHI RỒI** (thấy `MOVED`/`ASSIGNED`/`COMMENTED`/
`LINKED`/... in thẳng ra) — không phải "lệnh chưa chạy" hay "chạy thử để xem trước". Verb ghi trên issue
của chính mình (tầng T1) luôn đi thẳng vào nhánh này, kể cả khi không có `--confirm`. Xem cảnh báo đầy đủ
+ ca sự cố thật ở `core.md §An toàn` mục 3.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-22 | LamLN | Tạo mới — quy trình đọc/sửa/xoá issue sau khi mở rộng skill jira |
| 2026-07-22 | LamLN | Sửa review: "mọi verb ghi nhận nhiều key" là SAI — `attach`/`link` chỉ nhận 1 key, đưa nhiều key báo lỗi `MULTI_KEY_UNSUPPORTED` thay vì âm thầm chỉ chạy phần tử đầu |
| 2026-07-22 | LamLN | Sửa review: `transitions` (đọc) từng destructure `const [key] = parseKeys(...)` nên nhiều key phẩy-ngăn chỉ chạy issue đầu, im lặng bỏ phần còn lại — nay chạy cả lô như `get`, mỗi issue một khối, lỗi 1 issue không dừng lô |
