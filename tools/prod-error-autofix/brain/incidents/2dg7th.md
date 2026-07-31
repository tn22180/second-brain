fingerprint: 2dg7th
service: api
message: [createArticle] fKUMrHXwtJca3KNWMU6X 4 DEADLINE_EXCEEDED: Deadline exceeded
app: BLOG
repo: blogs
date: 2026-07-31T09:33:21.537Z
status: infra
attempt: 1

# BLOG · api · 2dg7th

**Outcome.** infra class — reported, no MR

**Root cause.** The Firestore Commit RPC behind `collection.add()` in `createArticle` hit its 60s per-attempt deadline on one POST /api/article/create; `createArticle` swallowed the error and returned null, and `articleController.create` never checks that return value, so the request answered HTTP 200 `{success: true}` with the Shopify article created but no local `articles` version doc written.

**Mechanism.** Request log: `POST /api/article/create` starts 2026-07-31T09:28:00.976Z with latency 61.179025773s, status 200. The three sibling `/api/article/create` calls in the same 15-min window ran 0.843s / 0.852s / 1.043s, so ~1.18s is the normal Shopify-side work and the remaining 60.0s is one blocked Firestore Commit. `node_modules/@google-cloud/firestore/build/src/v1/firestore_client_config.json` sets `google.firestore.v1.Firestore.Commit` `timeout_millis: 60000` with `retry_codes_name: resource_exhausted_unavailable` — DEADLINE_EXCEEDED is not a retryable code there, so gax throws after one 60s attempt. That throw lands in the catch at packages/functions/src/repositories/articleRepository.js:24, which logs `[createArticle] fKUMrHXwtJca3KNWMU6X 4 DEADLINE_EXCEEDED: Deadline exceeded` at 09:29:02.160867Z (= 09:28:00.976 + 61.18s) and returns `null` (line 26) instead of rethrowing. `createArticle` is one leg of the `Promise.all` at packages/functions/src/controllers/articleController.js:318; with the rejection converted to `null` the Promise.all resolves, execution falls through to `void logCreateBlogEvent(shop)` at line 332 — which is exactly what emits the next log line, 0.58ms later at 09:29:02.161449Z with stack frame `at create (/workspace/lib/controllers/articleController.js:297:68)` → `logCreateBlogEvent (/workspace/lib/services/eventLogService.js:41:53)` — and then line 333 returns `{success: true, data: article.id...}`. Net: Shopify has the article, Firestore has no version row, merchant and UI were told it succeeded.

Confidence: `high`

## Code
- `packages/functions/src/repositories/articleRepository.js:17` — `await collection.add(...)` — the Firestore Commit that exhausted its 60s deadline
- `packages/functions/src/repositories/articleRepository.js:25` — the catch that emits the exact alert string `[createArticle] <shopId> <message>`
- `packages/functions/src/repositories/articleRepository.js:26` — `return null` — converts a failed write into a normal return, hiding it from every caller
- `packages/functions/src/controllers/articleController.js:318` — `await Promise.all([createArticle(...), upsertReport(...)])` — return value of createArticle is discarded, so null is indistinguishable from success
- `packages/functions/src/controllers/articleController.js:332` — `void logCreateBlogEvent(shop)` — the line whose failure log at 09:29:02.161449Z proves execution continued past the failed write inside `create`
- `packages/functions/src/controllers/articleController.js:333` — returns `{success: true}` — why the request logged HTTP 200 despite losing the write
- `packages/functions/src/services/eventLogService.js:41` — `logCreateBlogEvent` — the frame named in the 09:29:02.161449Z stack, tying that line to `create`
- `packages/functions/src/functions/http.js:29` — api `timeoutSeconds: 540` — request was nowhere near the function timeout, so the 61.18s is a downstream RPC deadline, not a Cloud Run cutoff

## Evidence
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T09:14:04.160Z" AND timestamp<="2026-07-31T09:44:04.160Z" AND jsonPayload.tag="[createArticle]"`
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T09:20:00Z" AND timestamp<="2026-07-31T09:35:00Z" AND httpRequest.requestMethod="POST" AND httpRequest.requestUrl:"/api/article"`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T09:29:02Z" AND timestamp<="2026-07-31T09:29:03Z" AND textPayload:"Failed to log event"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:00:00Z" AND timestamp<="2026-07-31T10:00:00Z" AND "DEADLINE_EXCEEDED"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
