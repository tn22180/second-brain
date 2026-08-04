fingerprint: 1yp9x9h
service: handledowngradespeedupgen2
message: 'Memory limit of 1024 MiB exceeded with 1044 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-04T03:14:11.767Z
status: infra
attempt: 1

# SEO · handledowngradespeedupgen2 · 1yp9x9h

**Outcome.** infra class — reported, no MR

**Root cause.** One single downgradeSpeedUp message OOM-killed its own dedicated 1GiB instance after 183.33s because subscribeHandleDowngradeSpeedUp re-fetches the shop's entire theme file set up to 4 times via handleGetAllThemeData, whose recursive pagination keeps every intermediate page array and raw GraphQL response alive for the whole recursion instead of one accumulator.

**Mechanism.** Exactly one request log exists on the killed instance: start 2026-08-04T03:00:11.077116Z, latency 183.333004777s, instanceId 001548f72987a219e5362..., same instanceId as the OOM entry. 03:00:11.077116 + 183.333004777s = 03:03:14.410, and the kill lands at 03:03:14.594980Z — 0.185s later. So this is not co-tenancy: one message alone exceeded 1044 MiB, and the missing `concurrency` on handleDowngradeSpeedUpGen2 (pubsubFunctions.js:270, unlike its sibling at :262 which was pinned to 1 for exactly this reason) is not what fired here. The only large allocation on this code path is theme file bodies. subcribeDowngradeSpeedUp.js calls handleGetAllThemeData four separate times (lines 19, 24, 29, 34), once per action absent from actionList, with no reuse — a shop downgrading off all four speed-up actions pays four full theme downloads. Each call is a recursive paginator: the query pulls files(first: 250) with the full body inline, both `content` and `contentBase64` (shopifyGraphQlService.js:3217, :3224), then does `data = [...edges, ...newEdges]` and `return await handleGetAllThemeData({edges: data})` (:3265-3266). Because the parent frame is suspended on `await`, its `result`, `resultFiles`, `newEdges` and `data` stay reachable for the entire chain — page 1's 250-node array, page 2's 500-node array, page 3's 750-node array all coexist, so retention is O(pages²) in theme size, not O(theme). On return the final `data.map(...)` (:3276) builds a second full copy carrying both `value` and `contentBase64` while `data` is still live. On top of that every gen2 container in this repo boots the whole src/ import graph because app.js:13-19 re-exports all four handler modules (measured boot floor 516-533 MiB in incident zd4n21), and the container took 66s to pass its startup probe (03:00:11 start -> 03:01:17.899 probe OK), leaving roughly 500 MiB of real headroom under the 1024 MiB cap. Rare, not systemic: 2 OOMs in 30 days on this service, 1 in 24h against 33 instance starts, and it is the only severity>=ERROR entry for the service in 24h — so it is one unusually large theme, not a regression.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:270` — memory: '1GiB' — the cap the 1044 MiB run exceeded; also note no `concurrency` override here
- `packages/functions/src/handlers/exports/pubsubFunctions.js:255` — the sibling speed-up subscriber carries an explicit concurrency: 1 with a comment recording a previous 1GiB OOM from default 80-message packing — precedent for pinning this one too
- `packages/functions/src/handlers/pubsub/subcribeDowngradeSpeedUp.js:19` — first of four independent handleGetAllThemeData calls in one message; nothing is reused across branches
- `packages/functions/src/handlers/pubsub/subcribeDowngradeSpeedUp.js:34` — fourth full theme fetch in the same invocation
- `packages/functions/src/services/shopifyGraphQlService.js:3217` — files(first: 250) with inline body — 250 whole theme files per page held as JS strings
- `packages/functions/src/services/shopifyGraphQlService.js:3224` — both contentBase64 and content are requested and both survive into the mapped result, doubling per-file bytes
- `packages/functions/src/services/shopifyGraphQlService.js:3265` — `data = [...edges, ...newEdges]` allocates a fresh full-size array per page while the previous one is still referenced by the suspended frame
- `packages/functions/src/services/shopifyGraphQlService.js:3266` — recursion inside await keeps every ancestor frame's page array and raw GraphQL response reachable — retention scales with page count squared
- `packages/functions/src/services/shopifyGraphQlService.js:3276` — final data.map builds a second complete copy of the theme while `data` is still live
- `packages/functions/src/app.js:13` — export * of every handler module — each gen2 container boots the whole src/ graph (516-533 MiB measured in incident zd4n21), cutting real headroom to ~500 MiB

## Evidence
- 1 matching entries: `(resource.labels.service_name="handledowngradespeedupgen2") AND timestamp>="2026-08-04T02:48:29Z" AND timestamp<="2026-08-04T03:18:29Z" AND textPayload:"Memory limit"`
- 1 matching entries: `(resource.labels.service_name="handledowngradespeedupgen2") AND timestamp>="2026-08-04T02:48:29Z" AND timestamp<="2026-08-04T03:18:29Z" AND logName:"requests"`
- 4 matching entries: `(resource.labels.service_name="handledowngradespeedupgen2") AND timestamp>="2026-08-04T02:48:29Z" AND timestamp<="2026-08-04T03:18:29Z"`
- 2 matching entries: `(resource.labels.service_name="handledowngradespeedupgen2") AND timestamp>="2026-07-05T00:00:00Z" AND timestamp<="2026-08-04T03:18:29Z" AND textPayload:"Memory limit"`
- 33 matching entries: `(resource.labels.service_name="handledowngradespeedupgen2") AND timestamp>="2026-08-03T03:18:29Z" AND timestamp<="2026-08-04T03:18:29Z" AND textPayload:"Starting new instance"`

## Job
- analyze rounds: 2
- cost: $3.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
