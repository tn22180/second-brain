fingerprint: 1mnhmld
service: apigen2
message: HTTP 500 GET /api/genFaqBulk/R5nyrLFdA1S8NEhjuH8k/resources
app: SEO
repo: seo
date: 2026-08-18T10:02:07.999Z
status: mr_open
attempt: 1

# SEO · apigen2 · 1mnhmld

**Outcome.** MR opened: https://git.avada.net/avada/seo/-/merge_requests/2164

**Root cause.** Shopify's `nodes(ids:)` query returns a null element for every gid that no longer resolves (deleted/unpublished resource), and getCompletedBulkResources builds its lookup Map with `new Map(resources.map(r => [r.id, r]))` without filtering nulls, so GET /api/genFaqBulk/:id/resources throws TypeError: Cannot read properties of null (reading 'id') and the controller answers 500.

**Mechanism.** The alerted request is GET /api/genFaqBulk/R5nyrLFdA1S8NEhjuH8k/resources?cursor=10&limit=10&tab=product for shop KlKe5cD4YvquTOqwWkuH. The bulk doc is finished (completedCount+errorCount === totalCount), so generateBulkController.getResources takes the isJobDone branch and calls getCompletedBulkResources (controller line 166 — matches the stack frame `getResources (/workspace/lib/controllers/generateBulkController.js:166:22)`). That function slices gids[10..20] from the persisted bulk items, groups them by type and calls fetchResourcesData, which issues `query getProductsByIdsGraphql($ids:[ID!]!){nodes(ids:$ids){... on Product{id ...}}}`. Shopify answers HTTP 200 with a `nodes` array containing `null` at the position of any gid that no longer exists in the shop; fetchResourcesData spreads that array through unchanged (`...(products?.nodes || [])`), and the very next line `const byId = new Map(resources.map(r => [r.id, r]))` dereferences `r.id` on the null → TypeError. The prod stack pins it exactly: `at /workspace/lib/services/generateBulkService.js:528:46 / at Array.map / at getCompletedBulkResources (...:528:34)` — that babel-output line is `packages/functions/src/services/generateBulkService.js:462`. withShopifyRetry does not retry (not a throttle), the catch at controller line 261 logs `[getResources] <shopId> <bulkId> ...` and sets ctx.status = 500. Both alerted 500s are the same shop, same bulk id, same page — a deterministic failure the merchant's page re-fired 1.0s apart, not a transient upstream fault.

Confidence: `high`

## Code
- `packages/functions/src/services/generateBulkService.js:462` — `const byId = new Map(resources.map(r => [r.id, r]));` — the exact throwing line; babel output lib/services/generateBulkService.js:528:46 in the prod stack
- `packages/functions/src/services/generateBulkService.js:432` — fetchResourcesData spreads `products?.nodes` etc. straight through, so Shopify's null entries for unresolvable gids survive into `resources`
- `packages/functions/src/graphql/query/products/products.graphql:2` — `nodes(ids: $ids)` — the Shopify field that yields null per unresolvable id; identical shape in the collections/pages/blogs documents
- `packages/functions/src/controllers/generateBulkController.js:166` — isJobDone branch calls getCompletedBulkResources — the `getResources (...:166:22)` frame in the prod stack
- `packages/functions/src/controllers/generateBulkController.js:261` — catch logs `[getResources] shopID id e.message e` and sets 500 — produces the exact stderr line seen in the window
- `packages/functions/src/services/generateBulkService.js:497` — getPaginatedBulkResources (GET /api/genFaqBulk/:id) repeats the same unguarded `new Map(fetched.map(r => [r.id, r]))` — same defect on a second entry point, not yet alerted

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-18T09:41:50.305Z" AND timestamp<="2026-08-18T10:11:50.305Z" AND logName:"stderr" AND textPayload:"[getResources]"`
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-18T09:41:50.305Z" AND timestamp<="2026-08-18T10:11:50.305Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-18T09:41:50.305Z" AND timestamp<="2026-08-18T10:11:50.305Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.85
- branch: `fix/prod-seo-1mnhmld`
- fix commit: `9f0b8901c6d74a2668f7b713e6192cc35289d52b`
- MR: https://git.avada.net/avada/seo/-/merge_requests/2164
- tests: 1126 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/services/generateBulkService.js | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
