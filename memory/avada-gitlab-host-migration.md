---
name: avada-gitlab-host-migration
description: AEO, APC, seo, avada-image-optimizer và worker-sdk đã chuyển sang GitLab self-hosted git.avada.net (worker-sdk nằm ở avada/falcon/product, không phải avada/); remote gitlab.com read-only — check remote trước khi cắt branch hay mở MR
metadata: 
  node_type: memory
  type: project
  originSessionId: 049a8f93-ca51-4912-9141-c809eaeab230
  modified: 2026-08-17T11:02:49.847Z
---

Từ ~2026-08-14, `llm-ai-search-seo` (AEO) và `ai-product-copy` (APC) chạy trên
**`https://git.avada.net/avada/<repo>.git`**, không còn `gitlab.com/avada/...`.

Cái bẫy: remote `gitlab.com` **vẫn fetch và push thành công** — nó thành mirror chết. MR mở ở đó
merge được, pipeline xanh, nhưng CI thật và deploy chạy ở host mới nên **prod không bao giờ nhận
code**. Ở APC, `master` trên host mới còn bị force-update nên merge commit ở gitlab.com biến mất
hẳn. Kiểm `git remote get-url origin` trước khi tin bất kỳ trạng thái MR/branch nào.

Kiểm 2026-08-17: chỉ 2 repo này đã chuyển; 16 repo còn lại trong `projects/Falcon/` vẫn `gitlab.com`.
Có thể chuyển tiếp — đừng giả định theo trí nhớ.

Cập nhật 2026-09-10: `seo` (cutover 08-18) và **`avada-image-optimizer`** cũng đã chuyển. Ở img,
worktree local vẫn chỉ có `origin` = gitlab.com và **origin/master đứng sau host mới 416 commit** —
cắt branch từ đó là base sai mà không có dấu hiệu gì. Giờ gitlab.com trả
`403 "Your top-level group is over the user limit and has been placed in a read-only state"` khi
push, nên ít nhất lỗi có tiếng. Cách làm: `git ls-remote https://git.avada.net/avada/<repo>.git`
trước, thêm remote host mới, `fetch`, `rebase` rồi push.

CI variable cũng **không** đi theo: `PRODUCTION_ENV_FILE` (AEO) / `PROD_ENV_FILE` (APC) set ở
gitlab.com không tới prod. Đây là lý do `SWAGGER_JWT_SECRET` vẫn thiếu sau khi tưởng đã set.

`glab` **đã auth** cả `gitlab.com` và `git.avada.net` (kiểm 2026-09-10, `glab auth status`), nên
`glab mr create --repo git.avada.net/avada/<repo> --source-branch … --target-branch master --yes`
chạy thẳng — không cần link `merge_requests/new` thủ công nữa.

Cập nhật 2026-09-15: **`worker-sdk`** chuyển nốt, nhưng path khác các app:
`https://git.avada.net/avada/falcon/product/worker-sdk.git` (project id 525). Lý do: Tuan không có
quyền tạo project trong `avada/seoon-team` trên host mới; `avada/falcon/product` (group 49,
`project_creation_level: developer`) là group Falcon đang chứa seo-suite/seo-on-blog/product-copy.
Local clone: `origin` = host mới, `gitlab-old` = gitlab.com (5 branch mirror đủ). gitlab.com giờ chặn
cả API write (`POST repository/branches` → pre-receive hook 403), không chỉ push.
`glab api -X POST projects` bị auto-mode classifier chặn ("Public Data-Sharing Upload") — Tuan phải
tự chạy dòng đó. npm publish `@avada-falcon/worker-sdk` vẫn manual, tách khỏi MR.

Liên quan: [[gen2-deploy-silent-freeze]]

**glab mr create chết với git.avada.net** (2026-09-25): `-R git.avada.net/avada/seo` và `GITLAB_HOST=git.avada.net` đều báo "Configured remotes: github.com." rồi không tạo gì. Dùng API: `glab api --hostname git.avada.net -X POST "projects/avada%2Fseo/merge_requests" -f source_branch=… -f target_branch=master -f title=… -f description=…` → tạo được (MR !2315).
