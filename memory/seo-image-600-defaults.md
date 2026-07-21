---
name: seo-image-600-defaults
description: "seo 600×600 is the page-loader/og/overlay image generation default, NOT a mandatory image-url width"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

In the `seo` repo, `600×600` is the default size for **generated preview images** —
`resizeAndUploadImagePageLoader` (`packages/functions/src/controllers/seoController.js:431`) and the
sharp overlay/watermark default (`packages/functions/src/helpers/optimize/sharp.js:297`,
`{width = 600, height = 600, overlayScale = 0.5}`). It is the page-loader / og / social-preview
dimension.

**Not** a rule that "every seo image URL must be 600 wide." Real responsive image URLs use the width
ladder `[100,200,400,600,700,800,900,1000,1200,1400,1600]` (`src/commands/testCriticalCss.js:136`).
Corrects a garbled inbox candidate ("seo image width trong url bắt buộc = 600").
