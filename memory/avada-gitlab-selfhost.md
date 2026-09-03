---
name: avada-gitlab-selfhost
description: "Avada dùng GitLab self-host git.avada.net từ 2026-08-09; seo đã cutover 2026-08-18, origin = git.avada.net"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2d25a023-2f18-4a64-8eef-a173ed27b2b3
  modified: 2026-09-03T00:00:00.000Z
---

Avada chạy GitLab self-host tại `https://git.avada.net` — **19.1.0 Community Edition**
(`enterprise: false`). Migration từ gitlab.com bắt đầu **2026-08-09**; tính tới 2026-08-17 đã có
**25 project**: `avada/seo` (id 426), `blogs`, `joy`, `ai-product-copy`, `avada-image-optimizer`,
`llm-ai-search-seo`, `avada-core`, `avada/artifacts/avada-seo-react-app-artifacts` (id 391),
`avada/artifacts/seoon-blog-artifacts`, + nhóm `avada/falcon/product/*`.

**Bảng "Repo → Firebase project" trong `second-brain/CLAUDE.md` vẫn ghi remote gitlab.com cho cả
18 repo — đã sai.** Đừng đọc nó như nguồn sự thật về remote nữa; kiểm host thật trước khi kết luận.

**seo đã cutover 2026-08-18.** Trong clone local: `origin` = `https://git.avada.net/avada/seo.git`,
remote gitlab.com bị đổi tên thành `gitlab-old`. Phân kỳ hai chiều đã hết —
`gitlab-old/master...origin/master` = `0 21`, self-host là superset. MR mới mở ở self-host.
Đã xong: 119/119 CI var khớp, 9 runner online untagged, protected branch `master`.

Runbook đầy đủ: `jobs/seo-gitlab-selfhost-migration.md`. Token self-host đọc từ `jobs/.env`
key `GLAB_SELF_HOST` (gitignored) — là Maintainer (access_level 40, có scope `api`), **không phải
admin**, endpoint admin trả 403 vì thiếu scope `admin_mode`.

**API `git.avada.net` bị Cloudflare chặn theo User-Agent.** `urllib`/script mặc định trả
`403 error code: 1010` trên **mọi** endpoint, kể cả `/user` — nhìn y hệt token hết quyền nhưng
không phải. Gửi kèm UA trình duyệt (`Mozilla/5.0 …Chrome/…`) là qua ngay. Đừng đi rotate token.

**Group `avada` trên gitlab.com đã bị khoá READ-ONLY** (phát hiện 2026-09-03 khi push
`worker-sdk`): `remote: Your top-level group is over the user limit and has been placed in a
read-only state.` → push trả **403**. Repo nào chưa cutover sang self-host thì hiện **không có
remote ghi được**. `@avada-falcon/worker-sdk` là trường hợp đó: origin vẫn
`gitlab.com/avada/seoon-team/worker-sdk`, và git.avada.net **chưa có** project đó
(`avada/worker-sdk` và `avada/seoon-team/worker-sdk` đều 404). Muốn ship sdk phải tạo project
self-host trước, hoặc đẩy tạm sang namespace cá nhân `tn22180`.

`fleet-control` = `gitlab.com/tn22180/falcon-tech-lead-manager` (namespace cá nhân, KHÔNG bị
khoá, vẫn push được). Trunk của nó là **`master`**; `origin/main` chỉ có "Initial commit" —
đừng nhắm MR vào `main`.

Liên quan: [[seo-master-no-detect-worker]], [[gen2-deploy-silent-freeze]], [[avada-gitlab-host-migration]]
