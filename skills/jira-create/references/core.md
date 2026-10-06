# Core — lõi chung mọi role

## Đường dẫn engine — `$ENGINE_DIR`
Mọi lệnh/tham chiếu dưới đây ghi `$ENGINE_DIR/...` = **thư mục skill `jira-create`** (engine: scripts,
references, metadata, roster). `$ENGINE_DIR` = base directory của skill (dòng *"Base directory for this
skill"* ở đầu context).

Khi chạy script, thay `$ENGINE_DIR` bằng đường dẫn tuyệt đối đó (bọc trong nháy kép nếu path có dấu
cách). Cách này portable: cài personal (`~/.claude/skills/`) hay theo project đều đúng.

## Kết nối
- Base: `https://space.avada.net` (hoặc `JIRA_BASE_URL`). REST v2. Auth `Bearer $JIRA_TOKEN`.
- Token đọc từ **`.env` trong skill** (`$ENGINE_DIR/.env`, `JIRA_TOKEN=...`) — không phụ thuộc thư mục
  nơi gọi Claude. Thứ tự tìm: biến môi trường `process.env.JIRA_TOKEN` → `$ENGINE_DIR/.env` → `.env` ở
  cwd (fallback). Thiếu cả → `MISSING_JIRA_TOKEN`.
- Metadata thật: `jira-metadata.json` (sinh bởi `scripts/probe.mjs`). KHÔNG hardcode field ID theo trí nhớ — luôn đọc file này.
- Không có file metadata → chạy: `PROBE_DATE=<hôm nay> node scripts/probe.mjs` (read-only) rồi đọc lại.

## An toàn (BẮT BUỘC)
1. **project=FAL cứng.** `create-issue.mjs` tự guard; đừng bao giờ truyền project khác.
2. **Chỉ create.** Không update/delete/config trong luồng skill. (Là giới hạn *thiết kế skill*, xem rule 5 — KHÔNG phải giới hạn năng lực của agent.)
3. **Không auto-POST.** Trình tự: dựng payload → `node scripts/create-issue.mjs` (DRY-RUN, không cờ) để in payload → hiển thị cho user → user xác nhận → chạy lại với `--confirm`.
4. **Thiếu token** (`MISSING_JIRA_TOKEN`) → dừng, in hướng dẫn tạo tay (member-guide §4).
5. **Phạm vi guard = thiết kế skill, KHÔNG phải giới hạn năng lực.** Rule 1–4 chỉ áp dụng
   trong luồng skill jira-create. Khi user yêu cầu update/delete/config và đã rời luồng skill:
   ĐỪNG diễn đạt kiểu "không có khả năng / không được phép" — user sẽ hiểu nhầm agent không làm được.
   Nói rõ 3 ý:
   (a) trong skill này thiết kế **chỉ create**;
   (b) update/delete/config **làm được** qua Jira REST API (`PUT` / `DELETE /rest/api/2/issue/{key}`,
       cần quyền tương ứng trên FAL);
   (c) vì mutate data thật/dùng chung nên **cần user xác nhận rõ**, ưu tiên phân biệt: issue do
       chính phiên hiện tại tạo → xoá/sửa an toàn; issue data của người khác → cảnh báo mạnh
       (không hoàn tác), hỏi lại 1 lần nữa trước khi làm.

## Cách gọi script tạo issue
```bash
echo '<payload-json>' | node $ENGINE_DIR/scripts/create-issue.mjs            # DRY-RUN
echo '<payload-json>' | node $ENGINE_DIR/scripts/create-issue.mjs --confirm   # POST thật
```
`payload-json` = `{ "issuetypeId": "...", "summary": "...", "app"?: "...", "assignee"?: "...", "assignees"?: ["..."], "parentKey"?: "...", "description"?: "...", "priorityName"?: "...", "devPoint"?: "...", "testerPoint"?: "...", "dueDate"?: "YYYY-MM-DD", "linkToKey"?: "FAL-xxx", "linkType"?: "..." }`.
`assignee`/`assignees` giờ **không còn optional theo nghĩa "bỏ trống là xong"** — không truyền thì
`create-issue.mjs` tự set mặc định = người tạo (xem §Assignee bắt buộc dưới).

**Batch (nhiều issue 1 lượt):** stdin nhận cả **mảng** `[{...},{...}]` hoặc **`{ issues:[...], ...common }`**
(field ngoài `issues` dùng chung, merge vào từng issue — issue thắng khi trùng). DRY-RUN in mọi payload,
`--confirm` tạo tuần tự, 1 issue lỗi không dừng lô, cuối in `BATCH: x/N`. Chi tiết + ví dụ Tester nhiều
bug → 1 task ở `playbook.md §Batch`.

## Clarify gate (draft-first)
- Chỉ hỏi field BẮT BUỘC không suy được; gom 1 lượt; optional để trống. Required hiện tại: Task chỉ `summary`; Sub-task thêm `parent` (skill tự set = mã cha, KHÔNG hỏi user).
- Falcon App **optional** — KHÔNG hỏi. Chỉ set khi user nêu app trong lệnh. Nếu không set → nhắc user: "task sẽ nằm Falcon Master board, không lên board team; muốn lên board thì thêm app".
- Nếu user nêu app: đối chiếu với danh sách 9 option trong jira-metadata.json.falconApps (SEO/Blog/APC/AEO/Feed/Ads/Pixels/Speed/Canva) trước khi đưa vào draft; app ngoài list → hỏi lại, đừng POST (Jira sẽ 400).
- Suy chắc → vào thẳng draft (duyệt = cơ hội sửa). Suy không chắc → hỏi 1 câu trước.
- **Link:** luôn hỏi 1 lần "task này có cần link tới task nào không?" trước DRY-RUN (xem `playbook.md` Bước 4).
  User cố ý không link → tạo issue lẻ, hợp lệ. User muốn link nhưng chưa chọn được task → resolve trước
  (mã `FAL-xxx` hoặc `search.mjs`), đừng dựng draft link rỗng.

## Quy tắc đặt tên (Solar)

Mọi `summary` agent dựng ra khi tạo issue tuân theo naming Solar, format:

```
[<ROLE>][<App>] <mô tả>
```

- **`<ROLE>`** = 1 trong **4 tag cố định**: `DEV` · `BUG` · `BA` · `DESIGN` (tag theo **vai trò** phụ
  trách việc, KHÔNG phải theo phase/giai đoạn). PO và BA **đều** dùng `BA`.
- **Thiếu Falcon App** → bỏ hẳn `[App]`, chỉ còn `[<ROLE>] <mô tả>`. KHÔNG ép hỏi app chỉ để có tên đẹp.
- **`<App>`** = 1 trong 9 option `jira-metadata.json.falconApps` (SEO/AEO/Blog/APC/Feed/Ads/Pixels/Speed/Canva).
- **`<ROLE>` mặc định theo role/ngữ cảnh** (đây là **default** để agent tự dựng, user LUÔN override được
  nếu tự gõ role/tên khác — tôn trọng lựa chọn của user, không phải luật cứng):

  | Role / ngữ cảnh | ROLE default |
  |---|---|
  | Tech Lead (task cho dev) | `DEV` |
  | Tester (Bug) | `BUG` |
  | PO/BA (task cha tháng + sub-task) | `BA` |
  | Task thiết kế (design) | `DESIGN` |
  | Generic — Task | `DEV` |
  | Generic — Bug | `BUG` |

- **`DESIGN` — designer dùng chung cả team Falcon:** tag `[DESIGN]` gắn với **danh sách designer chung**
  (roster field `designers`, mảng — hiện `["dungta"]`, KHÁC `dungtt` là Tester Organic). Task `[DESIGN]`
  không nêu người làm:
  - Danh sách có **đúng 1** designer → **tự giao người đó** (enforce tầng script — xem §Assignee).
  - Danh sách có **nhiều** designer → agent **chủ động gợi ý danh sách** cho user chọn khi dựng draft;
    nếu user không chọn ai, script để **mặc định người tạo** (không tự đoán giao ai trong nhiều người).
  - Luôn override được nếu user chỉ định thẳng người khác.
- Ví dụ: `[DEV][Speed] Refactor lazyload` · `[BUG][Speed] Lazyload vỡ layout trên theme Dawn` ·
  `[BA] Task tháng 7/2026` (task cha không app) · `[BA][SEO] Viết meta description` (sub-task, app kế
  thừa cha) · `[DESIGN][Speed] Thiết kế banner onboarding` (→ giao designer chung).
- Agent dựng tên này ngay khi build draft và **hiển thị ở DRY-RUN cho user duyệt** — user sửa lại tự do
  trước khi `--confirm`. Naming là việc của agent (không có code enforce chuỗi tên trong `jira.mjs`);
  riêng việc suy assignee mặc định từ tag `[DESIGN]` thì CÓ enforce ở script (`isDesignSummary`).

## Assignee bắt buộc

Mọi issue tạo ra **bắt buộc có assignee** — không phải field optional nữa.
- User không nêu ai làm → mặc định **người tạo task** (lấy qua `GET /rest/api/2/myself` → `.name`).
- **Ngoại lệ tag `[DESIGN]`:** task naming Solar bắt đầu bằng `[DESIGN]` mà không nêu người làm → thử
  giao **designer chung** thay vì người tạo. Detect qua `isDesignSummary(summary)` (`lib/jira.mjs`), lấy
  người qua `defaultDesignAssignee(roster)` (`lib/team.mjs`) — không cần gọi network. Quy tắc:
  `designers` có đúng 1 người → giao người đó; nhiều người hoặc rỗng → trả `null` → fallback về người tạo
  (`fetchMyself`). Danh sách designer đọc qua `getDesigners(roster)` (nhận cả field `designers` mảng lẫn
  `designer` chuỗi đơn cũ). **Thêm/bớt/đổi designer:** sửa mảng `team-roster.json.designers`, không cần
  đụng code.
- Enforce ở **tầng script** (`create-issue.mjs`, hàm `ensureAssignee` trong `lib/jira.mjs`): nếu payload
  chưa có `fields.customfield_10700` (mảng) thì tự set `[{ name: <người tạo hoặc designer> }]` — áp dụng
  chắc chắn cho mọi role kể cả khi agent quên set trong lúc dựng draft. Chạy cả ở DRY-RUN (để user thấy
  trước sẽ giao ai) lẫn `--confirm`.
- Field assignee là `customfield_10700` dạng **mảng** — dùng mảng dù chỉ 1 người (đồng nhất cho cả ca
  nhiều assignee). Bug mặc định giao người tạo; user nêu ai làm thì set người đó.

## Xử lý lỗi
| Tình huống | Hành vi |
|---|---|
| `MISSING_JIRA_TOKEN` | Dừng draft, hướng dẫn tạo tay |
| HTTP 401 | Báo token sai/hết hạn, không retry mù |
| HTTP 400 thiếu required | Đọc `errors`, hỏi bổ sung, POST lại |
| `PROJECT_NOT_FAL` | Dừng ngay, không POST |
| `MYSELF_FAILED: <status>` | Không lấy được người tạo (token sai/hết hạn) để set assignee mặc định — báo lỗi như HTTP 401, không tạo issue thiếu assignee |
