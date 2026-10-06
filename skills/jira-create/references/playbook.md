# Playbook — tạo một issue Jira Falcon

Đọc `core.md` trước. Đây là quy trình DUY NHẤT (không còn tách theo role). Mọi field tự chọn,
naming Solar, guard an toàn draft→duyệt→POST giữ nguyên. Điểm mới so với bản cũ: **bước hỏi link**.

## Quy trình
1. **Đọc metadata** (`jira-metadata.json`; thiếu → chạy `probe.mjs`).
2. **Xác định issuetype** từ lệnh (mặc định **Task** nếu user không nêu):
   - "task" → `issueTypes.Task` (10001)
   - "bug" → `issueTypes.Bug` (10310)
   - "sub-task"/"task con" → `issueTypes["Sub-task"]` (10002) — bắt buộc có `parentKey`; hỏi user mã cha nếu chưa nêu.
3. **Clarify gate (core.md):** chỉ hỏi field BẮT BUỘC không suy được — Task/Bug chỉ cần `summary`; Sub-task thêm `parent`. Optional để trống.
   - Field optional user CÓ THỂ tự thêm (chỉ set khi user nêu): `app` (Falcon App — đối chiếu 9 option trước khi set), `description`, `priorityName`, `assignees` (nhiều người), `devPoint`, `testerPoint`, `dueDate`.
   - **Assignee KHÔNG optional-bỏ-qua:** user nêu ai làm → set `assignee`/`assignees`; không nêu → KHÔNG hỏi, để trống, script tự mặc định = người tạo (core.md §Assignee bắt buộc).
   - Không set app → nhắc hệ quả Master board (core.md §Clarify gate).
   - **Naming (Solar, core.md §Quy tắc đặt tên):** agent tự dựng `summary` theo `[<ROLE>][<App>] <mô tả>` —
     ROLE ∈ `DEV`/`BUG`/`BA`/`DESIGN`, mặc định theo issuetype (Task→`DEV`, Bug→`BUG`); task thiết kế →
     `DESIGN` (giao designer chung). Thiếu app → bỏ `[App]`. Hiển thị ở DRY-RUN, user sửa được.
4. **HỎI LINK (bắt buộc hỏi 1 lần):** trước khi DRY-RUN, hỏi rõ:
   > "Task này có cần link tới task nào không?"
   - User nói **không** (hoặc "tạo lẻ"/"không cần") → bỏ `linkToKey`, tạo issue không link.
   - User nói **có** → resolve task đích + link type:
     - **Task đích:** user đưa thẳng mã `FAL-xxx` → dùng luôn. User chỉ mô tả/keyword → chạy
       `node $ENGINE_DIR/scripts/search.mjs "project = FAL AND summary ~ '<keyword>' ORDER BY updated DESC" 15`
       → in danh sách `KEY  summary` cho user chọn. Không tự đoán khi có nhiều kết quả.
     - **Link type:** mặc định `Relates` (quan hệ chung). Nếu user nêu ý ("chặn"/"block", "trùng"/"duplicate",
       "gây ra"/"nguyên nhân") map sang `Blocks`/`Duplicate`/`Problem/Incident`. Danh sách đầy đủ ở
       `jira-metadata.json.issueLinkTypes` — chỉ dùng `name` có thật trong đó.
     - Set `linkToKey: "FAL-xxx"` + `linkType: "<name>"` vào payload (mặc định `Relates` nếu user không nêu type).
   - Lưu ý: link được tạo **sau khi POST issue** (Jira Server không nhận issuelinks lúc create) — nếu link
     lỗi, issue vẫn đã tạo; script in `WARN link fail`, báo user để link tay.
5. **DRY-RUN** payload → hiển thị bảng cho user (naming + assignee mặc định + link đích/type nếu có) → chờ xác nhận.
6. Xác nhận → chạy `--confirm` → in mã `FAL-xxx` + link `$BASE/browse/FAL-xxx` + board + dòng `LINKED ...` nếu có link.

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
  `linkType`) đều optional — dùng khi user nêu, không ép hỏi theo vai trò.
