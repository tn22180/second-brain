fingerprint: 1gv9zvj
service: proxy
message: [getPreview] <http://abnx1x-7g.myshopify.com|abnx1x-7g.myshopify.com> Error fetching the resource: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-14T17:31:23.449Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1gv9zvj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The storefront render fetch in fetchRenderedArticleHtml (appProxyController.js:65) is a bare axios.get with no network-error handling, and its 3-attempt loop only retries non-200 *responses* — so one transient Shopify-side TLS socket reset (`read ECONNRESET`) on the first attempt escapes the loop, hits getPreview's outer catch and 500s the preview, even though 'ECONNRESET' is already in the repo's own RETRYABLE_CODES.

**Mechanism.** Execution 8djavzpy49ng emitted exactly ONE log line for the whole request: `[getPreview] abnx1x-7g.myshopify.com Error fetching the resource: read ECONNRESET` at 17:18:48.573017, i.e. 1.069s into a request that started at 17:18:47.503720 and ended at 17:18:48.833 (latency 1.329647043s). That single-line fact eliminates every logging candidate inside getPreview: getShopifyArticleById swallows its own errors (logs `[getShopifyArticleById]`, returns `{}` — shopifyGraphQlService.js:890-891), updateShopifyArticle logs `[updateShopifyArticle]` before rethrowing (shopifyGraphQlService.js:1192), any makeGraphQlApi path logs `[shopifyRetryGraphQL]` on every attempt (helpers/api.js:161), and revertArticleToDraft logs `revert threw`/`revert userErrors` on failure. None appeared. The 0.260s tail between the catch log and the end of the response then locates the thrower: a request that returns before any Shopify call finishes in 0.004-0.013s (the 19 400s for missing `id` and the 2 403 signature rejects in the same window), so 0.260s of work after the catch can only be the `finally`'s revertArticleToDraft (appProxyController.js:178), which runs only when didPublishForPreview is true (set at :137, after updateShopifyArticle published the draft at :136). The same 24h window contains three other getPreview failures that provably took that post-publish path, and all three show the same tail: `Request failed with status code 503` at 18:14:35 (error 0.860s in, latency 1.110s → 0.250s tail), the same at 07:33:52 (1.226s in, 1.514s → 0.288s), and 4x `Cannot read properties of undefined (reading 'handle')` at 19:13 (which can only throw at :143, after the publish succeeded). So the reset happened after line 137 — and the only remaining call there that can produce the message `read ECONNRESET` is axios.get at :65 (a TypeError on `article.blog.handle` would read 'handle', as the glacierfrostco lines show). Inside that loop the retry is wired to the *response*: `if (response.status === 200) return response.data` (:77) then retry on non-200 (:85), with `validateStatus: status => status < 500` (:74) making 5xx throw as well — so neither a socket reset nor a storefront 5xx ever spends attempt 2 or 3. The two `status code 503` 500s in the same window are that same dead retry path. PREVIEW_FETCH_MAX_ATTEMPTS=3 is therefore only effective against 3xx/4xx. The transient itself is fleet-wide, not proxy-specific: 115 ECONNRESET lines in 41 bursts on BLOG `api` over the same 24h (recorded fingerprints udahv5, obklqt, 1q9n03), against only 2 on `proxy` — so the defect is the missing retry, not the reset. Sibling still open on this same handler: `await shopLocalesGraphQL(shopify)` at :122 is the unretried `shopify.graphql` call obklqt already named here by file:line; it is eliminated as this alert's thrower by the post-publish tail, but it is the next 500 on this endpoint.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/appProxyController.js:65` — bare axios.get to the storefront with no try/catch — a thrown ECONNRESET escapes the whole attempt loop on attempt 1; by elimination the thrower in execution 8djavzpy49ng
- `packages/functions/src/controllers/appProxyController.js:74` — validateStatus: status => status < 500 — makes storefront 5xx throw out of the loop too, which is the other two getPreview 500s in the window (`Request failed with status code 503`)
- `packages/functions/src/controllers/appProxyController.js:77` — retry decision reads response.status only; there is no branch for a rejected promise, so PREVIEW_FETCH_MAX_ATTEMPTS=3 is dead for network faults
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview = true, set only after the publish mutation succeeds — the flag whose finally-branch explains the 0.260s post-catch tail
- `packages/functions/src/controllers/appProxyController.js:178` — finally → revertArticleToDraft, the 0.260s of work after the catch; matches the 0.250s/0.288s tails of the two known post-publish failures and rules out a pre-publish thrower
- `packages/functions/src/controllers/appProxyController.js:171` — the catch that produced the alert text — the only log line of the whole execution
- `packages/functions/src/helpers/api.js:138` — 'ECONNRESET' is already in RETRYABLE_CODES — the in-repo convention the raw axios call at :65 never consults
- `packages/functions/src/helpers/api.js:161` — logger.error('[shopifyRetryGraphQL]', e) fires on every attempt; its absence in 8djavzpy49ng rules out every makeGraphQlApi path
- `packages/functions/src/services/shopifyGraphQlService.js:890` — getShopifyArticleById logs then returns {} — rules it out as the thrower, and is the cause of the 4 sibling 'reading handle' 500s
- `packages/functions/src/services/shopifyGraphQlService.js:1192` — updateShopifyArticle logs '[updateShopifyArticle]' before rethrow; its absence rules out both the publish at :136 and the revert at :178
- `packages/functions/src/controllers/appProxyController.js:122` — await shopLocalesGraphQL(shopify) — the unretried shopify.graphql sibling obklqt named at this exact line; eliminated for this alert by the post-publish tail, still live

## Evidence
- 1 matching entries: `resource.labels.service_name="proxy" AND labels.execution_id="8djavzpy49ng"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z" AND "ECONNRESET"`
- 7 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getPreview]" AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z"`
- 7 matching entries: `resource.labels.service_name="proxy" AND logName:"requests" AND httpRequest.requestUrl:"seoOn-preview" AND httpRequest.status=500 AND timestamp>="2026-10-13T17:00:00Z" AND timestamp<="2026-10-14T17:30:00Z"`
- 2 matching entries: `resource.labels.service_name="proxy" AND logName:"requests" AND httpRequest.requestUrl:"39cf993caac354c12ac4704e18fba74c9ea99bc311873e1e915336b279007880" AND timestamp>="2026-10-14T17:18:00Z" AND timestamp<="2026-10-14T17:19:30Z"`

## Job
- analyze rounds: 1
- cost: $1.76

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
