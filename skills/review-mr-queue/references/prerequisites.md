# prerequisites — điều kiện cần để chạy review-mr-queue

Tech Lead khác muốn dùng skill này phải có đủ:

## 1. Công cụ (bắt buộc)
| Cái | Vì sao | Kiểm tra |
|---|---|---|
| **Node.js** ≥ 18 | chạy scripts `.mjs` (fetch queue, resolve, post) | `node -v` |
| **`glab`** đã auth `gitlab.com` bằng chính tài khoản Tech Lead | lấy metadata MR + fetch MR ref + post note GitLab | `glab auth status` |
| **`git`** | checkout MR về worktree cô lập | `git --version` |
| Built-in skill **`code-review`** + **`security-review`** trong Claude Code | phần review lõi | có sẵn trong Claude Code |

`python3` KHÔNG còn cần (review-core dùng node cho urlencode/parse).

## 2. Token Jira (bắt buộc)
`JIRA_TOKEN` = Personal Access Token trên `space.avada.net` của chính Tech Lead. Nguồn (thứ tự ưu tiên):
1. env `JIRA_TOKEN`
2. `.env` cạnh skill này (`review-mr-queue/.env` — copy từ `.env.example`)
3. `.env` của skill jira cạnh bên (`../jira/.env` ở team-ops, `../jira-create/.env` ở brain) — **tái dùng
   token đã cấu hình cho skill jira, khỏi khai 2 lần**
4. `.env` ở cwd

Thiếu token → skill dừng, báo `MISSING_JIRA_TOKEN`, KHÔNG cố post.

## 3. Repo clone local (cần cho phần review)
Các app cần review phải **đã clone về máy**, remote origin trỏ `gitlab.com/avada/...`. Skill tự tìm & nhớ
đường dẫn (xem `onboarding-repos.md`) — không phải khai bảng tay. Repo chưa clone → task đó bị **skip +
ghi báo cáo**, skill KHÔNG tự clone. Muốn skill quét đúng chỗ: đặt env `REVIEW_PROJECTS_ROOT`.

## 4. Quyền Jira
Tài khoản phải có quyền: đọc task project **FAL**, **comment**, và **transition** status sang *Reviewing*.
Không có transition phù hợp → non-fatal (ghi báo cáo, không dừng pipeline).

## 5. Điều kiện dữ liệu (không phải cài đặt, chỉ để hiểu)
- Task phải ở status **`Waiting For Review`** và assign cho Tech Lead (qua `assignee` chuẩn HOẶC field
  **Assignees** `customfield_10700`).
- MR URL nằm ở field **Merge Request** (`customfield_10800`) HOẶC trong description (fallback regex).
- Field id trên cố định theo instance Jira Falcon; đổi instance thì override qua env
  `JIRA_FIELD_MERGE_REQUEST` / `JIRA_FIELD_ASSIGNEES` / `JIRA_BASE_URL`.

## Chẩn nhanh khi lỗi
| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `MISSING_JIRA_TOKEN` | chưa set token (mục 2) |
| queue rỗng dù có task | token của người khác / task assign qua Assignees mà JQL chưa bắt / sai status |
| task bị skip "repo not_found" | repo chưa clone hoặc ngoài các gốc quét → set `REVIEW_PROJECTS_ROOT` hoặc `--save` |
| `glab` lỗi auth | chưa `glab auth login` |
