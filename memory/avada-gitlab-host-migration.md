---
name: avada-gitlab-host-migration
description: AEO, APC, seo và avada-image-optimizer đã chuyển sang GitLab self-hosted git.avada.net; remote gitlab.com còn lại là mirror chết — check remote trước khi cắt branch hay mở MR
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

Liên quan: [[gen2-deploy-silent-freeze]]
