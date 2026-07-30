# AEO — `llm-ai-search-seo`

| | |
|---|---|
| Prod project | `seo-on-aeo` |
| Base branch | **`main`** — the only one of the five that is not `master` |
| Test | `npx jest --ci` at repo root (5 test files; `test` script exists here) |
| Functions gen | **gen1** — no `firebase-functions/v2` anywhere in `src/`. Deploy time reads from `gcloud functions describe --format=value(updateTime)` (verified 2026-07-28T07:49:57Z on `proxy`). |
| Logger severity | **no** — bare `console.*`. See P7: the `errors` read will be empty for app errors. Read `stderr`. |

## Layout

```
packages/functions/src/
  index.js
  handlers/     api.js, apiSa.js, auth.js, authSa.js, cron/, embed.js,
                onCreateShop.js, onUpdateShop.js
  routes/
  controllers/
  services/
  helpers/logger.js
  graphql/, presenters/, repositories/, transformers/, middleware/, resources/
```

Deployed code is `packages/functions/lib/` — babel output, same relative paths, **different line
numbers**. Cite `src/`.

## Notes

- **Branch is `main`.** A fix branched from `master` here would target a branch that does not exist,
  and the MR would fail to open.
- gen1 means the resource labels in logs use `function_name`, not `service_name`. The log filter
  already matches both, so this only matters if you write a filter by hand.
- `onCreateShop` / `onUpdateShop` are Firestore triggers, not HTTP. An alert for one of those has no
  `httpRequest` at all, so the `requests` read will be empty by definition — that is not a finding.
- Staging is `seoon-llm-ai-search`; `dev-ethan` points at `avada-seo-staging-7`. Confirm the project
  id on any GCP read.

## Incident history

None recorded by this project yet. Nothing in `patterns.md` is confirmed on `seo-on-aeo` logs —
confirm before citing.
