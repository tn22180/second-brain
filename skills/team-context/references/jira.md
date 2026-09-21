# Quy ước Jira — project FAL

Bản **tra cứu ngắn**. Muốn **tạo** issue → dùng skill `jira` (nó có script, metadata thật, guard draft→duyệt→POST). Đừng tự dựng payload từ file này.

- Base: `https://space.avada.net` · Project key **FAL** (id 10800).
- Issue type: **Task** (10001) · **Bug** (10310) · **Incurred** (10600, việc phát sinh ngoài kế hoạch) · **Sub-task** (10002, bắt buộc có task cha).

## Board

Task **định tuyến vào board team theo field `Falcon App`** — không phụ thuộc tên board. Bỏ trống Falcon App → task **không lên board team nào**, chỉ nằm ở Falcon Master board.

| Board | Team | Falcon App |
|---|---|---|
| Falcon Master board (id 10028) | cả Falcon | tất cả |
| `Board 1 _ Linh _ Tuân & Lâm` (id 10030) | Linh · Tuân · Lâm | Speed · SEO · AEO · Blog · APC |
| `Board 2 _ Nghĩa _ Tam` (id 10031) | Nghĩa · Tam | Feed · Ads · Pixels · Canva |

*(Tên board = tên object thật trong cấu hình Jira — dùng đúng tên này khi tìm board trên UI. Team gọi theo tên người phụ trách board.)*
*(⚠️ **"Organic" / "Paid" / "Optimize" là tên NHÓM nội bộ cũ, KHÔNG phải tên board** — đừng gọi board là "board Organic", Jira không có board nào tên vậy.)*
*(App **Team** = task nội bộ đội, không thuộc app nào — filter cả 2 board đều bắt, nên task Team lên cả 2 board.)*

**Gộp team 15/07/2026:** Falcon bỏ 3 board → còn 2. Board 3 (`Lâm _ Bách`, id 10032, team Speed) đã gộp vào Board 1, Speed dồn về đây, Tuân + Lâm cùng làm Tech Lead. 2 board team đều là **scrum**; sprint chạy **chung cả Falcon** — cùng 1 sprint active trên cả 2 board + Master board.

⚠️ **Sprint đổi mỗi 2 tuần — đừng tin số ghi trong tài liệu, đọc live:** `GET /rest/agile/1.0/board/10028/sprint?state=active`. *(Tại 04/09/2026: **Falcon Sprint 4** (Jira id 66), chạy 24/08–06/09.)*

📌 **Hai con số khác nhau, đừng nhầm:** `Falcon Sprint N` là **tên** team tự đặt (đếm 1, 2, 3…); `id` là **số nội bộ của Jira**, dùng chung toàn instance với Solar/AR/MT… nên nhảy cách. Map: Sprint 1 = id 59 · Sprint 2 = id 62 · Sprint 3 = id 64 · Sprint 4 = id 66. Trong tài liệu luôn viết dạng `Falcon Sprint N (Jira id XX)`.

## 10 Falcon App (option của field `Falcon App`, cf11203)

`SEO` · `Blog` · `APC` · `AEO` · `Feed` · `Ads` · `Pixels` · `Speed` · `Canva` · `Team`

*(App mới phát sinh → thêm option trong cấu hình field, không tự gõ tên khác. App ngoài 10 option này → Jira trả 400. `Team` = task nội bộ đội, không thuộc app nào — xem §Board.)*

## 12 status — ý nghĩa

| # | Status | Nghĩa |
|---|---|---|
| 1 | **To Do** | Chờ làm (task được tạo khi tài liệu đạt "sẵn sàng làm") |
| 2 | **Doing** | Dev đang code |
| 3 | **Waiting To Test** | Dev xong, chờ Tester nhận |
| 4 | **Test Staging** | Tester đang test trên staging |
| 5 | **Waiting For Review** | Chờ Tech Lead review code |
| 6 | **Reviewing** | Tech Lead đang review |
| 7 | **Review Done** | Review xong |
| 8 | **QA/ QC** | QA lead kiểm |
| 9 | **Waiting To Live** | Chờ deploy (Tech Lead bấm) |
| 10 | **Testing Production** | Test trên bản thật sau khi lên |
| 11 | **Done** | Chạy ổn định |
| 12 | **Archived** | Lưu trữ |

Áp cho **mọi issue type**, kể cả Sub-task.

## ⚠️ Bẫy: `Assignee` vs `Assignees` (cf10700)

| Field | ID | Số người | Nghĩa |
|---|---|---|---|
| **Assignee** | `assignee` | 1 (Jira cố định) | **Ai đang cầm task lúc này.** KHÔNG có trên form FAL → set qua nút Assign / "Assign to me" / kéo trên board |
| **Assignees** | `customfield_10700` | nhiều (mảng) | **Cả đội tham gia** (dev + tester + designer). Field custom của Falcon, CÓ trên form tạo issue |
| **Reporter** | `reporter` | 1 | Người tạo, Jira tự set; không có trên screen → không sửa được |

**Khi nào dùng cái nào:**
- Task **chuyển bước** → đổi **`Assignee`** theo người đang cầm (Dev xong → gán Tester). `Assignees` giữ nguyên cả đội.
- Tạo issue (kể cả qua skill `jira`) → điền **`Assignees`** (mảng, dùng mảng cả khi 1 người). Không nêu ai → mặc định **người tạo**.
- **Lọc/JQL phải bắt cả hai**, nếu không sẽ sót người: `assignee = currentUser() OR "Assignees" = currentUser()`. Quick filter "Only My Issues" trên 3 board (2 team + Master) đã sửa theo công thức này — trước đó chỉ lọc `assignee` nên ai chỉ được điền `Assignees` thì bấm ra rỗng.

## Naming Solar

```
[<ROLE>][<App>] <mô tả>
```
- `ROLE` ∈ **4 tag cố định**: `DEV` · `BUG` · `BA` · `DESIGN` — theo **vai trò phụ trách việc**, không phải theo giai đoạn. PO và BA đều dùng `BA`.
- `App` ∈ 10 Falcon App. **Không có app → bỏ hẳn `[App]`**: `[BA] Task tháng 7/2026`.
- Default: Task → `DEV` · Bug → `BUG` · task PO/BA → `BA` · task thiết kế → `DESIGN` (tự giao designer chung). User luôn override được.
- Ví dụ: `[DEV][Speed] Refactor lazyload` · `[BUG][Speed] Lazyload vỡ layout trên theme Dawn` · `[DESIGN][Speed] Thiết kế banner onboarding`.

## Field hay dùng

`Falcon App` cf11203 · `PRD` cf11201 (link GitLab, BA điền) · `Merge Request` cf10800 (Dev) · `Staging` cf11200 (Dev) · `BA Point` cf10701 (PO chấm) · `Dev Point` cf11204 & `Tester Point` cf11202 (TL chấm, Fibonacci 1–89) · `Designer Point` cf10702 (PO chấm) · `Due Date` + `Assignees` (TL gán).

## Ai làm được gì

- **Tạo issue:** chỉ project role **"Manager"** trên FAL — **10 người**: PO (linhnq) · 3 Tech Lead (lamln, tuannv, nghiavt) · 3 BA (bachdv, tamnc, anhbl — `anhbl` thêm 04/09/2026) · 3 Tester (tranggt, dungtt, trangdt — để tự file Bug). Người ngoài list **không tạo được issue nào** (Jira: create là tất-cả-hoặc-không) → báo qua Lead.
- **Xem / sửa / gán / kéo status / comment:** cả team.
- **Xoá issue / admin project:** super admin.

## Sub-task vs Linked Issues
- **Sub-task** = việc con thuộc hẳn 1 task cha, không đứng riêng trên board; kế thừa app của cha.
- **Linked Issues** = nối 2 task độc lập. Link type mặc định `Relates`; còn `Blocks`, `Duplicate`, `Problem/Incident`…

**Tạo task, tạo bug, tạo loạt bug link về 1 task** → skill `jira`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
| 2026-07-16 | LamLN | Gộp team: 3 board → 2 (Board 3 Speed gộp vào Board 1); bảng board 2 dòng, team gọi theo tên người; sprint chạy chung Falcon (59) |
| 2026-07-22 | LamLN | Sửa review: Falcon App là **10** option chứ không phải 9 — thiếu `Team` (xác nhận qua `jira-metadata.json.falconApps`), gây hiểu nhầm `Team` là app không hợp lệ |
| 2026-08-14 | LinhNQ | Bỏ tên team cũ '(gộp Speed + Organic)' / '(Paid)' ở bảng board |
