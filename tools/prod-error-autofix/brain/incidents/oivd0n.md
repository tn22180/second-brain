fingerprint: oivd0n
service: api
message: [seoProxyApi] <http://roambox-3.myshopify.com|roambox-3.myshopify.com> POST /updateOvrList error 500 Request failed with status code 500
app: BLOG
repo: blogs
date: 2026-08-04T13:13:38.943Z
status: mr_open
attempt: 2

# BLOG · api · oivd0n

**Outcome.** duplicate of q012sa — MR https://gitlab.com/avada/blogs/-/merge_requests/803

**Root cause.** A one-off HTTP 500 from the upstream Avada SEO proxy (https://seo.apps.avada.io/proxy/updateOvrList) hit seoProxyApi's fire-and-forget call inside a PUT /api/article/628566065418 that itself returned 200; seoProxyApi has no retry and logs any non-4xx upstream failure at logger.error, so a transient upstream blip pages the prod-error-alerts sink and silently leaves roambox-3's SEO override list stale.

**Mechanism.** articleController.update puts seoProxyApi({url:'/updateOvrList', method:'POST'}) into the Promise.all of PUT /api/article/:id (articleController.js:584). seoProxyApi POSTs to `${AVADA_SEO_PRO_URL}/proxy/updateOvrList` through the shared axios client, which is created with no timeout and no retry (api.js:9, api.js:82). Upstream answered 500 at 2026-08-04T13:05:06.418Z. The catch at api.js:98 splits on status: 400-499 goes to logger.warn (api.js:100-102, the MR 803 fix), everything else falls through to logger.error (api.js:104), which the logger emits at severity ERROR and the sink pages on. The catch returns undefined, so Promise.all resolves and the merchant's PUT completed 200 in 1.31s (request log 13:05:05.676Z) — no user-facing failure, but also no retry and no signal to the caller, so the override-list update for article 628566065418 is lost permanently. The 500 is not a BLOG fault: 6 of the other 7 seoProxyApi failures in 24h were per-shop 403s already downgraded to warn, and this is the only 5xx.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/api.js:104` — logger.error for every non-4xx upstream failure — this exact line emitted the alert message
- `packages/functions/src/helpers/api.js:100` — severity split only downgrades 400-499; a transient upstream 5xx still pages
- `packages/functions/src/helpers/api.js:106` — catch swallows and returns undefined — no retry, no rethrow, so the updateOvrList write is silently dropped
- `packages/functions/src/helpers/api.js:9` — shared axios client created with no timeout and no retry policy
- `packages/functions/src/controllers/articleController.js:584` — fire-and-forget callsite inside the Promise.all of PUT /api/article/:id — the request that logged this alert
- `packages/functions/src/services/genAIBlogService.js:188` — second callsite of the same best-effort call; any fix must cover both

## Evidence
- 1 matching entries: `jsonPayload.tag="[seoProxyApi]" AND severity>=ERROR AND timestamp>="2026-08-04T12:50:24.406Z" AND timestamp<="2026-08-04T13:20:24.406Z"`
- 2 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl!="" AND timestamp>="2026-08-04T13:05:00Z" AND timestamp<="2026-08-04T13:05:15Z"`
- 7 matching entries: `jsonPayload.tag="[seoProxyApi]" AND timestamp>="2026-08-03T13:20:00Z" AND timestamp<="2026-08-04T13:20:24Z"`
- 6 matching entries: `jsonPayload.tag="[seoProxyApi]" AND severity="WARNING" AND timestamp>="2026-08-03T13:20:00Z" AND timestamp<="2026-08-04T13:20:24Z"`

## Job
- analyze rounds: 2
- cost: $2.64
- MR: https://gitlab.com/avada/blogs/-/merge_requests/803

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
