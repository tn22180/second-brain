# Probe findings — review-mr-queue (Task 0)

Probed trực tiếp trên Jira thật (`space.avada.net`, REST v2, Bearer `$JIRA_TOKEN` từ `.env`) và GitLab thật (`gitlab.com`, qua `glab api`) vào 2026-07-14. READ-ONLY — không post/sửa gì trên Jira/GitLab.

## 1. STATUS_NAME — status "waiting to review" thật

Toàn bộ status của project FAL (`GET /rest/api/2/project/FAL/statuses`):

```
Archived
Doing
Done
QA/ QC
Review Done
Reviewing
Test Staging
Testing Production
To Do
Waiting For Review
Waiting To Live
Waiting To Test
```

→ **`STATUS_NAME = "Waiting For Review"`** (id nội bộ `10402`, statusCategory `In Progress`/`indeterminate`). Đây là tên chính xác cần dùng trong JQL (`status = "Waiting For Review"`), phân biệt với `Reviewing` (khác nghĩa — task đang được dev làm review việc khác) và `Review Done` (đã xong review).

Lưu ý: JQL `assignee = currentUser() AND status = "Waiting For Review"` trả về **0 kết quả** tại thời điểm probe (anh Lâm hiện không có task nào ở trạng thái này). Đã broaden sang `project = FAL AND status = "Waiting For Review"` (không lọc assignee) để lấy sample — ra 10 kết quả. Task sau (build skill thật) vẫn nên lọc theo `assignee = currentUser()` như JQL gốc; chỉ là lúc probe không có data nên phải bỏ filter để quan sát field.

## 2. `customfield_10800` — format field Merge Request

Field là **kiểu string đơn giản (URL), KHÔNG phải object/array**. Đọc trực tiếp `fields.customfield_10800`, không có `.content`/`.value` gì thêm.

Ví dụ quan sát được:
- FAL-34 (`avada-image-optimizer`): `"customfield_10800": "https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/224"`
- FAL-107 (`seo`): `"customfield_10800": "https://gitlab.com/avada/seo/-/merge_requests/1683"`
- FAL-146 (`pixel-tracking`): `"customfield_10800": "https://gitlab.com/avada/blocko-team/pixel-tracking/-/merge_requests/1"` (subgroup 2 cấp `blocko-team/pixel-tracking`)
- FAL-156, FAL-103: `"customfield_10800": null` — field **có thể null** dù task đang ở "Waiting For Review". Ở FAL-156, MR URL vẫn tồn tại nhưng chỉ nằm trong `description` (text tự do), không có trong customfield_10800.

**Hệ quả cho task sau:** skill phải xử lý `customfield_10800 == null` — có thể fallback parse MR URL từ `description` bằng regex `https://gitlab\.com/[^\s]+/-/merge_requests/\d+`, hoặc báo skip/cảnh báo task đó thiếu field MR thay vì fail cứng.

## 3. Shape URL MR

Pattern chung: `https://gitlab.com/<namespace>/-/merge_requests/<IID>`

`<namespace>` có thể là 1 cấp (`avada/avada-image-optimizer`, `avada/seo`) hoặc nhiều cấp/subgroup (`avada/blocko-team/pixel-tracking`, `avada/blocko-team/product-feed`). → Khi parse, không giả định số cấp cố định; lấy toàn bộ phần giữa domain và `/-/merge_requests/` làm `projectPath`, urlencode `/` → `%2F` khi gọi GitLab API.

`IID` là số nguyên (project-scoped merge request IID, dùng trực tiếp trong endpoint `projects/<encoded_path>/merge_requests/<IID>`, KHÔNG phải global MR id).

## 4. GitLab API field names (từ `glab api projects/<path>/merge_requests/<iid>`)

Test trên 2 MR thật (`avada/avada-image-optimizer!224` và `avada/seo!1683`):

| field | ví dụ giá trị | ghi chú |
|---|---|---|
| `target_branch` | `"master"` | tên nhánh đích, string |
| `source_branch` | `"improve/optimization-review"` / `"feature/affiliate-v2"` | tên nhánh nguồn |
| `sha` | `"5a0b5198ad36c91ae0b673d4a860a84c255b76fb"` | = `diff_refs.head_sha`, commit đầu MR hiện tại |
| `web_url` | `"https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/224"` | khớp đúng URL lấy từ Jira |
| `diff_refs.base_sha` | `"b469838f134b2f285b75095332c5f3d010fa4426"` | base để diff |
| `diff_refs.head_sha` | `"5a0b5198ad36c91ae0b673d4a860a84c255b76fb"` | = `sha` |
| `diff_refs.start_sha` | `"2b166233aa7754fa545dde9d7b62f221b8e08ab0"` | điểm bắt đầu MR |
| `state` | `"opened"` | dùng để lọc MR còn mở |
| `project_id` | `59230220` (số) | numeric project id, có thể dùng thay path nếu cần |

Lệnh gọi: `glab api "projects/<ENCODED_PATH>/merge_requests/<IID>"` — `glab` đã auth sẵn cho `gitlab.com` (user `lamln1`), không cần thêm token thủ công.

## 5. Map repo local ↔ GitLab projectPath — KHÔNG bảng cứng, dùng `resolve-repos.mjs`

Máy mỗi Tech Lead khác nhau (đường dẫn, danh sách repo), nên KHÔNG khoá bảng. Skill map động qua
`scripts/resolve-repos.mjs`: đọc cache máy-riêng `repos.local.json` (ưu tiên) + tự quét vài thư mục gốc
phổ biến (`REVIEW_PROJECTS_ROOT`, cwd, `~/Desktop/Workspace`, `~/projects`, `~/code`...), khớp `git`
remote origin `gitlab.com/<projectPath>` với `projectPath` cắt từ MR URL.

Cắt `projectPath` từ MR URL: `https://gitlab.com/<projectPath>/-/merge_requests/<iid>` → lấy toàn bộ
phần giữa domain và `/-/merge_requests/` (có thể nhiều cấp subgroup). Encode `/`→`%2F` khi gọi `glab api`.

Quy trình onboard (khi gặp projectPath chưa biết) ở `references/onboarding-repos.md`. Không tìm thấy repo
tương ứng → **skip task đó + ghi vào báo cáo cuối**, KHÔNG tự clone.

## Ghi chú khác quan sát được trong lúc probe
- Không phải mọi MR nằm trong `avada/<repo>` phẳng — có case `avada/blocko-team/<repo>` (2 cấp subgroup). `resolve-repos.mjs` quét cả depth-2 nên bắt được layout nhóm; repo không có clone local → skip/log rõ ràng thay vì crash.
- `customfield_10800` null nhưng MR URL vẫn có thể nằm trong `description` — cân nhắc fallback regex ở Task sau (không bắt buộc cho Task 0, chỉ ghi nhận).
