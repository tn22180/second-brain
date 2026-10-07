---
name: product-feed-inventory
description: "product-feed repo (origin/master 6e17a5b, 2026-10-07) — ChatGPT channel ~80% done, Shopify-only source, identifier_exists bug, 2 plan-bypass holes"
metadata:
  node_type: memory
  type: project
  originSessionId: abea53b9-0765-4c75-aa35-2264a8b7276f
  modified: 2026-10-07T08:31:05.519Z
---

Read 2026-10-07 (full write-up `jobs/2026-10-01-services/inv-product-feed.md`):
- Channels: Google (Merchant API file-fetch, Reports API `product_view`), Meta (`product_feeds` + COUNTRY/LANGUAGE override), "Any platform" XML, **ChatGPT ~80%** (`controllers/openaiAdsController.js`, CSV via SFTP; missing gzip, daily push, auto status). TikTok constant only.
- Source = Shopify bulk op only; after normalize to `feedProducts` (`productSyncService.js:743-793`) the pipeline is Shopify-free.
- `identifier_exists=no` almost never written (Auto mode counts brand, brand defaults to Vendor) — the error that got Google 100% rejection on 4/5 test stores.
- AI: OpenRouter `qwen/qwen3.7-flash`, fix-only.
- Holes before selling plans: `PUT /settings` lets merchant raise `renderImageLimit`; `devZoneGuard` trusts unverified shop email when `trustShopEmail` on.

**Why:** basis for the Shopping Feed service decision. **How to apply:** re-check origin/master before citing; MCP connector only shows connected channels, not what the app supports (that misled once). Related [[aeo-llms-txt-override-coverage]].
