---
name: theme-extension-render-in-jsonld
description: "Shopify wraps every theme-app-extension snippet render in HTML comments — a render inside a JSON-LD script breaks the JSON; npm liquid tests don't see it."
metadata:
  node_type: memory
  type: project
  originSessionId: eda8408d-b487-4802-997a-bbc07d5012a3
  modified: 2026-09-29T07:46:08.589Z
---

Shopify wraps each `{% render %}` of an app-extension snippet in `<!-- BEGIN app snippet: X -->` / `<!-- END app snippet -->`, with no opt-out. A render inside `<script type="application/ld+json">` therefore ships invalid JSON.

FAL-920 (8d6d2eb4b02, v1.86.35) did exactly this with `avada-shipping-details` → Product JSON-LD invalid on every seo shop with shippingDetails on (seen rawtallow.pl, 2026-09-29). Fix = `capture` in avada-product-and-collection, MR !2329 (merged 2026-09-29), plus a guard test in `__tests__/shippingDetailsSnippet.test.js`.

**Why:** golden tests using the npm `liquid` package don't inject those comments, so they stay green.

**How to apply:** in any Avada app's theme extension, build JSON fragments with `capture`, never `render`/`include` inside a script. The same trap applies to blogs/AEO/APC extensions. Verify a fix on the live storefront (JSON.parse every ld+json block), not only in unit tests. Related: [[seo-prod-deploy-by-tag]].
