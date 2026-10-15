---
name: seo-minify-revert-path-live
description: "minify is sunset but recursive `minify` action is the only revert path; 35,851 installed shops still minify.enabled=true"
metadata:
  node_type: memory
  type: project
  originSessionId: da002b6e-0b7b-4883-af1f-4ad205d18c36
  modified: 2026-10-15T04:08:29.331Z
---

Minify sunset (b67f7eb5c5) forced enabled:false, it did not remove the feature: `recursive` action `minify` / handleAssets rewrite theme refs `*.aio.min.*` back to originals and delete generated files. Counted 2026-10-15: 38,877 `seo` settings docs minify.enabled=true, 35,851 of them on installed shops, 1,109 updating=true.

**Why:** Tuan said "bỏ minify rồi, clear hết"; deleting the action would strand those themes on stale `.aio.min.` copies. He chose: delete generation code, keep revert (2026-10-15).
**How to apply:** never remove the minify revert chain (RECURSIVE_MINIFY, lazy_load↔minify, /settings/minify, reset_minify) without first probing storefronts for remaining `.aio.min.` refs. Dead deps uglify-js/clean-css/esbuild only imported by minifyService.js.
