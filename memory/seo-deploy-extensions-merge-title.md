---
name: seo-deploy-extensions-merge-title
description: seo extension deploy chỉ chạy khi CI_COMMIT_TITLE trên master chứa [deploy-extensions]; merge commit title "Merge branch…" làm rơi marker → extension không deploy dù MR title có.
metadata:
  type: project
---

`deploy-shopify-extension:production` (seo `.gitlab-ci.yml` ~2165) chỉ chạy trên `master` khi `$CI_COMMIT_TITLE =~ /\[deploy-extensions\]/`. Tag pipeline KHÔNG có job extension. Merge MR tạo commit title `Merge branch '…' into 'master'`, marker chỉ nằm ở body → job không chạy.

2026-10-05: MR !2360 (validFrom 2030 + rating giả 5/1) merge + v1.86.60 deploy xong functions nhưng storefront vẫn lỗi (ladyandoscar ratingValue 5, openvape validFrom 2030 x3).

**Why:** pipeline xanh, tag có commit → dễ báo tester "đã lên prod" sai.

**How to apply:** MR đụng `extensions/` → sau merge phải có commit master title chứa `[deploy-extensions]` (team đã từng push commit rỗng kiểu 9839ca0). Verify bằng job list + curl storefront, không tin tag. Liên quan [[seo-prod-deploy-by-tag]], [[gen2-deploy-silent-freeze]].
