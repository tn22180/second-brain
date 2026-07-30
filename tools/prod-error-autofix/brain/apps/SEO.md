# SEO — `seo`

| | |
|---|---|
| Prod project | `avada-seo` |
| Base branch | `master` |
| Test | `npx jest --ci` at repo root (97 test files — the largest suite of the five) |
| Functions gen | gen2 (`firebase-functions/v2` in `handlers/exports/`) |
| Logger severity | **no** — `helpers/logger.js` is bare `console.*`. See P7: the `errors` read will be empty for app errors. Read `stderr`. |

## Layout

```
packages/functions/src/
  index.js, app.js
  handlers/     api.js, apiSa.js, apiSaV2.js, apiV2.js, auth.js, authSa.js, chatbot/, exports/
  routes/       route registration
  controllers/  request handlers
  services/     Shopify, AI, Firestore
  jobs/         self-chaining fan-out work
  helpers/logger.js
  sitemap.js, graphql/, presenters/, repositories/, transformers/, middleware/
```

Deployed code is `packages/functions/lib/` — babel output, same relative paths, **different line
numbers**. Cite `src/`.

## What is different about this app

- It is not only Cloud Functions. There is a **self-hosted BullMQ/Redis worker fleet** reached over a
  Tailscale mesh, and a **Cloud Run job** (`avada-seo-optimize-image-job`) for image optimization. An
  alert whose service is `job:avada-seo-optimize-image-job` is that job, not a function.
- Cloud Run jobs expose **no deploy timestamp** (only `creationTimestamp` and a `generation`
  counter), so a fix for a job error cannot be auto-confirmed as shipped.
- `Command timed out` from Redis is normally **not** a Redis problem: Memorystore was measured idle
  (1% CPU, 7.2k keys) while these appeared. It is the 200ms client-side budget. Do not propose
  resizing Redis.
- `APP_IS_LOCAL` is unset in prod, so `isLocal` is falsy there. Only staging4 sets it true.
- `jest.config.js` ignores `<rootDir>/.claude/worktrees/` because a worktree is a full checkout and
  jest otherwise collects every test twice.
- `master` redeploys the prod worker **only** when the commit title contains `[deploy-worker]`.
  Auto-detection lives on `feat/worker-pubsub-migration`, not on `master`.
- `.env.avada-seo` in the repo is a local-only override for hand-deploying functions to prod. The
  canonical prod env is the CI `PRODUCTION_ENV_FILE`.

## Incident history

None recorded by this project yet. The BLOG triage in `patterns.md` is the seed; several patterns
(P1 truncated completions, P2 undefined params, P3 OOM, P7 blind sink) are code-lineage issues that
plausibly exist here too, but nothing is confirmed on `avada-seo` logs. Confirm before citing.
