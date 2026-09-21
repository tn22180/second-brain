---
title: "Core — lõi chung mọi role"
audience: dev
updated: 2026-07-22
related: [create.md, operate.md, ../SKILL.md]
---

# Core — lõi chung mọi role

## Đường dẫn engine — `$ENGINE_DIR`
Mọi lệnh/tham chiếu dưới đây ghi `$ENGINE_DIR/...` = **thư mục skill `jira`** (engine: scripts,
references, metadata, roster). `$ENGINE_DIR` = base directory của skill (dòng *"Base directory for this
skill"* ở đầu context).

Khi chạy script, thay `$ENGINE_DIR` bằng đường dẫn tuyệt đối đó (bọc trong nháy kép nếu path có dấu
cách). Cách này portable: cài personal (`~/.claude/skills/`) hay theo project đều đúng.

## Kết nối
- Base: `https://space.avada.net` (hoặc `JIRA_BASE_URL`). REST v2. Auth `Bearer $JIRA_TOKEN`.
- Token đọc theo thứ tự: **biến môi trường** `JIRA_TOKEN` (đặt ở khối `env` của
  `~/.claude/settings.json` — cách chính, sống qua mọi lần update plugin) → `$ENGINE_DIR/.env`
  → `skills/jira/.env` → `.env` gốc repo. **Không đọc `cwd`.** Không có ở đâu cả → `MISSING_JIRA_TOKEN`.
  Xem `docs/setup.md` mục 5 và `scripts/lib/README.md`.
- Metadata thật: `jira-metadata.json` (sinh bởi `scripts/probe.mjs`). KHÔNG hardcode field ID theo trí nhớ — luôn đọc file này.
- Không có file metadata → chạy: `PROBE_DATE=<hôm nay> node scripts/probe.mjs` (read-only) rồi đọc lại.

## An toàn (BẮT BUỘC)
1. **project=FAL cứng.** Mọi verb tự guard qua `assertFalKey`; đừng bao giờ truyền project khác. Kể cả
   verb `raw` (escape hatch gọi thẳng REST) — path chứa issue key của project khác FAL vẫn bị chặn.
2. **Thao tác chia 4 tầng theo mức nguy hiểm** — script tự xếp tầng (`classifyTier` ở
   `scripts/lib/jira.mjs`), agent **không tự quyết**:

   | Tầng | Việc | Hành vi |
   |---|---|---|
   | T0 | `get` `search` `sprints` `board` `transitions` `meta` | chạy thẳng |
   | T1 | ghi nhẹ trên issue của mình (`transition` `assign` `sprint` `comment` `attach`, `update` field nhẹ) | chạy thẳng, báo kết quả sau |
   | T2 | issue của người khác, hoặc `update` chạm `summary`/`description` | in DRAFT → chờ `--confirm` (`--force` bỏ qua được) |
   | T3 | `delete` `unlink` | cảnh báo không hoàn tác → chờ `--confirm` (`--force` **không** có tác dụng, luôn phải confirm tay) |

   Lý do enforce ở tầng script chứ không phải reference: có tiền lệ `ensureAssignee` phải enforce ở
   tầng script vì agent quên set khi dựng draft — guard chỉ ghi trong tài liệu sẽ bị bỏ qua tương tự.
   Quyền suy từ **data Jira** (field `reporter` của issue), không từ bộ nhớ phiên: issue vừa tạo trong
   phiên này thì `reporter` đã là mình, nên tự động lọt T1 mà không cần agent tự lưu state.
3. **⚠️ Chạy verb KHÔNG có `--confirm` KHÔNG đảm bảo an toàn — KHÔNG đồng nghĩa với DRY-RUN.** Tầng T1
   (ghi nhẹ trên issue của **chính mình**) **ghi thẳng lên Jira ngay cả khi không có `--confirm`** —
   không có bước dừng, không có draft nào được in ra. Chỉ T2 (issue người khác / sửa `summary`,
   `description`) và T3 (`delete`, `unlink`) mới dừng lại in `DRAFT` chờ duyệt.
   - **Vì sao không "cứ chạy thử xem có ghi không" được:** tầng suy từ field `reporter`/assignees của
     issue trên Jira, agent **không thể biết trước khi chạy lệnh** — phải `GET` issue rồi mới biết đó là
     T0/T1 (chạy thẳng) hay T2/T3 (dừng ở draft). Không có cách nào "thử an toàn" một verb ghi mà không
     biết trước tầng của nó.
   - **Ca thật đã xảy ra:** chạy `link FAL-280 Relates FAL-279` (không `--confirm`) trên issue mà chính
     người chạy là `reporter` → rơi vào T1 → **ghi NGAY lên Jira**, không dừng ở draft, không có gì để
     "duyệt lại".
   - **Muốn chắc trước khi ghi:** chạy `jira.mjs get <KEY>` xem `reporter` (và assignees) trước khi gọi
     verb ghi. Không phải mình → chắc chắn rơi T2 trở lên, sẽ dừng ở draft. Là mình → nhiều khả năng T1,
     verb ghi tiếp theo trên issue đó **sẽ ghi ngay**, xin xác nhận bằng lời với user TRƯỚC khi gọi, đừng
     dựa vào việc "chạy không cờ để xem trước".
   - T2/T3 (khi có dừng ở draft): dựng payload → chạy verb (in `DRAFT`) → hiển thị cho user → user xác
     nhận → chạy lại với `--confirm`. Bước này KHÔNG áp dụng cho T0/T1 vì chúng không dừng lại.
4. **Thiếu token** (`MISSING_JIRA_TOKEN`, exit code `3`) → dừng, in hướng dẫn tạo tay (member-guide §4).

## Exit code (`jira.mjs` — entrypoint verb đọc/ghi/xoá)
`0` ok hoặc dừng ở draft (T2/T3 chưa `--confirm`) · `1` sai đối số · `2` lỗi API · `3` thiếu token.

Bảng trên chỉ áp dụng cho `jira.mjs`. **`create-issue.mjs` (mục kế tiếp) theo quy ước khác**: `exit 1`
cho MỌI lỗi — cả lỗi dựng payload (`INVALID_JSON`, lỗi item trong batch) lẫn lỗi gọi API (issue tạo thất
bại), không có nhánh `exit 2` hay `exit 3` riêng cho thiếu token.

## Field map — KHÔNG nhớ id bằng đầu

Instance FAL là Jira **Server**. Đừng dùng field id của Jira Cloud.

| Tên dùng ở CLI | Field id thật |
|---|---|
| `app` | `customfield_11203` |
| `assignees` (LUÔN mảng) | `customfield_10700` |
| `devPoint` · `testerPoint` | `customfield_11204` · `customfield_11202` |
| Sprint | `customfield_10101` — **không** phải `customfield_10004` (đó là id của Jira Cloud) |

Truyền tên trái, `buildUpdateFields` tự dịch sang id phải. Field ngoài bảng → dùng verb `raw`.

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
bug → 1 task ở `create.md §Batch`.

## Clarify gate (draft-first)
- Chỉ hỏi field BẮT BUỘC không suy được; gom 1 lượt; optional để trống. Required hiện tại: Task chỉ `summary`; Sub-task thêm `parent` (skill tự set = mã cha, KHÔNG hỏi user).
- Falcon App **optional** — KHÔNG hỏi. Chỉ set khi user nêu app trong lệnh. Nếu không set → nhắc user: "task sẽ nằm Falcon Master board, không lên board team; muốn lên board thì thêm app".
- Nếu user nêu app: đối chiếu với danh sách 10 option trong jira-metadata.json.falconApps (SEO/Blog/APC/AEO/Feed/Ads/Pixels/Speed/Canva/Team) trước khi đưa vào draft; app ngoài list → hỏi lại, đừng POST (Jira sẽ 400).
- Suy chắc → vào thẳng draft (duyệt = cơ hội sửa). Suy không chắc → hỏi 1 câu trước.
- **Link:** luôn hỏi 1 lần "task này có cần link tới task nào không?" trước DRY-RUN (xem `create.md` Bước 4).
  User cố ý không link → tạo issue lẻ, hợp lệ. User muốn link nhưng chưa chọn được task → resolve trước
  (mã `FAL-xxx` hoặc `jira.mjs search`), đừng dựng draft link rỗng.

## Quy tắc đặt tên (Solar)

Mọi `summary` agent dựng ra khi tạo issue tuân theo naming Solar, format:

```
[<ROLE>][<App>] <mô tả>
```

- **`<ROLE>`** = 1 trong **4 tag cố định**: `DEV` · `BUG` · `BA` · `DESIGN` (tag theo **vai trò** phụ
  trách việc, KHÔNG phải theo phase/giai đoạn). PO và BA **đều** dùng `BA`.
- **Thiếu Falcon App** → bỏ hẳn `[App]`, chỉ còn `[<ROLE>] <mô tả>`. KHÔNG ép hỏi app chỉ để có tên đẹp.
- **`<App>`** = 1 trong 10 option `jira-metadata.json.falconApps` (SEO/AEO/Blog/APC/Feed/Ads/Pixels/Speed/Canva/Team).
  - **`Team`** = task **nội bộ của team** (automation, tooling, quy trình) — không thuộc app nào. Filter của **cả 2 board** đều bắt `Team` ⇒ task gắn Team lên **cả 2 board**. Việc chỉ liên quan sản phẩm thì dùng app tương ứng, đừng lạm dụng Team.
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
  (roster field `designers`, mảng — hiện `["dungta"]`, KHÁC `dungtt` là Tester ở Board 1). Task `[DESIGN]`
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

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
| 2026-07-22 | LamLN | Mở rộng skill jira ra ngoài create: verb đọc/ghi/xoá + guard phân tầng T0–T3 |
| 2026-07-22 | LamLN | Sửa review: thêm frontmatter (thiếu, vi phạm luật repo); ghi rõ bảng Exit code chỉ áp dụng `jira.mjs`, `create-issue.mjs` theo quy ước khác (`exit 1` cho mọi lỗi) |
| 2026-08-14 | LinhNQ | 'Tester Organic' → 'Tester ở Board 1' |
