---
title: "Create — tạo issue Jira Falcon"
audience: dev
updated: 2026-08-12
related: [core.md, operate.md, ../SKILL.md]
---

# Create — tạo issue Jira Falcon

Đọc `core.md` trước. Đây là quy trình DUY NHẤT (không còn tách theo role). Mọi field tự chọn,
naming Solar, guard an toàn draft→duyệt→POST giữ nguyên. Điểm mới so với bản cũ: **bước hỏi link**.

## Quy trình
1. **Đọc metadata** (`jira-metadata.json`; thiếu → chạy `probe.mjs`).
2. **Xác định issuetype** từ lệnh (mặc định **Task** nếu user không nêu):
   - "task" → `issueTypes.Task` (10001)
   - "bug" → `issueTypes.Bug` (10310) — đi tiếp **Bước 2b** để phân nhánh trước khi set issuetype thật.
   - "sub-task"/"task con" → `issueTypes["Sub-task"]` (10002) — bắt buộc có `parentKey`; hỏi user mã cha nếu chưa nêu.
     **Ngoại lệ:** nếu mô tả rõ ràng là một cái bug (user gõ "sub-task"/"task con" nhưng nội dung là lỗi) →
     agent **cảnh báo**: "bug nên dùng Bug + link Blocks tới task gốc thay vì Sub-task". User vẫn khăng khăng
     muốn Sub-task → tạo Sub-task như cũ (quyết định của user, không chặn cứng).

### Bước 2b — Phân nhánh bug (CHỈ chạy khi đang tạo là bug)

Việc đang tạo là một cái bug (user gõ "bug", "lỗi", hoặc mô tả là lỗi) → hỏi 1 câu bắt buộc trước khi
đi tiếp:

> "Bug này khách báo trên production, hay bug của feature đang phát triển?"

Rồi áp đúng 1 trong 2 nhánh:

| | Nhánh A — khách báo trên production | Nhánh B — feature đang phát triển |
|---|---|---|
| issuetype | `Task` (`10001`) | `Bug` (`10310`) |
| summary | `[BUG][<App>] <mô tả>` | `[BUG][<App>] <mô tả>` |
| link | KHÔNG link | `linkToKey` = task feature gốc, `linkType: "Blocks"`, `linkDirection: "outward"` (bug **blocks** task gốc) |
| description | bắt buộc có dòng `Thread Slack: <permalink>` | trỏ rõ task gốc |

- **Nhánh A dùng issuetype `Task`** nhưng prefix summary vẫn là `[BUG]` (KHÔNG phải `[DEV]` mặc định
  của Task ở bước 3 naming Solar) — đây là ngoại lệ có chủ ý, để phân biệt trên board bug-từ-production
  với task thường.
- **Nhánh B phải resolve task gốc:** user đưa thẳng mã `FAL-xxx` → dùng luôn. User chỉ mô tả/keyword →
  chạy `node $ENGINE_DIR/scripts/jira.mjs search "project = FAL AND summary ~ '<keyword>' ORDER BY updated DESC" 15`
  (như bước 4 mô tả) → in danh sách cho user chọn, KHÔNG tự đoán khi nhiều kết quả.
- **Bước 4 (hỏi link chung) PHẢI SKIP khi đã đi nhánh bug** — nhánh đã quyết link rồi (A: không link,
  B: Blocks outward tới task gốc). Câu hỏi mơ hồ "Task này có cần link tới task nào không?" chính là chỗ
  khiến agent trước đây tạo nhầm Sub-task thay vì Bug + link Blocks — giữ nguyên chỗ skip này, đừng gỡ ra.

3. **Clarify gate (core.md):** chỉ hỏi field BẮT BUỘC không suy được — Task/Bug chỉ cần `summary`; Sub-task thêm `parent`. Optional để trống.
   - Field optional user CÓ THỂ tự thêm (chỉ set khi user nêu): `app` (Falcon App — đối chiếu 10 option trước khi set), `description`, `priorityName`, `assignees` (nhiều người), `devPoint`, `testerPoint`, `dueDate`.
   - **Assignee KHÔNG optional-bỏ-qua:** user nêu ai làm → set `assignee`/`assignees`; không nêu → KHÔNG hỏi, để trống, script tự mặc định = người tạo (core.md §Assignee bắt buộc).
   - Không set app → nhắc hệ quả Master board (core.md §Clarify gate).
   - **Naming (Solar, core.md §Quy tắc đặt tên):** agent tự dựng `summary` theo `[<ROLE>][<App>] <mô tả>` —
     ROLE ∈ `DEV`/`BUG`/`BA`/`DESIGN`, mặc định theo issuetype (Task→`DEV`, Bug→`BUG`); task thiết kế →
     `DESIGN` (giao designer chung). Thiếu app → bỏ `[App]`. Hiển thị ở DRY-RUN, user sửa được.
4. **HỎI LINK (bắt buộc hỏi 1 lần):** ⚠️ **SKIP bước này nếu đã đi nhánh bug ở Bước 2b** — nhánh đã
   quyết link rồi (xem lý do skip ở cuối Bước 2b). Chỉ hỏi khi issuetype KHÔNG phải bug đi qua 2b.
   Trước khi DRY-RUN, hỏi rõ:
   > "Task này có cần link tới task nào không?"
   - User nói **không** (hoặc "tạo lẻ"/"không cần") → bỏ `linkToKey`, tạo issue không link.
   - User nói **có** → resolve task đích + link type:
     - **Task đích:** user đưa thẳng mã `FAL-xxx` → dùng luôn. User chỉ mô tả/keyword → chạy
       `node $ENGINE_DIR/scripts/jira.mjs search "project = FAL AND summary ~ '<keyword>' ORDER BY updated DESC" 15`
       → in danh sách `KEY  summary` cho user chọn. Không tự đoán khi có nhiều kết quả.
     - **Link type:** mặc định `Relates` (quan hệ chung). Nếu user nêu ý ("chặn"/"block", "trùng"/"duplicate",
       "gây ra"/"nguyên nhân") map sang `Blocks`/`Duplicate`/`Problem/Incident`. Danh sách đầy đủ ở
       `jira-metadata.json.issueLinkTypes` — chỉ dùng `name` có thật trong đó.
     - Set `linkToKey: "FAL-xxx"` + `linkType: "<name>"` vào payload (mặc định `Relates` nếu user không nêu type).
   - Lưu ý: link được tạo **sau khi POST issue** (Jira Server không nhận issuelinks lúc create) — nếu link
     lỗi, issue vẫn đã tạo; script in `WARN link fail`, báo user để link tay.
5. **HỎI SPRINT (bắt buộc hỏi 1 lần):** trước khi DRY-RUN, hỏi rõ:
   > "Đưa vào sprint hiện tại hay để backlog?"
   - User nói **backlog** (hoặc im/"để đó"/"chưa") → KHÔNG set gì, issue nằm ở backlog (mặc định).
   - User nói **sprint hiện tại** → set `addToActiveSprint: true`. Script tự resolve sprint đang chạy
     của FAL lúc tạo (Falcon chạy 1 sprint chung cả project nên thường chỉ 1 sprint active).
   - User nêu **sprint cụ thể** (số/tên) → chạy `node $ENGINE_DIR/scripts/jira.mjs sprints` để lấy `id`, rồi set
     `sprintId: <id>` tường minh. Cũng dùng cách này khi có **>1 sprint active** (script báo mơ hồ) — in
     danh sách cho user chọn, đừng tự đoán.
   - Sprint là **tuỳ chọn mức lô** (batch dùng chung 1 đích): đặt `addToActiveSprint`/`sprintId` ở field
     chung (`{ issues:[...], addToActiveSprint:true }`), không lặp từng issue.
   - Lưu ý: issue được đưa vào sprint **sau khi POST** (giống link). Không có/nhiều sprint active hoặc move
     lỗi → issue **vẫn đã tạo**, giữ ở backlog; script in `WARN sprint ...`, báo user kéo tay.
6. **DRY-RUN** payload → hiển thị bảng cho user (naming + assignee mặc định + link đích/type + đích sprint nếu có) → chờ xác nhận.
7. Xác nhận → chạy `--confirm` → in mã `FAL-xxx` + link `$BASE/browse/FAL-xxx` + board + `LINKED …` /
   `SPRINT: …` nếu có.
8. **Chưa xong ở đây.** Hỏi tiếp một câu: "kéo status / gán sprint / link tới task nào nữa không?"
   Có → sang `operate.md`. Issue vừa tạo có `reporter` = người tạo nên thuộc **T1**: kéo status chạy
   thẳng, không phải duyệt lại.

## Batch — tạo NHIỀU issue 1 lượt
Không giới hạn 1 issue/lượt. `create-issue.mjs` nhận 3 dạng stdin (xem `normalizeBatchInput`):
- **1 object** `{...}` → 1 issue (như cũ).
- **Mảng** `[{...}, {...}]` → mỗi phần tử 1 issue độc lập.
- **`{ issues: [...], ...common }`** → mọi field NGOÀI `issues` là **dùng chung**, merge vào từng issue
  (field riêng của issue THẮNG khi trùng). Gọn cho ca nhiều issue chia sẻ field.

Ca điển hình — **Tester: 1 file test nhiều bug, cùng link về 1 task:**
```json
{
  "issuetypeId": "10310",
  "app": "Speed",
  "linkToKey": "FAL-123",
  "linkType": "Relates",
  "issues": [
    { "summary": "[BUG][Speed] Lazyload vỡ layout theme Dawn" },
    { "summary": "[BUG][Speed] Ảnh WebP không load trên Safari 15" },
    { "summary": "[BUG][Speed] CLS tăng khi bật preload" }
  ]
}
```
→ tạo 3 Bug, cả 3 kế thừa `app`/`linkToKey`/`linkType`, mỗi Bug tự link về `FAL-123`.

**Quy tắc batch:**
- DRY-RUN in **tất cả** payload (đánh số `issue i/N`) → user duyệt 1 lần cho cả lô.
- `--confirm` tạo tuần tự; **1 issue lỗi KHÔNG dừng cả lô** — issue sau vẫn chạy, cuối in
  `BATCH: x/N thành công, y lỗi`. Báo user rõ cái nào fail để xử lý lại (không tạo trùng cái đã thành công).
- `GET /myself` chỉ gọi 1 lần cho cả lô (cache). Mỗi issue vẫn áp assignee mặc định + naming Solar riêng.
- Muốn cụm cha–con (task tháng + sub-task) → set `parentKey` chung/riêng trong `issues`.

## Ghi chú
- Toàn bộ field engine (`assignees`, `devPoint`, `testerPoint`, `dueDate`, `parentKey`, `linkToKey`,
  `linkType`, `linkDirection`, `sprintId`, `addToActiveSprint`) đều optional — dùng khi user nêu, không ép
  hỏi theo vai trò. Riêng **hỏi link** và **hỏi sprint** là 2 câu BẮT BUỘC hỏi 1 lần trước DRY-RUN (mặc
  định: không link, backlog; nhánh bug ở Bước 2b thì tự quyết, không hỏi lại).
  `linkDirection: "outward"` = issue mới là **outwardIssue** (đảo chiều mặc định) — dùng cho nhánh B
  (Bug **blocks** task gốc); không nêu → mặc định `"inward"` (issue mới là inwardIssue, hành vi gốc).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
| 2026-07-16 | LamLN | Thêm bước 5 hỏi sprint (sprint hiện tại / backlog); field `sprintId`/`addToActiveSprint`; move sau POST |
| 2026-07-22 | LamLN | Đổi tên từ `playbook.md`; `search.mjs`/`sprints.mjs` → verb `jira.mjs search`/`jira.mjs sprints`; bước 8 nối nhịp sang `operate.md` |
| 2026-07-22 | LamLN | Sửa review: thêm frontmatter (thiếu, vi phạm luật repo); số option Falcon App 9 → 10 (đúng theo `jira-metadata.json`, có `Team`) |
| 2026-08-12 | LamLN | Thêm Bước 2b phân nhánh bug (production → Task không link / feature đang phát triển → Bug + link Blocks outward tới task gốc); bước 2 cảnh báo khi user gõ sub-task nhưng mô tả là bug; bước 4 (hỏi link chung) skip khi đã đi nhánh bug; ghi chú thêm field `linkDirection` |
