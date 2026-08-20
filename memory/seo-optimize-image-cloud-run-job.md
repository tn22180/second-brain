---
name: seo-optimize-image-cloud-run-job
description: Prod image-alt/optimize chạy trong Cloud Run JOB avada-seo-optimize-image-job, deploy đường riêng nên trôi hàng tuần sau master.
metadata:
  type: project
---

Alt/image optimize ở prod `seo` KHÔNG chạy trên GCF hay worker fleet — chạy trong Cloud Run job
`avada-seo-optimize-image-job` (us-central1), image `gcr.io/avada-seo/avada-seo-optimize-image-job:<commit-sha>`.

Deploy riêng: `.gitlab-ci.yml` job `deploy_cloud_run_job:production` chỉ chạy khi **tag push VÀ
commit title chứa `[deploy-cloud-run-production]`**. Tag `v1.85.*` thường, `[deploy-worker]`,
merge master đều KHÔNG đụng tới nó → nó trôi lại sau master hàng tuần (2026-08-20: vẫn ở
`4bddc09` của 2026-07-22, tức 4 tuần, còn qwen3-vl làm alt model mặc định trong khi master đã
sang gemma từ 08-19).

Khi soi "model nào đang chạy ở prod", phải check job này, không chỉ `gcloud run services list`.
Nó cũng vô hình trong log: `getOpenRouterImageAlt` không log tên model ở nhánh thành công.

Liên quan: [[seo-prod-deploy-by-tag]], [[gen2-deploy-silent-freeze]], [[seo-gen2-follower-fleet-deploy]].
