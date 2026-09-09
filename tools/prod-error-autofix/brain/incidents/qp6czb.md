fingerprint: qp6czb
service: apigen2
message: HTTP 500 GET /api/genFaqBulk/fWnE11VkwlBaGq5ShBiu
app: SEO
repo: seo
date: 2026-09-09T08:06:05.802Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · qp6czb

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /api/genFaqBulk/fWnE11VkwlBaGq5ShBiu returns 500 deterministically because that bulk's item list holds at least one Shopify resource gid that no longer resolves; Shopify's `nodes(ids:)` answers a literal `null` element for it, fetchResourcesData spreads that null through unfiltered, and getPaginatedBulkResources dereferences `r.id` on it — the same defect already recorded as fingerprint 17g9p6f on apisagen2, now confirmed on apigen2 with a different bulk id.

**Mechanism.** routes/api.js:404 binds GET /genFaqBulk/:id to generateBulkController.getOne, which calls getPaginatedBulkResources (generateBulkController.js:79 → generateBulkService.js:475). That reads the bulk's items, takes the page slice, groups the resourceGids by type (groupResourcesByType) and issues one `nodes(ids: $ids)` GraphQL document per type via fetchResourcesData (generateBulkService.js:416-437). Shopify returns a `null` array element for every gid that no longer resolves (deleted/unpublished), and fetchResourcesData spreads `collections?.nodes || []` / products / blogs / pages straight into its return with no per-element guard (generateBulkService.js:433-436), so the null survives into `fetched`. generateBulkService.js:497 then builds `new Map(fetched.map(r => [r.id, r]))` and the null deref throws `TypeError: Cannot read properties of null (reading 'id')`. The `.filter(Boolean)` one line later (:498) guards the lookup result, not the Map build, so it never runs. getOne's catch (generateBulkController.js:84) logs `[getOne] <message>` and, since the message is not 'Forbidden', answers 500 (:89). Both stderr lines in the window are exactly `[getOne] Cannot read properties of null (reading 'id')`, each emitted at its request's start timestamp + that request's own httpRequest.latency to within 0.8 ms and 2.3 ms respectively (08:03:32.174979 + 0.496939s = 08:03:32.6719 vs logged 08:03:32.672699; 08:03:31.370315 + 0.543752s = 08:03:31.9141 vs logged 08:03:31.916323).

Confidence: `high`

## Code
- `packages/functions/src/services/generateBulkService.js:497` — `const byId = new Map(fetched.map(r => [r.id, r]));` — the unguarded deref that throws "Cannot read properties of null (reading 'id')"; the .filter(Boolean) that would have caught it is one line later at :498
- `packages/functions/src/services/generateBulkService.js:433` — fetchResourcesData spreads `...(collections?.nodes || [])` (products/blogs/pages at :434-436) with no per-element null filter, so Shopify's null nodes reach the caller
- `packages/functions/src/services/generateBulkService.js:462` — second, identical call site — `new Map(resources.map(r => [r.id, r]))` in getCompletedBulkResources, reached from GET /genFaqBulk/:id/resources (api.js:405); fixing only :497 leaves this one live
- `packages/functions/src/graphql/query/collections/collections.graphql:2` — `nodes(ids: $ids)` with an inline fragment — Shopify returns one null element per gid that no longer resolves; products.graphql:2 is the same shape (blogs/pages likewise)
- `packages/functions/src/controllers/generateBulkController.js:84` — the catch that emitted the alerted stderr line; anything with message !== 'Forbidden' becomes a 500 at :89, and the log omits shopID/bulkId and the error object, so the failing bulk cannot be identified from logs alone
- `packages/functions/src/routes/api.js:404` — router.get('/genFaqBulk/:id', generateBulkController.getOne) — binds the alerted path to this handler

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-09T07:48:45Z" AND timestamp<="2026-09-09T08:18:45Z" AND httpRequest.requestUrl:"/api/genFaqBulk/fWnE11VkwlBaGq5ShBiu"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-09T07:48:45Z" AND timestamp<="2026-09-09T08:18:45Z" AND textPayload:"[getOne] Cannot read properties of null"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-09T07:48:45Z" AND timestamp<="2026-09-09T08:18:45Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
