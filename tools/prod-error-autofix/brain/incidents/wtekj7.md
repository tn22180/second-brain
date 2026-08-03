fingerprint: wtekj7
service: proxy
message: [getShopifyArticleById] 5qJwEHGKKgt456kS15XU removed Error: Article not found
app: BLOG
repo: blogs
date: 2026-08-03T00:27:34.157Z
status: mr_open
attempt: 1

# BLOG · proxy · wtekj7

**Outcome.** duplicate of 9m7zmo — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** getShopifyArticleById swallows its own `throw new Error('Article not found')` and returns `{}`, so getPreview treats a deleted Shopify article as merely unpublished, publishes it, then TypeErrors on `article.blog.handle` — 6 of 6 /proxy/seoon-preview requests in the window returned 500 for shop snowverb.myshopify.com. Same defect as fingerprints at2cvw / 9m7zmo / 14ydm3m / 1zjaa5 / hqfte0 (MR https://gitlab.com/avada/blogs/-/merge_requests/798 open, unmerged), now on a different shop (5qJwEHGKKgt456kS15XU) and a different article, confirming it is not shop- or article-specific.

**Mechanism.** GET /proxy/seoon-preview?id=<articleId>&shop=snowverb.myshopify.com → appProxyController.js:123 calls getShopifyArticleById. Shopify's `article(id:)` resolves null (article deleted — proven by Shopify's own userErrors `{"field":["id"],"message":"Article does not exist"}` on every revert attempt), so `processJSONMetafield(resp.data?.article)` is falsy and shopifyGraphQlService.js:852 throws 'Article not found'. Its own catch at :872-873 logs the exact stack seen in the alert and :874 returns `{}` instead of rethrowing. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → the not-published branch runs: :135 fires the publish mutation against a non-existent article (userErrors discarded), :136 sets didPublishForPreview = true, then :142 dereferences `article.blog.handle` on `{}` → TypeError "Cannot read properties of undefined (reading 'handle')" → catch at :161-163 logs it and sets ctx.status = 500. The `finally` at :169 then calls revertArticleToDraft because the flag is set; it retries 3× (:27-47), each getting `Article does not exist`, and ends at the CRITICAL log :50-54 — a false 'left PUBLISHED' page even though nothing was ever published. Log arithmetic matches 1:1: each of the 6 requests emits exactly 6 entries in that order (Article-not-found stack → handle TypeError → revert 1/3, 2/3, 3/3 → CRITICAL). 6 × 6 = 36 app lines = the stderr read exactly; 36 + 6 request-log ERROR entries = the 42-entry errors read. Latency is flat 2.835–3.030s across all 6, which is the 3 revert retries × 1s PREVIEW_REVERT_RETRY_DELAY_MS dominating — the retries are pure waste against an article Shopify says does not exist.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when processJSONMetafield(resp.data?.article) is falsy — the message and top frame in the alert stack
- `packages/functions/src/services/shopifyGraphQlService.js:873` — catch logs '[getShopifyArticleById]' shop.id 5qJwEHGKKgt456kS15XU id e — byte-for-byte the prod log line
- `packages/functions/src/services/shopifyGraphQlService.js:874` — returns {} instead of rethrowing, so the caller cannot distinguish 'article deleted' from a valid article — the defect
- `packages/functions/src/controllers/appProxyController.js:123` — getPreview's call site; no emptiness guard on the returned object
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on {} is undefined → falsy → falls through into the publish path for a deleted article
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation issued against an article that does not exist; its userErrors are discarded
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview = true is set on the strength of a mutation that silently failed
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on {} throws the TypeError that becomes the 500
- `packages/functions/src/controllers/appProxyController.js:162` — catch logs '[getPreview] snowverb.myshopify.com Error fetching the resource: Cannot read properties of undefined (reading handle)' — the exact prod line
- `packages/functions/src/controllers/appProxyController.js:169` — finally runs revertArticleToDraft because the flag is set, driving 3 futile retries per request (18 in the window)
- `packages/functions/src/controllers/appProxyController.js:50` — CRITICAL 'article left PUBLISHED after preview, manual unpublish required' — fired 6 times though nothing was ever published
- `packages/functions/src/controllers/appProxyController.js:112` — the existing missing-id guard (fix for P2/fingerprint 12qs3xc family) — precedent for guarding before the Shopify call, but it does not cover a deleted article

## Evidence
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:51.816Z" AND timestamp<="2026-08-03T00:39:51.816Z" AND httpRequest.status>=500`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:51.816Z" AND timestamp<="2026-08-03T00:39:51.816Z" AND severity>=ERROR AND jsonPayload.error.message="Article not found"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:51.816Z" AND timestamp<="2026-08-03T00:39:51.816Z" AND severity>=ERROR AND jsonPayload.message:"Cannot read properties of undefined (reading 'handle')"`
- 18 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:51.816Z" AND timestamp<="2026-08-03T00:39:51.816Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:51.816Z" AND timestamp<="2026-08-03T00:39:51.816Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`

## Job
- analyze rounds: 1
- cost: $0.98
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
