# APC — `ai-product-copy`

| | |
|---|---|
| Prod project | `ai-product-copy` |
| Base branch | `master` |
| Test | `npx jest --ci` at repo root (5 test files — thin coverage; a reproduce test is most of the safety here) |
| Functions gen | gen2 (`firebase-functions/v2` in `src/index.js`) |
| Logger severity | **no** — bare `console.*`. See P7: the `errors` read will be empty for app errors. Read `stderr`. |

## Layout

```
packages/functions/src/
  index.js
  handlers/     api.js, apiSa.js, auth.js, authSa.js, cron/, embed.js, extension/, proxy/
  routes/
  controllers/
  services/
  pubsub/       fan-out work
  helpers/logger.js
  graphql/, presenters/, repositories/, middleware/, const/, config/
```

Deployed code is `packages/functions/lib/` — babel output, same relative paths, **different line
numbers**. Cite `src/`.

## Notes

- Prod project id equals the app name (`ai-product-copy`), and staging is
  `ai-product-copy-staging`. Confirm the id on any GCP read.
- This app is AI-generation heavy, so **P1 (truncated completion surfacing as a JSON parse error)** is
  the first pattern to test against the logs, not the last.
- 5 test files total (106 tests, ~15s). The baseline diff gate is weak here by construction: a
  reproduce test that fails before the fix and passes after is doing most of the work.
- The root jest run picks up `scripts/docs-gate/__tests__/`, and one of those tests —
  `gitContext.test.js` `changedFiles ... against the real repo` — shells out to git and asserts on
  the working tree. It fails on a clean checkout as of 2026-07-30 and its result moves with the state
  of the repo, so the baseline for this app is not stable across commits. Do not read it as a
  regression, and do not try to fix it as part of a prod-error MR.

## Incident history

None recorded by this project yet. Nothing in `patterns.md` is confirmed on `ai-product-copy` logs —
confirm before citing.
