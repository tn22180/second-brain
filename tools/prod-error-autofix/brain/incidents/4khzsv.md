fingerprint: 4khzsv
service: api
message: [getRedirectTracer] TypeError: Invalid URL
app: BLOG
repo: blogs
date: 2026-07-31T08:57:10.931Z
status: mr_open
attempt: 1

# BLOG · api · 4khzsv

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/805

**Root cause.** getRedirectTracer races trace-redirect against delay(3000), and delay resolves undefined — so every /api/recentBlogs call whose redirect trace exceeds 3s hands `undefined` to `new URL(...)`, throwing TypeError ERR_INVALID_URL which is caught, logged at ERROR severity, and silently degraded to the myshopify.com domain.

**Mechanism.** articleController.getRecentBlogsWithLimit calls getRedirectTracer('https://' + shop.shopifyDomain) inside Promise.all (packages/functions/src/controllers/articleController.js:970 — stack frame 'async Promise.all (index 1)'). getRedirectTracer does `await Promise.race([tracer(url), delay(ms)])` with ms=3000; delay (packages/functions/src/helpers/utils/delay.js:1) is `new Promise(resolve => setTimeout(resolve, ms))` — it resolves with no value. When trace-redirect has not finished by 3000ms the race resolves `undefined`, and the next line `new URL(traceDomain).hostname` throws TypeError: Invalid URL at `new URL`, exactly matching the prod frame lib/helpers/shop/getRedirectTracer.js:14. The catch logs '[getRedirectTracer]' via logger.error and returns the input url, so the request still answers 200 — every one of the 27 matching requests was status 200. Confirmed by latency: all 27 error entries pair one-to-one with a GET /api/recentBlogs request, minimum latency 3.195s, i.e. never below the 3000ms delay; of the 691 /recentBlogs requests under 3.0s in the same span, zero produced this error. A malformed string returned by trace-redirect would not be latency-gated at 3.0s. Merchant-visible consequence: blogPostUrl at articleController.js:979 falls back to the *.myshopify.com host instead of the traced custom domain.

Confidence: `high`

## Code
- `packages/functions/src/helpers/shop/getRedirectTracer.js:6` — Promise.race([tracer(url), delay(ms)]) — delay resolves undefined, so traceDomain is undefined on timeout
- `packages/functions/src/helpers/shop/getRedirectTracer.js:7` — new URL(traceDomain).hostname — the throwing line, matches prod frame lib/.../getRedirectTracer.js:14 'at new URL'
- `packages/functions/src/helpers/utils/delay.js:1` — delay resolves with no value; that undefined is what reaches new URL
- `packages/functions/src/controllers/articleController.js:970` — the only caller in the alert's stack — getRedirectTracer as index 1 of the Promise.all in getRecentBlogsWithLimit
- `packages/functions/src/controllers/articleController.js:979` — silent degradation: on fallback, domain is the raw myshopify host, so blogPostUrl loses the custom domain
- `packages/functions/src/helpers/shop/getRedirectTracer.js:10` — an expected 3s timeout is logged at logger.error, which is what fires the prod-error-alerts sink

## Evidence
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-24T00:00:00Z" AND jsonPayload.tag="[getRedirectTracer]"`
- 750 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-29T00:00:00Z" AND httpRequest.requestUrl:"/recentBlogs"`

## Job
- analyze rounds: 1
- cost: $1.92
- branch: `fix/prod-blog-4khzsv`
- fix commit: `ebb3df6577a49825f7508e7c1b6add2dea42f414`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/805
- tests: 235 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/shop/getRedirectTracer.js | 6 +++++-
 1 file changed, 5 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
