fingerprint: 1gzakue
service: api
message: [update] ssLtxMlroUpBbio5J2KS articleId: 570605142187 update error Error: Error: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-07-31T10:33:56.287Z
status: deferred
attempt: 1

# BLOG · api · 1gzakue

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** The shared axios client in packages/functions/src/helpers/api.js is created with no `timeout`, so every Shopify Admin GraphQL call made through makeGraphQlApi waits forever on a stalled socket and the request is killed by Cloud Run's `timeoutSeconds: 540` instead of failing fast — 27 of the 37 504s in 24h are article endpoints on that path.

**Mechanism.** `const client = axios.create()` (api.js:9) sets no timeout, and axios 0.27's default is `timeout: 0` = wait indefinitely. Every article endpoint reaches Shopify through `makeGraphQlApi` -> `const handler = () => api(url, graphqlQuery, 'POST', {}, {headers})` (api.js:126) -> `client.request(...)` (api.js:28), so a socket that is accepted but never answers has no application-side deadline. The window 09:19-09:49 contains confirmed egress socket disruption on three independent destinations (7 ECONNRESET entries: Shopify TLS at 09:34:14.088931 via TLSWrap.onStreamRead, seoProxyApi POST /updateOvrList at 09:34:14.087973, Memorystore 10.68.191.235 at 09:31:08.989/09:31:09.606/09:35:23.223) — exactly the condition that leaves half-open sockets. 18 of the 21 5xx in the window are 504s and all 18 have a latency between 539.945662s and 539.948139s; across the full 24h all 37 504s fall in 539.9457-539.9682s, a 23ms spread against the `timeoutSeconds: 540` configured for `api` (functions/http.js:29). That is the Cloud Run request deadline expiring on a live container, not an application code path: an OOM kill (P3) would terminate at an arbitrary latency, and no 540s wait exists anywhere in the source. The 27 article-endpoint 504s (20 PUT /api/article/:id, 5 GET /api/article/:id, 2 GET /api/articles) all reach Shopify only through this client - `update`'s `Promise.all` (articleController.js:551) and `list`'s per-article `getShopifyArticleById` (articleController.js:670) — and the only unbounded await on those paths is `client.request`. Firestore and ioredis both carry their own deadlines and did fire in-window (`[createArticle] ... DEADLINE_EXCEEDED` at 09:29:02, `[redis.service] connected` reconnects), so they are excluded. The same repo already sets a bound on its other client — `axios.create({timeout: 60000})` at shopifyService.js:571 — so api.js:9 is the outlier, not the convention. Repeat evidence: PUT /api/article/596043464937 was retried by the admin UI 6 times inside 2m14s (09:26:53 through 09:29:07) and every one of the 6 hung the full 540s, which fits a stalled upstream socket rather than an in-process loop. NOTE ON THE ALERT LINE ITSELF: the `Error: Error: read ECONNRESET` message that fired this alert is fingerprint 1w64e0z, already fixed on branch fix/prod-blog-1w64e0z (commit c791df167, MR 810, unmerged) — `shopifyRetryGraphQL` testing `e.statusCode`. That is a second, distinct defect in the same function and is not re-reported here. The two interact: once MR 810 merges, ECONNRESET becomes retryable with maxRetries 5, and with no per-attempt timeout a hung socket will consume the 540s budget across attempts instead of one, so the timeout is a prerequisite for that fix being safe.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/api.js:9` — `const client = axios.create()` — no `timeout`, so axios 0.27 defaults to 0 (wait forever); the single client behind every makeGraphQlApi and seoProxyApi call
- `packages/functions/src/helpers/api.js:28` — `return client.request({...})` in api() — the unbounded await that holds the request open until Cloud Run kills it
- `packages/functions/src/helpers/api.js:126` — `const handler = () => api(url, graphqlQuery, 'POST', {}, {headers})` — every Shopify Admin GraphQL call routes through the timeout-less client
- `packages/functions/src/functions/http.js:29` — `timeoutSeconds: 540` on the `api` function — the limit all 37 504 latencies match to within 23ms
- `packages/functions/src/services/shopifyService.js:571` — `const client = axios.create({timeout: 60000})` — the repo's other axios client does bound itself, showing api.js:9 is the omission
- `packages/functions/src/controllers/articleController.js:551` — `Promise.all` in update() fans out to updateShopifyArticle and seoProxyApi, both on the unbounded client — the 20 PUT /api/article/:id 504s
- `packages/functions/src/controllers/articleController.js:670` — `await getShopifyArticleById({shop, id})` inside list()'s Promise.all — the 2 GET /api/articles and 5 GET /api/article/:id 504s

## Evidence
- 37 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T10:00:00Z" AND httpRequest.status=504`
- 27 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T10:00:00Z" AND httpRequest.status=504 AND httpRequest.requestUrl:"/api/article"`
- 21 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T09:19:16Z" AND timestamp<="2026-07-31T09:49:16Z" AND httpRequest.status>=500`
- 7 matching entries: `resource.labels.service_name="api" AND jsonPayload.message:"ECONNRESET" AND timestamp>="2026-07-31T09:19:16Z" AND timestamp<="2026-07-31T09:49:16Z"`

## Job
- analyze rounds: 1
- cost: $1.48

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
