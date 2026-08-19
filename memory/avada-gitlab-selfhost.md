---
name: avada-gitlab-selfhost
description: "Avada dùng GitLab self-host git.avada.net từ 2026-08-09; seo đã cutover 2026-08-18, origin = git.avada.net"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2d25a023-2f18-4a64-8eef-a173ed27b2b3
  modified: 2026-08-19T00:00:00.000Z
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

Liên quan: [[seo-master-no-detect-worker]], [[gen2-deploy-silent-freeze]], [[avada-gitlab-host-migration]]
