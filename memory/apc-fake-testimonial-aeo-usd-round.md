---
name: apc-fake-testimonial-aeo-usd-round
description: "Two live prod bugs found 2026-10-01 while testing services — APC invents customer testimonials (templates.js:51), AEO llms.txt rounds USD prices to integers (formatCurrency.js)"
metadata:
  node_type: memory
  type: project
  originSessionId: abea53b9-0765-4c75-aa35-2264a8b7276f
  modified: 2026-10-01T04:52:47.589Z
---

Found during the services-beyond-Shopify test (report `jobs/2026-10-01-services-beyond-shopify.md`), both unfixed as of 2026-10-01:

- **APC fake reviews:** `ai-product-copy` `const/templates.js:51` Problem-Solution template has slot `[Testimonial or proof point]`; `helpers/prompt/getPrompt.js` forbids inventing sizes (:371) but not reviews. 7/10 test descriptions wrote "Customers praise…", one fake quoted testimonial. Merchants on the Shopify app are exposed → FTC fake-review risk.
- **AEO USD rounding:** `llm-ai-search-seo` `helpers/formatCurrency.js` sets `maximumFractionDigits: 0` for USD → `$209.99` prints `$210` in every USD shop's llms.txt.

**Why:** both are wrong for current paying merchants, not just the new service.
**How to apply:** check whether a FAL ticket / fix exists before re-raising; grep `origin/master`/`origin/main` for the lines above. Related [[aeo-llms-txt-override-coverage]].
