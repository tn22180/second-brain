---
name: seo-app-is-local
description: "seo prod leaves APP_IS_LOCAL unset (isLocal falsy); only the staging4 worker box sets it true"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

`app.isLocal` = `process.env.APP_IS_LOCAL` (`packages/functions/src/config/app.js:15`). Callers gate
on `=== 'true'` (e.g. `optimizeImageJob.js:89`, `verifyProxySignature.js`), so **unset → undefined →
falsy → not local**.

Production does **not** set `APP_IS_LOCAL`; only `packages/functions/.env.staging4:41` sets
`APP_IS_LOCAL=true` (the local worker-sim box on staging4). When reasoning about a prod vs local code
path, assume prod is non-local by default. See [[seo-env-avada-seo-local-override]].
