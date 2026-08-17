---
name: avada-gitlab-host-migration
description: AEO và APC đã chuyển sang GitLab self-hosted git.avada.net (2026-08); remote cũ gitlab.com vẫn fetch/push được nên hỏng im lặng — check remote trước khi mở MR
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

CI variable cũng **không** đi theo: `PRODUCTION_ENV_FILE` (AEO) / `PROD_ENV_FILE` (APC) set ở
gitlab.com không tới prod. Đây là lý do `SWAGGER_JWT_SECRET` vẫn thiếu sau khi tưởng đã set.

`glab` chưa auth host này (`glab auth login --hostname git.avada.net`) → push được bằng git
credential helper, nhưng tạo MR bằng CLI thì không; dùng link
`.../-/merge_requests/new?merge_request%5Bsource_branch%5D=<branch>`.

Liên quan: [[gen2-deploy-silent-freeze]]
