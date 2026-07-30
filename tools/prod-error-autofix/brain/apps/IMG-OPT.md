# IMG-OPT — `avada-image-optimizer`

| | |
|---|---|
| Prod project | `app-plaza-image-optimizer` |
| Base branch | `master` |
| Test | `npx jest --ci` at repo root (60 test files; `packages/functions` has its own config and jest 30, root has jest 24 — the root run is the superset, 60 vs 56) |
| Functions gen | gen2 (`firebase-functions/v2` in `src/index.js`) |
| Logger severity | **no** — bare `console.*`. See P7: the `errors` read will be empty for app errors. Read `stderr`. |

## Layout

```
packages/functions/src/
  index.js
  cloudRunWorker.js   Cloud Run worker entry — not a Cloud Function
  handlers/           aiApi.js, api.js, apiSa.js, apiSaV2.js, apiV2.js, auth.js, authSa.js, cron/
  routes/
  controllers/
  services/
  helpers/logger.js
  featureReq/, presenters/, repositories/, transformers/, middleware/
```

Deployed code is `packages/functions/lib/` — babel output, same relative paths, **different line
numbers**. Cite `src/`.

## Notes

- `cloudRunWorker.js` means image work runs outside the function runtime. An alert whose service is
  not one of the `handlers/*` names is probably that worker or a Cloud Run job; check the service name
  in the alert header before assuming a controller is involved.
- Cloud Run jobs expose **no deploy timestamp**, so a fix for a job error cannot be auto-confirmed as
  shipped and will not escalate to a second attempt on its own.
- `scripts/docs-gate/` has its own jest config, run via the `docs-gate-test` script. It is not part of
  the root run and is not part of the smoke gate.
- Staging is `seoon-image-optimizer-staging`; `staging3` points at `seoon-blog-staging-6` and
  `staging4` at `avada-speed-stg4` — do not infer a project id from a staging alias. Confirm it.

## Incident history

None recorded by this project yet. Nothing in `patterns.md` is confirmed on
`app-plaza-image-optimizer` logs — confirm before citing.
