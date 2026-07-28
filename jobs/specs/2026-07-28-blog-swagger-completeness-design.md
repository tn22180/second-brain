# Blog app — Swagger docs completeness

Date: 2026-07-28
Brief: `jobs/ts-jobs.md`
Repo: `projects/Falcon/blogs`, base `origin/master`

## Problem

An AI agent is being built against the blog app's Swagger docs (`packages/functions/src/docs/*.yaml`).
The docs are incomplete in three separate ways, so the agent can discover endpoints but cannot call
write endpoints without guessing the payload.

Measured on `origin/master` (`routes/api.js`, `docs/`, `devZoneController.js` are identical between
`origin/master` and the current working branch, so the measurement holds):

| Item | Code | Documented | Gap |
|---|---|---|---|
| Operations, `/api` + `/proxy` | 164 | 127 | 37 |
| — `/api` only | 147 | 126 | **21** |
| — `/proxy` only | 17 | 1 | 16 (out of scope) |
| Operations with a `requestBody` | 49 | 49 | — |
| — with real `properties` | | **1** | **48 are bare `type: object`** |
| Operations with a documented query parameter | — | **0** | all |
| `PUT /api/dev_zone` sub-types | 21 | 1 line | **20** |

The reporter counted 20 missing routes; the real figure is 37, because they did not count
`routes/proxy.js`. The 21 `dev_zone` types they reported is correct (the nested `switch` inside
`redis-get`, `devZoneController.js:633-648`, is a value-type switch, not a request type).

## Goal

An agent reading the spec can construct a valid request body for every `/api` write endpoint
without reading the source.

**Done is defined by a script, not by judgement:**

- every operation in `routes/api.js` appears in the built spec, and
- no operation has a `requestBody` whose schema is a bare `type: object`.

## Scope

In:

- the 21 undocumented `/api` operations
- `PUT /api/dev_zone` — all 21 types
- the 48 empty `requestBody` schemas
- query parameters for `/api` GET operations that read `ctx.query`

Out:

- the 16 `/proxy` operations. Storefront app-proxy endpoints, authenticated by Shopify proxy
  signature rather than the bearer token the agent holds; documenting them needs a second
  security scheme and the agent will not call them.
- any change to runtime code. The diff is docs + one script.
- a CI gate. The coverage script is committed and run by hand.

## Approach

### Source of truth

Every documented field must trace to a line of code that exists. For each route in
`routes/api.js`: open the controller, read the `ctx.req.body` / `ctx.query` destructure, and when
the controller forwards an object straight to a service, read the service too. A field that cannot
be traced to a line is not documented.

This is manual rather than script-extracted. A regex over `const {a, b} = ctx.req.body` misses bodies
consumed inside a service, cannot infer types, and cannot tell required from optional — and a
confidently wrong schema is worse for the agent than the empty one it replaces.

### Wiring

`config/swagger.js:57` globs `src/docs/*.yaml`, so new files are picked up with no config change.
New files needed: `token-history.yaml`, `knowledge-base.yaml`. Everything else extends an existing
file.

### dev_zone

`PUT /api/dev_zone` dispatches on `body.type` across 21 cases. Model it as `oneOf` with
`discriminator: {propertyName: type}`, one schema per type under `components.schemas`. This gives
the agent a per-type payload instead of one union of every field, and Swagger UI renders a type
picker.

The 21 types: `sync-shop-data`, `create-file-sidebar`, `legacy-plan`, `create-page`,
`update-token-free`, `set-token`, `clear-token-logs`, `import-1000-articles`, `batch_create_reviews`,
`match_reviews_with_shops`, `get_new_reviews`, `hide_embed_audit_skip_button`, `sync-author`,
`sync-products-blog`, `redis-ping`, `redis-get`, `redis-keys`, `redis-info`, `redis-set`,
`redis-del`, `redis-stores`.

### Coverage script

`packages/functions/scripts/check-swagger-coverage.js`, plus an npm script. Builds the spec with
`swagger-jsdoc`, parses `routes/api.js`, prints undocumented operations and empty-schema
operations, exits non-zero if either list is non-empty. It is the pass/fail for tasks 3-6 and the
thing that makes a later regression visible.

Not wired into `.gitlab-ci.yml` — that would block the whole team's MRs and needs its own
conversation first.

## Tasks

| # | Task | Verified by |
|---|---|---|
| 1 | Worktree on `docs/swagger-completeness` from `origin/master`; write the coverage script | Script runs, reports 21 missing / 48 empty — reproducing the numbers above |
| 2 | Inventory: 147 routes → controller → field list with `file:line` per field | Inventory covers all 147; spot-check 5 entries against source |
| 3 | Document the 21 missing `/api` operations | Script's missing list is empty |
| 4 | `dev_zone` — 21 type schemas, `oneOf` + discriminator | All 21 present; spec builds |
| 5 | Fill the 48 empty `requestBody` schemas | Script's empty-schema list is empty |
| 6 | Query parameters for GET operations reading `ctx.query` | Every such route has its params; count fixed in task 2 |
| 7 | Final verification | Script exits 0; `swaggerJSDoc` builds clean; Swagger UI renders |

Task 2 gates 3-6. Tasks 3-6 are otherwise independent.

## Risks

- **A schema that is wrong reads as authoritative.** Mitigated by the trace-to-a-line rule and by
  reviewing each task's output against source before marking it done.
- **Task 2 is the long pole** — 147 routes. If the field list for a route is genuinely unreadable
  from source, the route is listed as such in the inventory rather than guessed at.
- **`master` moves during the work.** Re-check the three source files against `origin/master`
  before opening the MR.

## Deliverable

One MR into `master`, docs-only plus `scripts/check-swagger-coverage.js`.
