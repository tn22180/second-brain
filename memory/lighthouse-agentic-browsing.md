---
name: lighthouse-agentic-browsing
description: "Lighthouse 13.4.1 agentic-browsing scoring — WebMCP is flag-gated in Chrome 150 so PSI can't see it; llms.txt is the only lever that moves the score today."
metadata: 
  node_type: memory
  type: project
  originSessionId: 98d995cd-053d-4437-889b-d963617e18c0
  modified: 2026-08-03T08:18:58.691Z
---

Đo thật 2026-08-03 (lighthouse@13.4.1 local + Chrome 150.0.7871.187, cùng dòng build với Chrome
PSI 150.0.7871.186). Artefact: `jobs/seo/webmcp-lighthouse-measurement.md` + `jobs/seo/data/`.

- Category score = **mean của audit applicable**. `notApplicable` → `weight: 0` → ra khỏi mẫu số.
  Thêm một audit fail = **tụt điểm**, không phải "không tăng".
- 6 audit: `agent-accessibility-tree` (w1), `cumulative-layout-shift` (w1), `llms-txt`,
  `webmcp-schema-validity`, `webmcp-registered-tools`, `webmcp-form-coverage`.
- **Chỉ `webmcp-schema-validity` tính điểm.** 2 audit webmcp còn lại khai `INFORMATIVE` trong meta
  → vĩnh viễn weight 0.
- **WebMCP sau flag `--enable-features=WebMCP` ở Chrome 150, mặc định tắt** → PSI trả
  `notApplicable` cho mọi site. Gatherer check `navigator.modelContext || document.modelContext`
  với `useIsolation: true` nên polyfill của page không lừa được — phải là property native.
- **`llms.txt` là đòn bẩy duy nhất dùng được ngay**: file hợp lệ ở **domain root** (gatherer fetch
  `new URL('/llms.txt', finalDisplayedUrl)`) → w=1 score=1. 4xx → notApplicable (vô hại);
  file lỗi/5xx → score 0 → kéo tụt. Shopify không ghi được domain root → cần URL Redirect.

Liên quan: [[seo-prod-error-slack-pipeline]]
