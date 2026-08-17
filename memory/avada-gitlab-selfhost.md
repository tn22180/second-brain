---
name: avada-gitlab-selfhost
description: "Avada đã chuyển sang GitLab self-host git.avada.net từ 2026-08-09; 25 project đã lên, seo phân kỳ chưa cutover"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2d25a023-2f18-4a64-8eef-a173ed27b2b3
  modified: 2026-08-17T04:21:42.593Z
---

Avada chạy GitLab self-host tại `https://git.avada.net` — **19.1.0 Community Edition**
(`enterprise: false`). Migration từ gitlab.com bắt đầu **2026-08-09**; tính tới 2026-08-17 đã có
**25 project**: `avada/seo` (id 426), `blogs`, `joy`, `ai-product-copy`, `avada-image-optimizer`,
`llm-ai-search-seo`, `avada-core`, `avada/artifacts/avada-seo-react-app-artifacts` (id 391),
`avada/artifacts/seoon-blog-artifacts`, + nhóm `avada/falcon/product/*`.

**Bảng "Repo → Firebase project" trong `second-brain/CLAUDE.md` vẫn ghi remote gitlab.com cho cả
18 repo — đã sai.** Đừng đọc nó như nguồn sự thật về remote nữa; kiểm host thật trước khi kết luận.

**seo chưa cutover, master phân kỳ hai chiều, không có push mirror.** Snapshot 2026-08-17:
self-host `91dc5e48` (08-12, chỉ có ở đây — commit sửa CI clone artifacts), gitlab.com
`90034c49` (08-17, team vẫn merge ở đây). Đã xong ở self-host: 119/119 CI var khớp, 9 runner
online untagged, protected branch `master`. Chưa xong: CI chưa từng execute lần nào,
`.gitlab-ci.yml:1` vẫn pull image từ `registry.gitlab.com/anhnt34/...` mà không có
`DOCKER_AUTH_CONFIG`.

Runbook đầy đủ: `jobs/seo-gitlab-selfhost-migration.md`. Token self-host đọc từ `jobs/.env`
key `GLAB_SELF_HOST` (gitignored) — là Maintainer, **không phải admin**, endpoint admin trả 403
vì thiếu scope `admin_mode`.

Liên quan: [[seo-master-no-detect-worker]], [[gen2-deploy-silent-freeze]]
