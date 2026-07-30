app Blog
HTTP 500 POST /apiSa/gen-ai-suggested/recommendBlogPost
 HTTP 500 POST /apiv2/apiV2/langgraph/blog
HTTP 500 GET /proxy/tags
HTTP 500 GET /proxy/posts-by-tag
HTTP 500 POST /api/gen-ai-suggested/secondarySeoKeyword
HTTP 500 POST /api/gen-ai-suggested/mainSeoKeyword
HTTP 500 POST /api/gen-ai-suggested/topic
HTTP 500 PUT /api/article/625529717083
HTTP 504 GET /api/get-list-ai-image
HTTP 500 GET /proxy/seoOn-preview
HTTP 500 POST /api/audit-agent/fix-issue

---

## Progress

Started: 2026-07-30

Scope: all 11 endpoints live in `blogs` repo → prod project `avada-blog-app`.
Deliverable: triage report + root cause. No code changes, no Jira.
Evidence: `gcloud logging read` on `avada-blog-app`, window = last 24h.
Tree: local `blogs` is on `feat/openrouter-prompt-cache`, **26 commits behind `origin/master`** — not usable for citations. All code refs below come from a detached worktree at `origin/master` = `aad0e1df7` (2026-07-28).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Pull GCP error logs (avada-blog-app, 24h) | ✅ | 257 5xx requests, 1592 app error lines |
| 2 | Map each endpoint → route/controller file:line | ✅ | 11 log lines → 7 distinct handlers |
| 3 | Root-cause each of the 11 endpoints | ✅ | 9/11 confirmed from logs, 2 not recoverable (see L8) |
| 4 | Write triage report into this file | ✅ | log pass below; corrects S1, S2, S6, S7 |
| 5 | Verify every citation exists on disk | ✅ | 21/21 file:line confirmed on `aad0e1df7` |
| 6 | Apply fixes on `fix/prod-5xx-observability` | ✅ | 5 files + 2 test suites; jest 164 passed |
| 7 | Push branch and open MR to `master` | ✅ | pushed `b8152fe6b`; MR opened by Tony via link (no glab token) |

### Log

#### ✅ Task 1: Pull GCP error logs
- Status: ✅ completed
- Started: 2026-07-30 — was blocked on `gcloud auth login`, unblocked same day
- Completed: 2026-07-30
- Pulled: 257 request-log entries with `httpRequest.status>=500`, 1592 application error lines,
  47 Firestore `UNAUTHENTICATED`, 14 entries carrying `severity=ERROR`. Findings in the
  **Log pass** section at the end of this file, which corrects S1, S2, S6 and S7.

#### ✅ Task 2: Map endpoints to code
- Status: ✅ completed
- Completed: 2026-07-30
- Tree: `origin/master` @ `aad0e1df7`

| # | Endpoint (from log) | Route reg | Handler |
|---|---------------------|-----------|---------|
| 1 | POST `/apiSa/gen-ai-suggested/recommendBlogPost` | `routes/api.js:274` (`/gen-ai-suggested/:type`), mounted `handlers/apiSa.js:41` | `controllers/genAIBlogController.js:192` `genSuggested` |
| 2 | POST `/apiv2/apiV2/langgraph/blog` | `routes/api.js:275`, mounted `handlers/apiV2.js:67` | `controllers/langGraphController.js:40` `generate` |
| 3 | GET `/proxy/tags` | `routes/proxy.js:36` | `controllers/tag.controller.js:60` `listStorefront` |
| 4 | GET `/proxy/posts-by-tag` | `routes/proxy.js:37` | `controllers/tag.controller.js:91` `getPostsByTag` |
| 5 | POST `/api/gen-ai-suggested/secondarySeoKeyword` | `routes/api.js:274` | same as #1 |
| 6 | POST `/api/gen-ai-suggested/mainSeoKeyword` | `routes/api.js:274` | same as #1 |
| 7 | POST `/api/gen-ai-suggested/topic` | `routes/api.js:274` | same as #1 |
| 8 | PUT `/api/article/625529717083` | `routes/api.js:98` (`/article/:id`) | `controllers/articleController.js:508` `update` |
| 9 | GET `/api/get-list-ai-image` (504) | `routes/api.js:260` | `controllers/genImageAIController.js:69` `get` |
| 10 | GET `/proxy/seoOn-preview` | `routes/proxy.js:21` (behind `verifyAppProxySignature`) | `controllers/appProxyController.js:98` `getPreview` |
| 11 | POST `/api/audit-agent/fix-issue` | `routes/api.js:264` | `controllers/auditAgentController.js:50` `fixAuditIssue` |

Note: #1, #5, #6, #7 are the **same handler** (`genSuggested`, dispatched by `:type`) — likely one root cause, four symptoms. #1 differs only by mount point (`/apiSa` = standalone/session-auth app vs `/api` = embedded).

#### ✅ Task 3: Root-cause endpoints
- Status: ✅ completed — static pass below, log pass in the **Log pass** section at the end.

> **Read the Log pass section before relying on anything here.** S1, S2 and S6 were disproved by the
> logs: the `/proxy/*` failures are 0.15–0.43s fast-fails and not instance saturation (S1);
> `get-list-ai-image` is 48× 503 plus a 504 at exactly the function's own 540s timeout, not a
> Hosting 60s cap (S2); and the langGraph 500s produce no `[unhandledError]` line at all (S6).
> S3, S4, S5 and S7's location held up.

All refs below verified on `origin/master` = `aad0e1df7`. No log evidence at the time of writing, so
nothing in this section is a confirmed root cause of a specific log line; these are defects that
exist in the code regardless, plus the constraints any log-based root cause has to fit.

**Infrastructure**

- **S1 — `proxy` function is capped at one instance.** `packages/functions/src/functions/http.js:55-58`:
  `{memory: '512MiB', cpu: 1, timeoutSeconds: 60, maxInstances: 1, concurrency: 80}`. Every
  storefront request for every shop (`/proxy/tags`, `/proxy/posts-by-tag`, `/proxy/seoOn-preview`)
  is served by a single container with 1 vCPU. 3 of the 11 error lines are `/proxy/*`. This is the
  only function in the file with `maxInstances: 1` — `api` gets 100, `apiv2` 10, `apiSa` 5.
  Storefront-facing: these 500s are seen by end shoppers, not merchants in admin.
- **S2 — the 504 cannot be a function timeout.** `/api/get-list-ai-image` routes to function `api`,
  which has `timeoutSeconds: 540` (`http.js:23-32`). But every path is served through a Firebase
  Hosting rewrite (`firebase.json:47-71`), and Hosting caps a rewrite at 60s and returns 504 itself.
  So the 504 means the request exceeded 60s at the Hosting layer; the function may still have been
  running. Raising the function timeout would do nothing.

**Diagnosability — two of the 11 cannot be root-caused from logs at all**

- **S3 — `/proxy/tags` and `/proxy/posts-by-tag` swallow errors with zero logging.**
  `controllers/tag.controller.js` — `listStorefront` catch at `:81-88`, `getPostsByTag` catch at
  `:115-122`. Both set `ctx.status = 500` and return `{message: e.message}` to the client. The file
  contains **0 occurrences of `logger`** (no import on `:1-11`). Nothing reaches Cloud Logging.
  The failure is only visible to the storefront visitor. Root cause for these two is not
  recoverable from the 24h window — it has to be reproduced.
  Candidates by elimination: `getShopByField`, `initShopify`, or the Shopify Admin calls
  (`getTagsForStorefront` / `getArticlesByTagWithPagination`) — a revoked token or Admin API
  throttle would land exactly here.
- **S4 — controller-level catch means these never reach the error middleware.**
  `middleware/errorHandler.js:16-17` does log 5xx correctly with `err.message` and `err` (the
  `[unhandledError]` fix is present in blogs, unlike the earlier seo case). But no handler in this
  set rethrows — each catches and assigns `ctx.status = 500` itself, so `[unhandledError]` never
  fires and the prod-error sink never sees them. Consequence for triage: search the
  per-controller tags, not the sink. Tags to query:
  `[genSuggested]` (`genAIBlogController.js:368`), `[update]` (`articleController.js:600`),
  `[get]` (`genImageAIController.js:102`), `[getPreview]` (`appProxyController.js:152`),
  `[fixAuditIssue]` (`auditAgentController.js:147`).
  `/proxy/tags` and `/proxy/posts-by-tag` have no tag — see S3.
  `[generate]` in `langGraphController.js` is **not** a catch-all tag: it only covers the publish
  sub-failure (`:130`) and the token-reduce sub-failure (`:166`). The handler's real catch-all
  (`:173-178`) only does `writeEvent({type: 'error'})` — no logger call. See S6.
- **S6 — a 500 on `/apiV2/langgraph/blog` is necessarily pre-stream, and it *is* logged.**
  `langGraphController.js:40-72` runs with **no try/catch** before SSE headers are set at `:74-81`.
  Once `:81` sets `ctx.status = 200` and `ctx.respond = false`, every later failure produces a
  200 response carrying an SSE `error` event (`:173-178`) — it can never surface as HTTP 500.
  So the 500 in the brief came from `:41-72`, which is uncaught and therefore *does* reach
  `createErrorHandler` and *does* log `[unhandledError] POST /apiV2/langgraph/blog 500 …`
  (`middleware/errorHandler.js:16-17`). This is the one endpoint in the set whose root cause the
  logs will state outright.
  Concrete candidate in that range: `getShopById` at `:43` can return null, and `:46` dereferences
  `shop.id` immediately — a missing/uninstalled shop yields
  `TypeError: Cannot read properties of null (reading 'id')`. Awaited, unguarded calls at `:43`,
  `:46`, `:60` are the whole candidate set.

- **S7 — same pre-try shape on `PUT /api/article/:id`, plus errors that return 200.**
  `articleController.js:508-516` — `getShopById` (`:509`) and `initShopify` (`:514`) run **before**
  the `try` opens at `:517`. Separately, the catch at `:599-601` logs `[update]` and returns
  `{success: false, error}` **without setting `ctx.status`**, so a failure inside the try answers
  HTTP **200**. Both facts together pin the 500 in the brief to `:509-515` — again uncaught,
  again logged as `[unhandledError] PUT /api/article/625529717083 500 …`.
  The 200-on-failure behaviour is its own defect: the admin UI cannot distinguish a saved article
  from a failed save by status code.

**Log visibility, per endpoint** — what the 24h window can and cannot answer:

| Endpoint | 500 path logged? | Query by |
|---|---|---|
| `/api/gen-ai-suggested/*` + `/apiSa/…/recommendBlogPost` | yes | `[genSuggested]` |
| `/apiV2/langgraph/blog` | yes (pre-stream only, S6) | `[unhandledError]` |
| `PUT /api/article/:id` | yes (pre-try only, S7) | `[unhandledError]` |
| `/proxy/seoOn-preview` | yes | `[getPreview]` |
| `/api/audit-agent/fix-issue` | yes | `[fixAuditIssue]` |
| `/api/get-list-ai-image` (504) | partial — 504 is Hosting-layer (S2), may have no app-side error at all | `[get]` + request-log latency |
| `/proxy/tags` | **no** (S3) | nothing — must reproduce |
| `/proxy/posts-by-tag` | **no** (S3) | nothing — must reproduce |

**Correctness**

- **S5 — empty result returned as HTTP 500.** `controllers/genImageAIController.js:88-94`:
  `if (isEmpty(result)) { ctx.status = 500; ... error: 'No images found' }`. A shop with no
  generated images is not a server fault. Should be `200` with `data: []`. This inflates the 5xx
  rate on `/api/get-list-ai-image` independently of the 504 in the brief, and any alerting keyed
  on 5xx count for this endpoint is partly noise.

**Structural note on the 4 gen-ai-suggested lines**

`recommendBlogPost`, `topic`, `mainSeoKeyword`, `secondarySeoKeyword` all run the same handler
(`genAIBlogController.js:192` `genSuggested`) and each case follows the same shape: `complete()`
→ `JSON.parse()` → zod `.parse()` (e.g. `:220-229`, `:233-245`, `:249-261`, `:265-284`). All three
steps throw, and all four cases share one upstream (`getCompletion`, model `gpt-4.1`). Four
symptoms in one window is consistent with a single upstream fault — either the model returning
non-JSON / schema-violating output, or an upstream API error. Which one it is needs the logs.

**Ruled out**

- Redis is not implicated. `services/shopCache.service.js:92-104` — `withCache` returns
  `fetchFn()` when redis is absent and on a failed `get`, and logs `[withCache] get failed`.
  A Redis blip degrades to origin, it does not 500.
- `/apiv2/apiV2/langgraph/blog` is not a double-prefix routing bug. `firebase.json:49-51` rewrites
  `/apiV2/**` to function `apiv2`; the router inside mounts at `/apiV2` (`handlers/apiV2.js:67`).
  The log line is function name + request path concatenated.

**Log queries to run once Task 1 unblocks** (project `avada-blog-app`, `--freshness=1d`):

```
# per-controller error tags
gcloud logging read 'severity>=ERROR AND (textPayload:"[genSuggested]" OR textPayload:"[update]" OR textPayload:"[get]" OR textPayload:"[getPreview]" OR textPayload:"[fixAuditIssue]" OR textPayload:"[generate]")' --project=avada-blog-app --freshness=1d --limit=200

# request log, 5xx only, to get counts + latency per endpoint
gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.status>=500' --project=avada-blog-app --freshness=1d --limit=500 --format='value(httpRequest.status,httpRequest.requestUrl,httpRequest.latency,resource.labels.service_name)'

# proxy instance saturation check for S1
gcloud logging read 'resource.labels.service_name="proxy"' --project=avada-blog-app --freshness=1d --limit=200
```

#### ✅ Task 4: Write triage report
- Status: ✅ completed
- Completed: 2026-07-30
- Static section above; log-pass section at the end of the file with per-endpoint root causes,
  the three corrections, the sink finding, and a ranked fix list.

#### ✅ Task 5: Verify citations
- Status: ✅ completed (for the static pass)
- Completed: 2026-07-30
- 21 of 21 cited `file:line` refs read back on `origin/master` = `aad0e1df7` and matched what the
  report claims. Checked: `functions/http.js:56`, `firebase.json:49`,
  `middleware/errorHandler.js:17`, `handlers/apiV2.js:67`, `services/shopCache.service.js:102`,
  `tag.controller.js:83,117`, `genAIBlogController.js:368`,
  `articleController.js:509,514,517,600`, `genImageAIController.js:89,102`,
  `appProxyController.js:103,152`, `auditAgentController.js:51,147`,
  `langGraphController.js:81,130,174`.
- Zero dead citations. Any refs added during the log pass need re-checking.

#### ✅ Task 6: Apply fixes
- Status: ✅ completed
- Completed: 2026-07-30
- Branch `fix/prod-5xx-observability`, worktree `projects/Falcon/blogs-wt-prod5xx`, based on
  `origin/master` = `aad0e1df7`. Commit `b8152fe6b` (amended from `843190815` after Tony chose to
  keep the 200 on article save — see below).

| Finding | Fix | File |
|---|---|---|
| S1 | `proxy` `maxInstances` 1 → 10 (matches `apiv2`) | `functions/http.js:55-60` |
| S3 | all 4 catches in the file now log; the 2 storefront ones stop echoing `e.message` to the shopper | `controllers/tag.controller.js` |
| S5 | empty image list is 200, not 500; unused `isEmpty` import dropped | `controllers/genImageAIController.js` |
| S6 | missing shop → 404 instead of bare TypeError; catch-all now logs | `controllers/langGraphController.js` |
| S7 | pre-try body moved inside try; catch keeps **200** and returns `error.message` | `controllers/articleController.js` |

New tests (6, all passing):
`controllers/__tests__/tag.controller.storefrontErrors.test.js`,
`controllers/__tests__/genImageAIController.emptyList.test.js`.

Verification actually run:
- `jest --ci` → **164 passed**. 3 suites fail to *run* (`checkHeadersForReauthorization`,
  `parseHtmlToEditor.imageRoundtrip`, `removeRecipeMetafields`) — reproduced identically on
  untouched `master`, so pre-existing: module resolution + missing
  `~/.openclaw/firebase-sa.json`.
- `eslint` **could not be run at all**: it crashes inside this repo's `node_modules` under Node
  v22.22.0 (`async-function/require.mjs: Cannot use import statement outside a module`) before
  reading any file, and does the same on untouched `master`. Repo targets Node 20. Substituted the
  repo's own babel as a parse check — 5/5 changed files clean. CI still gates lint.

Decision on S7 (Tony, 2026-07-30): **keep the 200.** The first version had the catch set 500, which
would have moved `usePutApi` onto its throw path (the embedded `api` helper throws on
`!response.ok`, `packages/assets/src/helpers.js:104-107`) and changed which toast the merchant sees.
Reverted — the response contract for `PUT /api/article/:id` is unchanged. What remains of S7 is the
part with no contract impact: the pre-try body moved inside the try (so a missing shop is logged
with its `articleId` instead of producing an unattributed 500), and the payload returns
`error.message` rather than a bare `Error` that serialised to `{}`.

Consequence to keep in mind for the log pass: a failure *inside* the try still answers HTTP 200, so
it will never appear in a request-log 5xx query. Only `[update]` log lines will show it.

#### ✅ Task 7: Push branch and open MR
- Status: ✅ completed
- Completed: 2026-07-30
- Branch pushed: `origin/fix/prod-5xx-observability` @ `b8152fe6b`, targeting `master`.
- MR opened by Tony from the prefilled link; `glab` could not do it — `glab auth status` returned
  `401 Unauthorized` and `No token found (checked config file, keyring, and environment
  variables)`.
- MR title and description live in `jobs/bugprod-mr.md`.
- Correction to prior notes: `GLAB_TOKEN` is **not** in `speed-up-report/.env` any more — that file
  holds 11 keys, none GitLab. No GitLab token is set in the environment either.

---

## Status: fixes shipped to MR; log pass still open

Done: endpoint→code map (11 lines, 7 handlers), static root-cause pass (S1–S7), 21/21 citations
verified, five fixes + six tests on `fix/prod-5xx-observability`, MR opened against `master`.

Still open, and the reason the triage is not finished: **`gcloud auth login`**. Without the 24h
error logs, six of the eleven endpoints have a code path but no confirmed cause — the four
`/gen-ai-suggested/*`, `/proxy/seoOn-preview`, and `/api/audit-agent/fix-issue`. The queries are
staged under Task 3. Two of the eleven (`/proxy/tags`, `/proxy/posts-by-tag`) were never
recoverable from logs at all; after this MR they will be, from the next occurrence forward.

---

## Log pass — 2026-07-30, window 2026-07-29/30 (24h), project `avada-blog-app`

Volume: **257** request-log entries with `httpRequest.status>=500`, and **1592** application error
lines. Everything below is counted from those two pulls.

### First: the static pass got three things wrong

- **S1 was not the cause.** The `/proxy/*` 500s fail in **0.15–0.43s median** (`/proxy/seoOn-preview`
  0.15s, `/proxy/posts-by-tag` 0.21s, `/proxy/tags` 0.43s). That is immediate failure, not queueing
  behind a saturated instance. `maxInstances: 1` was real and worth raising, but the MR's `http.js`
  change is **hardening, not a fix** — do not expect it to move these counts.
- **S2 was wrong, and the brief's status code was wrong.** `/api/get-list-ai-image` is not mainly a
  504: it is **48× 503** (median **263s**, max **530s**), **1× 504 at exactly 540.00s**, and 1× 500.
  540.00s is `api`'s own `timeoutSeconds: 540` (`functions/http.js:23-32`) to the millisecond — so
  this is the function timeout, not the Firebase Hosting 60s rewrite cap I claimed. Requests also
  ran 263s+ without Hosting cutting them.
- **S6's mechanism was wrong.** The location was right (pre-stream), but these 500s produce **no**
  `[unhandledError]` line — only a raw stack. See L2 and L7.

### Confirmed root causes

- **L1 — `api` runs out of memory 10× in 24h.** `Memory limit of 1024 MiB exceeded with 1024–1046
  MiB used`, on `api` (`memory: '1GiB'`, `functions/http.js:23-32`). The container is killed, so
  every in-flight request on that instance dies with no application log — no code gets to run a
  catch block. These are the only 10 entries in 24h that carry `severity=ERROR` from the app.
  Timestamps: 07:52:40, 07:54:03, 08:20:20, 08:32:50, 08:56:07, 09:21:19, 11:06:32, 11:34:24,
  11:59:43, 22:36:14.
- **L2 — Firestore returns `16 UNAUTHENTICATED` 47× in 24h**: **34 on `api`, 10 on `apiv2`, 3 on
  `apisa`**. `Request had invalid authentication credentials. Expected OAuth 2 access token, login
  cookie or other valid authentication credential`, raised through `google-gax`/grpc. This is not
  endpoint-specific — it is the app failing to authenticate to Firestore, and it is the single
  biggest confirmed cause in the set.
- **L3 — `/apiV2/langgraph/blog`: 10 of 10 500s are L2.** One-to-one, each `UNAUTHENTICATED` landing
  ~1s after its request starts:

  | request 500 | UNAUTHENTICATED |
  |---|---|
  | 06:57:01 | 06:57:02 |
  | 07:52:42 | 07:52:43 |
  | 09:29:57 | 09:29:58 |
  | 09:59:54 | 09:59:55 |
  | 14:02:38 | 14:02:39 |
  | 14:58:29 | 14:58:30 |
  | 15:36:36 | 15:36:37 |
  | 16:38:26 | 16:38:27 |
  | 21:59:31 | 21:59:32 |
  | 22:35:32 | 22:35:33 |

  Latency is flat at 1.06–1.27s across all ten. `apiv2` also logged **12 cold starts**
  (`Starting new instance. Reason: AUTOSCALING`) and **12×** `[rateLimiterMiddleware] fallback allow
  Error: Stream isn't writeable and enableOfflineQueue options is false` in the same window. Ten
  auth failures against twelve instance starts, each ~1s into the request, points at the credential
  fetch on a cold instance rather than anything in `generate`.
- **L4 — `/proxy/seoOn-preview`: 44 of 44 500s are a missing query param.** All 44 log the identical
  `[getPreview] <shop> Error fetching the resource: Cannot read properties of undefined (reading
  'includes')`, and **all 44 request URLs have no `id` param** — they carry only
  `path_prefix=/tools/seo-on`, `shop`, `signature`, `timestamp` (24 of them also `section_id`).
  `getPreview` reads `const {id} = ctx.query` (`appProxyController.js:99`) and passes it to
  `getShopifyArticleById`, which does `id.includes('gid')`
  (`services/shopifyGraphQlService.js:612` and `:742`). Undefined `id` → that exact message.
  Traffic is App Proxy requests from crawlers and section-render calls. Should be a 400; the entire
  44 is noise.
- **L5 — the four `/gen-ai-suggested/*` endpoints: 54 failures, all truncated model output.** Every
  message is a JSON parse failure on the completion — `SyntaxError: Unterminated string in JSON at
  position <n>`, `Unexpected end of JSON input` — plus one `ZodError` for
  `path: ["outline","body",4,"h2"] expected string`. Stacks land on `JSON.parse` inside
  `genSuggested` (e.g. `genAIBlogController.js:259`). "Unterminated string" is the signature of a
  completion cut off at the token limit, so `getCompletion` is not detecting or handling
  `finish_reason: length`. Distribution is **not** uniform: `recommendBlogPost` **41**, `topic` 6,
  `special-outline` 2, `secondarySeoKeyword` 1, `mainSeoKeyword` 1, `suggested-outline` 1, plus 2 on
  `/apiSa/…/recommendBlogPost`. My earlier guess of one shared upstream fault hitting all four
  evenly was wrong — `recommendBlogPost` is 76% of it and needs the token cap looked at first.
- **L6 — `/api/audit-agent/fix-issue`: 5 of 5 are the same class.** `[fixAuditIssue] … SyntaxError:
  Expected property name or '}' in JSON at position 1` (4×) and `Unterminated string in JSON at
  position 2` (1×), all in `parseJsonCompletion` in `services/auditAgent/`. Same underlying problem
  as L5, different call site.
- **L7 — `PUT /api/article/:id`: 2 failures, neither is a bug in `update`.** 07:55:25 (0.71s) is
  followed at 07:55:26.125 by `16 UNAUTHENTICATED` on `api` — request end and log line coincide.
  11:59:40 (3.11s) ends inside the 11:59:43.241 OOM kill. So: one L2, one L1. Neither produced an
  `[update]` line, which is consistent — the first threw in `getShopById` before the old `try`, and
  the second had its container killed. The MR's S7 change will surface the first kind as `[update]`
  with the `articleId` from now on; nothing can log the second kind.
- **L8 — `/proxy/tags` (40) and `/proxy/posts-by-tag` (41) are still unexplained, as predicted.**
  Zero application log lines, so the cause is not in this window. What the request logs do add:
  failures are fast (0.21s / 0.43s median), concentrated on **7 shop domains** with 56 of the 81 on
  `1f790c-c4.myshopify.com`, and the traffic is largely crawlers (Baiduspider-render, AhrefsBot,
  Googlebot smartphone). L2 is ruled out — of the 47 `UNAUTHENTICATED`, **none** are on `proxy`.
  That leaves `initShopify` or the Shopify Admin calls; a revoked token on an uninstalled shop fits
  both the speed and the domain concentration, but this is inference, not evidence. Once the MR
  ships, `[listStorefront]` / `[getPostsByTag]` will name it on the next occurrence.

### The alerting is blind — this is the finding to act on

**All 1592 application error lines land on `stderr` with no `severity` field at all** (verified:
`severity` is absent on 1592/1592; `logName` is `…%2Fstderr` on 1592/1592). The cause is
`helpers/logger.js:23-25` — `logger.error` is a plain `console.error`, which Cloud Run ingests as
`DEFAULT`, not `ERROR`.

The `prod-error-alerts` sink filter is:

```
(resource.type="cloud_run_revision" OR resource.type="cloud_function")
AND severity>=ERROR
AND resource.labels.service_name!="handleproderroralert"
AND NOT logName:"cloudaudit.googleapis.com"
```

So in the last 24h that sink matched **14 entries** — the 10 OOM kills, 2 puppeteer failures and 2
Cloud Scheduler retries — and **zero** of the 1592 real application errors. Every `[genSuggested]`,
`[getPreview]`, `[fixAuditIssue]` and `[unhandledError]` line was invisible to Slack. This is why
the brief arrived as bare `HTTP 500 <method> <path>` lines with no messages: they did not come from
the error sink, they came from request logs.

**Fleet implication:** the prod-error sink exists in every prod project, and if `helpers/logger.js`
was copied to the other apps then their sinks are equally blind. Worth checking `seo`, `blogs`,
`ai-product-copy`, `llm-ai-search-seo`, `avada-image-optimizer`, `avachat` and `joy` before trusting
any "no alerts today" as good news. Two ways out: emit structured logs with an explicit
`severity: 'ERROR'` field from `logger`, or widen the sink filter to include stderr text matches.

### Redis is down on the `api` path

**1476** `[withCache] … get failed Stream isn't writeable and enableOfflineQueue options is false`
in 24h — 1312 on `subscriberenewsubscribertokenshandler`, 113 on `api`, 20 on `apisa`, 24 on
`subscribesummarynewpublishedarticle`, 7 on `knowledgebase`. `withCache` is fail-open
(`services/shopCache.service.js:92-104`), so this causes no 5xx directly, but the cache is
effectively off: every one of those reads went to origin instead. `apiv2` shows the same client
state through `[rateLimiterMiddleware] fallback allow` (12×). `proxy` logs no `[withCache]` at all,
which means `this.redis` is falsy there and it never even tries.

### Failing endpoints that were not in the brief

- **`GET /api/blog-assist/:id/title` — 8× 500.** `[unhandledError] … Cannot read properties of
  undefined (reading 'reverse') TypeError … at Object.getBlogAssist`. Three distinct article ids.
  A real, reproducible bug and the only one here that reaches the error middleware.
- **`GET /api/options` — 2× 500.** `Response code 429 (Too Many Requests) HTTPError` — a Shopify
  rate limit surfaced to the client as a 500.
- **`reviewupdatesschedule` — 2× 500.** `Error: Could not find Chrome (ver. 148.0.7778.97)` —
  puppeteer has no browser installed in the deployed image, so this scheduled job cannot run at
  all. Cloud Scheduler logs the matching `URL_UNREACHABLE-UNREACHABLE_5xx`.
- **`POST /api/generate-alt-text` — 1× 500**, and **`GET /api/get-list-ai-image` — 1× 500** with
  `Cannot create property 'shopifyTopLevelOAuth' on number '2' TypeError … at setSession
  (/workspace/node_modules/@avada/core/…)` — a session-store type bug inside `@avada/core`.

### What to fix next, in order

1. **L2 — Firestore `UNAUTHENTICATED`, 47×/24h across three services.** Biggest confirmed cause and
   it is infrastructure, not endpoint logic. Check the runtime service account and whether the
   metadata-server token fetch is failing on cold start.
2. **The blind sink.** Until `logger` emits a real severity, nobody finds out about any of this
   without running these queries by hand.
3. **L1 — `api` OOM at 1 GiB, 10×/24h.** Kills unrelated in-flight requests; the 48× 503 on
   `get-list-ai-image` sits on top of this plus a median 263s runtime that needs profiling on its
   own.
4. **L4 — validate `id` in `getPreview`.** One-line 400 removes 44 bogus 500s.
5. **L5/L6 — handle truncated completions.** Check `finish_reason` and raise the token cap for
   `recommendBlogPost` (41 of 54).
6. **Redis.** 1476 failed cache reads means the cache is off, which quietly raises Shopify API load
   on exactly the storefront path in L8.

None of the six is addressed by the MR already open — that one only makes L8 diagnosable and
removes the false 5xx on the empty image list.

---

## Root-cause fixes — branch `fix/prod-5xx-root-causes` (2026-07-30)

Second MR, based on `origin/master` = `aad0e1df7`, commit `4b54f507b`, pushed. Worktree
`projects/Falcon/blogs-wt-root`. MR body: `jobs/bugprod-mr2.md`.

| Finding | Fix | File |
|---|---|---|
| Blind sink | `logger` writes one JSON line with `severity`; `[tag]` kept in `message` and lifted to its own field; `Error` expanded with stack. Runtime gate is `K_SERVICE`, not `APP_ENV` | `helpers/logger.js` |
| L5 + L6 (54 + 5) | `finish_reason === 'length'` detected → 1 retry → `CompletionTruncatedError` | `services/openAi.service.js` |
| L4 (44) | missing `id` → 400, no Shopify call | `controllers/appProxyController.js` |
| blog-assist (8) | `dataByField?.[assistFor]?.reverse()` | `services/blogAssist.service.js` |
| `/api/options` (2) | try/catch; upstream 4xx passes through as itself | `controllers/articleController.js` |
| L1 (10 OOM) | `api` memory 1GiB → 2GiB | `functions/http.js` |
| Redis (1476) | drop `lazyConnect`, `enableOfflineQueue: true` | `services/redis.service.js` |
| puppeteer (2) | `.puppeteerrc.cjs` + non-fatal `gcp-build` hook | `packages/functions/` |

21 new tests across 4 suites. `jest --ci` → **179 passed**; same 3 pre-existing env suites fail to
run. 7/7 changed files parse-check clean under the repo's babel; `.puppeteerrc.cjs` loads under node.

**Knock-on to remember:** after this ships, the `[tag]` log lines move from `textPayload` to
`jsonPayload.message`. The queries recorded under Task 3 above need rewriting.

**Not fixed, and why:**

- **Firestore `16 UNAUTHENTICATED` (47×, the biggest single cause).** Not fixable from the repo.
  `new Firestore()` takes no credentials → ADC via metadata server; runtime identity is the default
  compute SA `1784460569-compute@developer.gserviceaccount.com`. `GCP_SERVICE_ACCOUNT_KEY` is only
  wired to BigQuery and changelog, not Firestore. Needs a GCP-side look at that SA's roles and at
  the token fetch on fresh instances (`apiv2` logged 12 cold starts in the same window).
- **`/api/get-list-ai-image` median 263s.** The OOM fix removes what turns it into a 503; a
  four-minute request is a separate problem. `getListImageAiGraphql` needs profiling.
- **`/proxy/tags` + `/proxy/posts-by-tag` (81).** Still unexplained; MR 1 is what makes them
  visible. Next occurrence will name itself.
- **`@avada/core` `setSession` type bug** (1×) — upstream library.
- **puppeteer fix is unverified locally** — only exercises on a real deploy. Non-fatal by design so
  it cannot block a functions deploy. Validate on staging first.

**Correction to an earlier note in this file:** I wrote that the repo targets Node 20 (from
`CLAUDE.md`) and implied the local `eslint` crash was a Node-version mismatch.
`packages/functions/package.json` declares `engines.node: 22`, which is what is installed locally,
so that inference was wrong — the `eslint` breakage cause is still unidentified. It reproduces on
untouched `master`, so it is not caused by either MR.

---

## Merged 2026-07-30

Both MRs are on `origin/master`:

- `8cacca7fb` Merge branch `fix/prod-5xx-observability` (`b8152fe6b`)
- `59f4fd5fa` Merge branch `fix/prod-5xx-root-causes` (`4b54f507b`)

Worktrees `blogs-wt-prod5xx`, `blogs-wt-root` and the scratchpad `blogs-master` removed; worktree
list is back to the original four. `master` auto-deploys to production, so nothing here takes
effect until that deploy runs.

### Watch in the first hour after the deploy

1. **Slack alert volume.** The sink was matching ~14 entries/day. It now sees everything
   `logger.error` emits — which in the measured window was **1592 lines/day**. Most of that should
   disappear with the same deploy: 1476 were `[withCache]` (Redis fix), 44 `[getPreview]` (now a
   400 that logs nothing), 8 blog-assist. If the Redis fix does not take, `#prod-error` gets ~1476
   messages/day. That is the single thing to check first, and the reason to look at Slack before
   looking at anything else.
2. **`[withCache]` count.** Should drop to near zero. If it does not, `enableOfflineQueue: true`
   was not the whole story and Redis is genuinely unreachable from that VPC path.
3. **The puppeteer `gcp-build` hook**, which went to production without a staging run. It is
   non-fatal, so a failure logs `WARN puppeteer chrome install failed` in the build and leaves
   `reviewUpdatesSchedule` broken exactly as it already was — it cannot block the deploy. Confirm
   in the Cloud Build log either way.
4. **`api` memory.** Confirm the revision came up at 2GiB
   (`gcloud run services describe api --project=avada-blog-app --region=us-central1`), then watch
   whether `Memory limit … exceeded` stops. If it still OOMs at 2GiB there is a leak, not a
   sizing problem.
5. **Firestore `UNAUTHENTICATED`.** Unchanged by both MRs — still ~47/day, still the biggest
   cause. It will now be *visible* in Slack, which is new, but nothing was fixed.

### Query change now live

The `[tag]` lines have moved from `textPayload` to `jsonPayload.message`. The queries recorded
under Task 3 need rewriting, e.g.:

```
gcloud logging read 'jsonPayload.tag="[genSuggested]"' --project=avada-blog-app --freshness=1d
gcloud logging read 'severity>=ERROR AND resource.type="cloud_run_revision"' --project=avada-blog-app --freshness=1d
```

The second one is now genuinely useful — before this deploy it returned only infrastructure noise.
