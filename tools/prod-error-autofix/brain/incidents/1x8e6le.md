fingerprint: 1x8e6le
service: api
message: [fetchHtmlContent] null Error fetching html content FetchError: Invalid response body while trying to fetch <https://checkout.swaddlean.com/blogs/familys-life/cowboy-baby-shower-games-that-dont-suck>: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T02:39:31.362Z
status: fix_disabled
attempt: 1

# BLOG · api · 1x8e6le

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The merchant origin checkout.swaddlean.com reset the TLS socket mid-gzip-body on 2 of the ~10 concurrent storefront GETs issued by one GET /api/articles?limit=10&searchKey=1 list request, and fetchHtmlContent has no retry for transient socket errors — it swallows the FetchError, logs it at severity ERROR and returns null, so a 200 response with 2 blank SEO columns still fires a prod ERROR alert.

**Mechanism.** Both alert lines share execution_id 8x58tfdak25c and spanId 11710576291202922074 (one request) at 02:27:47.994021Z and 02:27:48.407076Z on revision api-00190-lub. The only request log bracketing both is GET /api/articles?limit=10&order=UPDATED_AT+desc&page=1&searchKey=1, status 200, latency 4.445254891s, timestamp (= start) 02:27:43.947406Z → ends ~02:27:48.39. That endpoint is articleController.list, which fans out one getSeoAnalysisPage per article inside Promise.all (articleController.js:810, call at :830) with the url built from getDomain(shop) (getDomain.js:11 returns shop.domain first, hence checkout.swaddlean.com rather than *.myshopify.com). getSeoAnalysisPage calls fetchHtmlContent (seoService.js:206), which is a single node-fetch v2 GET (articleController.js:106, node-fetch ^2.6.7) with timeout: 8000, no retry and no keepalive agent — every article is its own TLS handshake. node-fetch rejects from the Gunzip stream (`FetchError: Invalid response body ... read ECONNRESET`, code/errno ECONNRESET, type system, no nested errors, stack at node-fetch/lib/index.js:400), which means connect, TLS and response headers all succeeded and the origin dropped the connection while the gzip body was streaming. fetchHtmlContent catches, logs via logger.error (articleController.js:118) and returns null; getSeoAnalysisPage maps null to {h1:0, title:0, fetchFailed:true} (seoService.js:207-216), so the request still answered 200 (httpRequest.status>=500 matched 0 in the window) and the merchant just sees two posts with an empty SEO column. Scope check: over 24h there were 562 [fetchHtmlContent] errors, but 559 of them are the separate `over 8000ms` body-timeout shape on 4 custom domains concentrated in 12 fan-out executions of 49-76 failures each (the residual of fingerprint o878fj / MR 837's unbounded Promise.all, which is still unmerged here) — only 2 of 562 are this ECONNRESET, and both are this one request, so the fan-out is not what caused this reset. The window also carries 14 ECONNRESETs in 35 min across 3 different instances and 3 different peers (fetchAllImagesFromShopify, shopifyRetryGraphQL ×2 write ECONNRESET, articleController.update, 6 bare `Exception from a finished function: Error: read ECONNRESET`), i.e. a transient network-level reset cluster — same family as the recorded 2026-10-14/15 fingerprints udahv5 and 1vkqjp1 — not a defect in the storefront fetch itself. The defect that is ours is that one transient reset on a best-effort, already-degraded SEO probe is both unretried and reported at ERROR.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/articleController.js:106` — the single-attempt node-fetch v2 GET with timeout: 8000 and no retry/keepalive agent — the call whose Gunzip stream threw the ECONNRESET FetchError
- `packages/functions/src/controllers/articleController.js:118` — logger.error on the handled degraded path — emits severity ERROR, which is the only reason this 200 request raised a Slack alert
- `packages/functions/src/controllers/articleController.js:104` — fetchHtmlContent definition — the tag [fetchHtmlContent] in both alert lines
- `packages/functions/src/services/seoService.js:206` — getSeoAnalysisPage -> fetchHtmlContent, links the list handler to the failing fetch
- `packages/functions/src/services/seoService.js:215` — fetchFailed: true on null html — why the request answers 200 with h1:0/title:0 instead of a 5xx
- `packages/functions/src/controllers/articleController.js:830` — the per-article getSeoAnalysisPage call inside list's Promise.all — the call site of the 2 failed fetches in this request
- `packages/functions/src/controllers/articleController.js:810` — unbounded Promise.all over the article page — explains 2 storefront fetches in one execution_id (and the separate 559 timeouts, not this alert's cause)
- `packages/functions/src/helpers/shop/getDomain.js:11` — shop.domain wins over shopifyDomain, so the probe targets the merchant custom domain checkout.swaddlean.com

## Evidence
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T02:12:49.072Z" AND timestamp<="2026-10-15T02:42:49.072Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:27:30Z" AND timestamp<="2026-10-15T02:28:10Z" AND httpRequest.requestUrl:"searchKey=1"`
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:00:00Z" AND jsonPayload.tag="[fetchHtmlContent]" AND jsonPayload.message:"Invalid response body"`
- 559 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:00:00Z" AND jsonPayload.tag="[fetchHtmlContent]" AND jsonPayload.message:"over 8000ms"`
- 14 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T02:10:00Z" AND timestamp<="2026-10-15T02:45:00Z" AND "ECONNRESET"`

## Job
- analyze rounds: 1
- cost: $2.11

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
