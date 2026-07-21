---
name: seo-shopify-toml-per-dev
description: "seo has many per-developer shopify.app.*.toml files; each points at that dev's own store — there is no canonical pair, don't normalize them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

The `seo` repo carries several `shopify.app.*.toml` variants — `shopify.app.toml` plus per-dev ones
(`shopify.app.seo-tony.toml`, `shopify.app.tony-seo-local.toml`, `shopify.app.avada-seo-local-8-truongnn.toml`,
`…-3-tony-he.toml`, `…-10-tony.toml`, `shopify.app.tony-seo-theme.toml`). Each dev's TOML points at that
dev's own dev store.

**Why:** these are intentionally divergent — there is no single canonical app/store pair to converge on.
**How to apply:** don't "fix" or normalize them into one file, and don't treat divergence between them as
a bug. Only touch the specific TOML the task names.
