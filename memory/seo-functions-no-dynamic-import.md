---
name: seo-functions-no-dynamic-import
description: "seo packages/functions — `await import('@functions/...')` passes jest but throws ERR_MODULE_NOT_FOUND in prod; lazy-load with require"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d9f700f9-18f8-43eb-8852-b9f16cc1d3b7
  modified: 2026-10-08T04:04:53.055Z
---

In seo `packages/functions`, `.babelrc` excludes `proposal-dynamic-import`, so babel emits a native `import()` of an extensionless lib path. At runtime Node's ESM loader throws `ERR_MODULE_NOT_FOUND`. Jest transforms the call, so tests stay green.

Codex reaches for `await import()` to keep heavy modules (Elasticsearch, puppeteer) out of jest 24, which cannot resolve `node:*`. It did this in round 2 of !2270 (fixed in commit 7fa54f5e351, verified on the babel output 2026-10-08).

**Why:** this is a silent prod crash that no test catches.

**How to apply:** when reviewing any seo functions diff, grep for `await import(`. The only safe forms are lazy `require('@functions/...')` (the pattern in shopifyGraphQlService.refreshChecklistAfterWrite) or a bare npm package specifier. Put this in Codex prompts for seo. Related: [[codex-astra-codes]].
