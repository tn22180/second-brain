---
name: seo-onpage-score-client-vs-es
description: "seo Onpage audit table score is computed in the browser; Report card + \"Optimize by score range\" read Elasticsearch, filled only by the store scan — unscanned shop shows Poor rows but modal says no match."
metadata:
  node_type: memory
  type: project
  originSessionId: 764f780a-eaeb-46e3-91cc-799688f68be5
  modified: 2026-09-29T09:41:09.484Z
---

`packages/assets/src/pages/Audit/Products/RowMarkup.js:48-60` computes each row's score live (`prepareAnalysis`) unless sorting by score. Report card (`/analysis-score-report`) and the score-range modal (`/analysis-below-score`) query ES `shopify_*` — docs exist only after a store scan (`/audit/bulk-operation` → `jobDataMigrate` doc) or per-item `updateScore`.

Found on FAL-1013 (2026-09-29): shop lcdiEmkJ3F20l2Ru8gr5 had 0 `jobDataMigrate` docs, 24 ES docs all ≥68, table full of 37s → modal "No pages match". Not an ES bug; prod logs had 0 `getResourcesBelowScore` errors.

**Why:** two score sources disagree by design; merchants and CS read it as broken.
**How to apply:** "score range empty / report count wrong" → check `jobDataMigrate` for the shop first. `.env.staging4` ELASTICSEARCH_NODE (es.lukass.dpdns.org) holds prod shop docs — usable for read-only ES checks. Fix branch fix/FAL-1013-audit-fix-feedback.
