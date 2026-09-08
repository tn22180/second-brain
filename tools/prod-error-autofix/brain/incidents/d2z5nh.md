fingerprint: d2z5nh
service: apisa
message: [fetchHtmlContent] null Error fetching html content FetchError: Response timeout while trying to fetch <https://sisustus1.fi/blogs/news/olohuoneen-sisustus-sisustus1-fi-n-vinkit-viihtyisan-ja-toimivan-tilan-luomiseen> (over 8000ms)
app: BLOG
repo: blogs
date: 2026-09-08T02:25:42.588Z
status: fix_disabled
attempt: 1

# BLOG · apisa · d2z5nh

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** articleController.list still fans out one storefront HTML GET per article in a single unbounded Promise.all, so three GET /apiSa/articles?limit=100 requests each issued ~60 simultaneous node-fetch GETs to the merchant custom domain sisustus1.fi from one apisa instance and every one of them hit fetchHtmlContent's 8000ms cap with type=body-timeout, producing 182 severity=ERROR lines and three 12.5–13.5s 200 responses with the SEO column blank.

**Mechanism.** The 182 alerted lines all carry tag=[fetchHtmlContent], all name sisustus1.fi, and all report `type: body-timeout` (182/182). They group into exactly three execution_ids — qlwmb81ymt5a (63), qlympzqvodpv (59), qm1jfoxrqhhv (60) — and inside each group the timestamps span 17ms, 826ms and 28ms respectively, i.e. all ~60 fetches in a group were issued together and expired together 8s later. Each group's URL set is fully distinct (63/63, 59/59, 60/60 unique article handles), so this is one fetch per article of a 100-item Shopify page, not retries. The three groups line up one-to-one with the only three long apisa requests in the window: GET /apiSa/articles?limit=100&order=UPDATED_AT+desc&page=1 at 02:13:32.252Z (200, 13.167s), ...&page=2 at 02:15:06.091Z (200, 12.500s), ...&before=eyJsYXN0X2lk...&page=1 at 02:17:21.811Z (200, 13.528s) — each = ~5s of Shopify GraphQL + Firestore merge, then the 8s timeout wall. Code path: list() wraps the whole Shopify page in one Promise.all with no concurrency limiter (articleController.js:812) and calls getSeoAnalysisPage once per article with `https://${getDomain(shop)}/blogs/<blog>/<handle>` (articleController.js:832); getDomain returns shop.domain before shopifyDomain (helpers/shop/getDomain.js:11), so the target is the merchant custom domain sisustus1.fi. getSeoAnalysisPage calls fetchHtmlContent (seoService.js:189), a single node-fetch v2 GET with `timeout: 8000` (articleController.js:106) and no keepalive agent — ~60 separate TLS handshakes and in-flight requests against one origin from one container. type=body-timeout means connect, TLS and response headers all succeeded and only the body stalled, which is what an origin does when 60 concurrent crawls arrive from one IP. Each failure logs at logger.error (articleController.js:117) — that is the alert; fetchHtmlContent returns null and getSeoAnalysisPage returns {h1:0,title:0,fetchFailed:true} (seoService.js:198), so the merchant gets 200 with the SEO column empty for the whole page, which is why the httpRequest.status>=500 read matched 0. Fan-out width is the discriminator, not a dead origin: in the same 12-minute merchant session the six requests with limit=10 (02:06:23.961Z 4.29s, 02:07:15.367Z 0.64s, 02:07:20.480Z 4.34s, 02:09:16.625Z 3.92s, 02:10:05.362Z 3.02s, 02:12:05.407Z 1.44s) produced ZERO fetchHtmlContent errors — the first [fetchHtmlContent] line in the whole window is 02:13:44.772Z — while all three limit=100 requests failed 100% of their fetches. Same defect family as recorded fingerprints o878fj/mmxvm4 on service `api` (40 concurrent, 8.4ms spread, body-timeout, littlethingshewear.com); MR 837 added the limiter but was never merged, so master (packages/functions/src/controllers/articleController.js:812) still has the bare Promise.all, and the failure has now moved to the standalone apisa mount. Second, unrelated cause in the same window, not part of this alert: 8 [getShopifyArticleById] lines at 02:06:17/02:06:20 from the getRecentPosts branch (articleController.js:786) — stale article gids, the known 3349gs family.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/articleController.js:812` — unbounded Promise.all over the whole 100-article Shopify page — the fan-out that issues ~60 concurrent storefront GETs from one request
- `packages/functions/src/controllers/articleController.js:832` — per-article getSeoAnalysisPage call inside that Promise.all, URL built from getDomain(shop)
- `packages/functions/src/controllers/articleController.js:106` — node-fetch v2 GET with timeout: 8000 — the exact cap quoted in all 182 FetchError messages ('over 8000ms')
- `packages/functions/src/controllers/articleController.js:117` — logger.error per failed fetch — the 182 severity=ERROR lines that fired the alert
- `packages/functions/src/services/seoService.js:189` — getSeoAnalysisPage -> fetchHtmlContent, links the list handler to the timing-out fetch
- `packages/functions/src/services/seoService.js:198` — fetchFailed:true returned on null html — why the request answers 200 with an empty SEO column instead of 5xx (requests read matched 0)
- `packages/functions/src/helpers/shop/getDomain.js:11` — shop.domain wins over shopifyDomain, so all fetches target the merchant custom domain sisustus1.fi
- `packages/functions/src/controllers/articleController.js:786` — getRecentPosts branch — source of the 8 unrelated [getShopifyArticleById] errors in the same window, a separate cause

## Evidence
- 182 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-09-07T01:58:46.885Z" AND timestamp<="2026-09-07T02:28:46.885Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 182 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-09-07T01:58:46.885Z" AND timestamp<="2026-09-07T02:28:46.885Z" AND jsonPayload.message:"type: body-timeout"`
- 6 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-09-07T01:58:46.885Z" AND timestamp<="2026-09-07T02:28:46.885Z" AND httpRequest.requestUrl:"limit=100"`
- 183 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-09-06T02:28:46Z" AND timestamp<="2026-09-07T02:28:46Z" AND jsonPayload.tag="[fetchHtmlContent]"`

## Job
- analyze rounds: 1
- cost: $2.13

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
