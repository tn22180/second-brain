---
name: shopify-json-filter-escapes-slash
description: "Shopify Liquid `| json` escapes `/` as `\\/`, so `</script>` can't break out of JSON-LD; liquidjs does NOT, so liquidjs tests understate safety"
metadata:
  node_type: memory
  type: reference
  originSessionId: f86721a9-174e-4b38-bb6b-81a9ac66a301
  modified: 2026-09-29T11:12:43.232Z
---

Shopify's `| json` filter emits `\/` for every `/` (seen live on theme-dawn-demo 2026-09-29: ld+json Organization logo `"https:\/\/…"`, variant JSON `"src":"\/\/…"`). So `{{ x | json }}` inside `<script type="application/ld+json">` cannot be closed by a `</script>` payload — it becomes `<\/script>`. `escape`/`escape_once` are NOT safe there (a `\` or `"` breaks the JSON).

**Why:** SEO phase-4 fixes (C3, L3, hardening-2) switched JSON-LD fields to `| json`; agents flagged "unverified whether Shopify json escapes </" because liquidjs (used in local tests) doesn't escape `/`.
**How to apply:** `| json` (without literal quotes) is the correct fix for strings in JSON-LD across all Avada apps; don't add extra `<` escaping in Liquid. Backend-built JSON-LD (e.g. getMetafieldLocalBusiness) still must escape `<` itself since it bypasses the filter.
