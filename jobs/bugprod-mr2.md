## Why

Follow-up to `fix/prod-5xx-observability`, which only made these failures diagnosable. This MR
fixes the causes. Everything below was confirmed by correlating **257** 5xx request-log entries
against **1592** application error lines on `avada-blog-app` over 24h; every count is from that
window. Full triage in `jobs/bugprod.md`.

Branched from `master` (`aad0e1df7`).

## The one to review first: the alerting was blind

`logger.error` was a bare `console.error`. Cloud Logging ingests that as severity **DEFAULT**, and
the `prod-error-alerts` sink filters on `severity>=ERROR`:

```
(resource.type="cloud_run_revision" OR resource.type="cloud_function")
AND severity>=ERROR
AND resource.labels.service_name!="handleproderroralert"
AND NOT logName:"cloudaudit.googleapis.com"
```

Over 24h that sink matched **14** entries — 10 OOM kills, 2 puppeteer failures, 2 Cloud Scheduler
retries — and **zero** of the 1592 application errors. Verified: `severity` was absent on
1592/1592, all on `…%2Fstderr`. This is why the incident list arrived as bare
`HTTP 500 <method> <path>` lines with no messages — they came from request logs, not the sink.

`logger` now writes one JSON line per entry carrying `severity`, keeps the `[tag]` at the front of
`message` and also lifts it into its own field, and expands an `Error` into a structured field with
its stack. Outside a Cloud runtime it stays plain text. The runtime check is `K_SERVICE` rather
than `APP_ENV`, so it does not depend on per-service config being right.

**⚠️ This changes log queries.** The `[tag]` lines move from `textPayload` to
`jsonPayload.message`. Anything saved that greps `textPayload:"[genSuggested]"` needs updating.

**Fleet check worth doing:** the same sink exists in every prod project. If `helpers/logger.js` was
copied to the other apps, their sinks are equally blind — worth confirming on `seo`,
`ai-product-copy`, `llm-ai-search-seo`, `avada-image-optimizer`, `avachat` and `joy` before reading
"no alerts today" as good news.

## Root causes fixed

**`getCompletion` — 54 of the 500s, one cause.** Every `/gen-ai-suggested/*` failure (41 of them
`recommendBlogPost`, 6 `topic`, the rest single-digit) and all 5 `/audit-agent/fix-issue` failures
were the model stopping at its output cap. Half a JSON document came back as an ordinary string and
the caller died in `JSON.parse` with `Unterminated string in JSON at position …` or
`Unexpected end of JSON input` — naming the parser, not the cause. Now `finish_reason === 'length'`
is detected, retried once (the retry is non-deterministic and usually lands inside the cap), then
raised as `CompletionTruncatedError`.

No `max_tokens` was added: the per-model cap is not known at this layer, and setting a number could
*lower* the current ceiling. If truncation persists after this ships, that is the next thing to
look at, with `recommendBlogPost` first since it is 76% of the volume.

**`getPreview` — all 44 of the `/proxy/seoOn-preview` 500s.** Every one was an app-proxy request
with **no `id` param** — crawlers (Baiduspider-render, AhrefsBot, Googlebot) and Shopify
section-render calls, carrying only `path_prefix=/tools/seo-on`, `shop`, `signature`, `timestamp`.
The undefined `id` reached `getShopifyArticleById`, where `id.includes('gid')`
(`shopifyGraphQlService.js:612`, `:742`) threw
`Cannot read properties of undefined (reading 'includes')`. Now a 400, and it does not touch
Shopify.

**`blogAssist.getBlogAssist` — 8 of the 500s.** `dataByField?.[assistFor].reverse()` stopped the
optional chain before the index, so a blog with no value for that field threw
`Cannot read properties of undefined (reading 'reverse')`. All 8 were
`GET /api/blog-assist/:id/title`. The line below it already used `?.` correctly.

**`getOptions` — 2 of the 500s.** No `try`/`catch` at all, so Shopify throttling
(`Response code 429 (Too Many Requests)`) propagated out as a 500, telling the client to give up
rather than back off. A 4xx from upstream now passes through as itself.

**`api` memory 1GiB → 2GiB — 10 OOM kills in 24h.**
`Memory limit of 1024 MiB exceeded with 1024–1046 MiB used`. An OOM kill takes the whole container,
so at `concurrency: 10` each one can fail up to 9 unrelated in-flight requests, and no code in the
process gets to log why. This is the mechanism behind the 48× **503** on `/api/get-list-ai-image`
(median 263s, max 530s) and one of the two `PUT /api/article/:id` failures.

Cost note: this doubles the memory tier on the busiest function. `maxInstances` is unchanged at 100
and there is no `minInstances`, so it is charged on use.

**Redis — 1476 failed cache reads in 24h.** `lazyConnect: true` with
`enableOfflineQueue: false` meant the first command on a fresh instance raced the connection and
threw `Stream isn't writeable and enableOfflineQueue options is false` — 1312 of them on
`subscriberenewsubscribertokenshandler`, which is short-lived and issues a command immediately.
Connecting eagerly and letting commands queue closes that window; `maxRetriesPerRequest: 2` still
bounds the wait when Redis is genuinely down, and every `withCache` caller is already fail-open
(`shopCache.service.js:92-104`). Nothing here was causing 5xx, but the cache was effectively off,
which quietly raised Shopify API load on the storefront path.

**puppeteer — `reviewUpdatesSchedule` could not run at all.**
`Error: Could not find Chrome (ver. 148.0.7778.97)`, 2× in 24h with matching Cloud Scheduler
`URL_UNREACHABLE-UNREACHABLE_5xx`. Chrome downloads to `~/.cache/puppeteer`, which is outside the
deployed artifact. Adds `.puppeteerrc.cjs` pinning the cache into `packages/functions` and a
`gcp-build` hook to install it.

**This is the one part I could not verify locally** — it only exercises on a real deploy. The hook
is deliberately non-fatal (`|| echo WARN …`) so a browser-download failure cannot block every
functions deploy. Please run it on staging before master. It also adds ~150 MB and some build time
to the functions image.

## Not fixed here, and why

- **Firestore `16 UNAUTHENTICATED`, 47× in 24h (34 `api`, 10 `apiv2`, 3 `apisa`).** This is the
  single biggest confirmed cause — it accounts for **10 of 10** `/apiV2/langgraph/blog` 500s
  (one-to-one, each landing ~1s into its request) and one of the two `PUT /api/article/:id` ones.
  It is not fixable from this repo: `new Firestore()` is constructed with no credentials, so it
  uses ADC via the metadata server, and the runtime identity is the default compute service
  account `1784460569-compute@developer.gserviceaccount.com`. `GCP_SERVICE_ACCOUNT_KEY` is only
  used for BigQuery and changelog, not Firestore. Needs a GCP-side look at that service account's
  roles and at why the token fetch fails on a fresh instance — `apiv2` logged 12 cold starts in
  the same window.
- **`/api/get-list-ai-image` median 263s.** The OOM fix removes the mechanism that turns it into a
  503, but a request that legitimately runs four minutes is its own problem. `getListImageAiGraphql`
  needs profiling; there is nothing to guess at from logs.
- **`/proxy/tags` and `/proxy/posts-by-tag`, 81 failures.** Still unexplained — they produced zero
  application log lines, which is exactly what MR 1 fixes. Fast fails (0.21s / 0.43s median),
  concentrated on 7 shop domains with 56 of 81 on one, mostly crawler traffic. Firestore auth is
  ruled out: none of the 47 `UNAUTHENTICATED` are on `proxy`. After MR 1 ships,
  `[listStorefront]` / `[getPostsByTag]` will name it on the next occurrence.
- **`Cannot create property 'shopifyTopLevelOAuth' on number '2'`** at `setSession` inside
  `@avada/core` — 1 occurrence. Upstream library bug, not patchable here.

## Tests

21 new tests across 4 suites:

- `logger.severity.test.js` — severity is emitted, tag preserved and lifted, `Error` expanded with
  stack, unserialisable values survive, plain text outside a Cloud runtime.
- `getCompletion.truncation.test.js` — normal finish passes through, one retry on truncation
  returns the good result, still-truncated raises `CompletionTruncatedError` with a message that
  names the cause and not JSON, streaming callers untouched, `withUsage` unchanged.
- `blogAssist.missingField.test.js` — missing field and missing document both return `undefined`
  instead of throwing; existing field still returns newest-first.
- `appProxyController.previewValidation.test.js` — 400 with no `id`, no Shopify call, no error log,
  `no-store` on the 400, and the password short-circuit still runs first.

`jest --ci`: **179 passed**. Three suites fail to *run*, identically on untouched `master` —
`checkHeadersForReauthorization`, `parseHtmlToEditor.imageRoundtrip` (module resolution) and
`removeRecipeMetafields` (missing `~/.openclaw/firebase-sa.json`). Pre-existing, unrelated.

`eslint` could not be run: it crashes inside this repo's `node_modules` before reading any file
(`async-function/require.mjs: Cannot use import statement outside a module`) and does so on
untouched `master` too. Changed files were parse-checked with the repo's own babel — 7/7 clean —
and `.puppeteerrc.cjs` loads under node. CI still gates lint.

No dependency changes, so no `yarn.lock` update. `package.json` gains one script.

## Deploy note

Touches `packages/functions/src/functions/http.js` and `package.json`, both on
`detect-changed-functions.js`'s force-all list — a `[deploy-changed]` deploy will fall back to
deploying all functions. The memory change only takes effect once `api` is redeployed.
