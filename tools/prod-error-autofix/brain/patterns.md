# Cross-app root-cause patterns

Confirmed on real prod logs, not theory. Every count comes from the 24h window
2026-07-29/30 on `avada-blog-app` unless stated. Check these before inventing a new hypothesis —
the five apps share a code lineage, so a pattern found in one is worth testing in the others.

## P1 — Truncated model output surfaces as a JSON parse error

**Signature:** `SyntaxError: Unterminated string in JSON at position <n>`, `Unexpected end of JSON
input`, or `Expected property name or '}' in JSON at position 1`. Stack lands on `JSON.parse` inside
the caller, so the error names the parser, not the cause.

**Cause:** the completion stopped at the model's output cap (`finish_reason: 'length'`) and half a
JSON document came back as an ordinary string. The AI helper does not check `finish_reason`.

**Evidence it was this:** 54 of the BLOG 500s in one window, across four `/gen-ai-suggested/*`
endpoints plus `/audit-agent/fix-issue`. Distribution was **not** uniform — `recommendBlogPost` was
41 of 54 (76%), so "one shared upstream fault hitting all endpoints evenly" was wrong.

**Do not** fix this by adding a `max_tokens`: the per-model cap is not known at that layer and a
number could *lower* the current ceiling. Detect `finish_reason === 'length'`, retry once, then raise
a named error.

**Where to look:** the shared completion helper in `services/`, and any `parseJsonCompletion`.

## P2 — `undefined` param reaching a string method

**Signature:** `Cannot read properties of undefined (reading 'includes')`, or
`id.includes is not a function` when a param arrives as an object.

**Cause:** a query param treated as required when the caller never sends it. On App Proxy routes the
callers are crawlers (Baiduspider-render, AhrefsBot, Googlebot) and Shopify section-render calls,
which carry only `path_prefix`, `shop`, `signature`, `timestamp`.

**Evidence it was this:** 44 of 44 `/proxy/seoOn-preview` 500s had no `id` param. Correct answer is a
400 before touching Shopify, not a try/catch.

**Still live as of 2026-07-30:** the same family on a different call path —
`shopifyGraphQlService.getShopifyArticleById` reached from `articleController.list`, message
`id.includes is not a function`. Fixing one entry point does not fix the others; check every caller
of the function, not just the one in the alert.

## P3 — OOM kill masquerading as unrelated 5xx

**Signature:** `Memory limit of 1024 MiB exceeded with 1024–1046 MiB used`. No application log line
anywhere near it.

**Cause:** the container is killed, so nothing in the process gets to log. At `concurrency: N` one
kill fails up to N-1 unrelated in-flight requests, which then look like bugs in whatever they were
doing.

**Evidence it was this:** 10 kills in 24h on BLOG `api`; they were the *only* app-side entries
carrying `severity=ERROR`. They also explain a 48× **503** run on `/api/get-list-ai-image` (median
263s, max 530s) and one of two `PUT /api/article/:id` failures.

**Infra class — no autofix.** Report the count, the configured memory, and the tier you would
suggest. A memory bump doubles the cost of the busiest function; that is Tuan's call.

## P4 — A timeout that matches a configured limit exactly

**Signature:** a single 504 or 503 whose latency equals a configured `timeoutSeconds` to the
millisecond (observed: 540.00s against `timeoutSeconds: 540`).

**Use:** the match *identifies which* limit fired. Do not assume the Firebase Hosting 60s rewrite cap
— requests were observed running 263s+ without Hosting cutting them.

## P5 — Fast, shop-concentrated failures with no application log

**Signature:** 500s with a 0.15–0.43s median, no log line at all, concentrated on a handful of shop
domains (81 failures across 7 domains, 56 of them one domain), traffic mostly crawlers.

**Reading:** fast means immediate failure, not queueing behind a saturated instance — do not reach
for `maxInstances`. Domain concentration plus speed fits a revoked token on an uninstalled shop
(`initShopify` or the first Admin call). Left unproven in the source triage; if a handler on this
path still logs nothing, the honest answer is that observability has to land before the cause can.

## P6 — Firestore `16 UNAUTHENTICATED` on cold instances

**Signature:** `Request had invalid authentication credentials. Expected OAuth 2 access token, login
cookie or other valid authentication credential`, through `google-gax`/grpc, ~1s into the request.

**Evidence:** 47 in 24h on BLOG (34 `api`, 10 `apiv2`, 3 `apisa`); it was the single biggest
confirmed cause in that set. Ten of them mapped one-to-one onto the ten `/apiV2/langgraph/blog`
500s, with flat 1.06–1.27s latency, against 12 logged cold starts in the same window.

**Reading:** not endpoint-specific. Points at the credential fetch on a cold instance, so do not fix
it inside whichever handler happened to be running.

## P7 — The sink cannot see the error at all

**Signature:** the Slack alert carries a bare `HTTP 500 <method> <path>` with no message, and the
`errors` read comes back empty while `stderr` is full.

**Cause:** `logger.error` is a plain `console.error`, ingested as severity `DEFAULT`, while the
`prod-error-alerts` sink filters `severity>=ERROR`. In the source window that sink matched 14 entries
— 10 OOM kills, 2 puppeteer, 2 scheduler retries — and **zero** of 1592 real application errors.

**Fleet state, checked 2026-07-30:** fixed in `blogs` only. `seo`, `ai-product-copy`,
`llm-ai-search-seo` and `avada-image-optimizer` still have the bare-`console` logger, so their sinks
are still blind to application errors. For those four, an empty `errors` read is the expected state,
not a finding — read `stderr`.
