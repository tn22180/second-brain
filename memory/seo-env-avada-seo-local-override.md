---
name: seo-env-avada-seo-local-override
description: "seo .env.avada-seo is a local-only override for hand-deploying functions to prod; canonical prod env comes from CI PRODUCTION_ENV_FILE"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

`packages/functions/.env.avada-seo` (gitignored) is a **local-only override for deploying functions
by hand to the production project** (`avada-seo`). Firebase v2 merges `.env` then `.env.<projectId>`,
so these keys win on local prod deploys — giving `internalGen2` (and any other function deployed
locally to prod) the real prod cache-Redis + `APP_ENV=production` (which attaches the VPC connector).

`internalGen2` is a **Cloud Function v2 handler** (`src/handlers/exports/httpFunctions.js:94`), *not*
an env var — correcting a garbled inbox candidate ("internalGen2 env chỉ set từ CI"). The canonical
production env is **not** this file: it comes from GitLab `PRODUCTION_ENV_FILE` on CI tag deploys.
This file only matters when a dev deploys to prod from their machine. See [[seo-app-is-local]].
