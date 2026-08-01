fingerprint: 9m7zmo
service: proxy
message: [getPreview] CRITICAL: article left PUBLISHED after preview, manual unpublish required <http://glacierfrostco.myshopify.com|glacierfrostco.myshopify.com> articleId=560458924077
app: BLOG
repo: blogs
date: 2026-07-31T14:52:52.473Z
status: mr_open
attempt: 1

# BLOG · proxy · 9m7zmo

**Outcome.** duplicate of 14ydm3m — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Article gid://shopify/Article/560458924077 does not exist in Shopify for glacierfrostco.myshopify.com; getShopifyArticleById swallows its own 'Article not found' throw and returns {}, so getPreview treats the empty object as an unpublished article, fires the publish mutation without checking userErrors, sets didPublishForPreview=true, then crashes on article.blog.handle — and the finally block burns 3 revert mutations against the nonexistent article and escalates to a CRITICAL 'left PUBLISHED' alert that is false: nothing was ever published.

**Mechanism.** Per request (4 identical cycles at 13:25:19/22/25/28Z): makeGraphQlApi returns data.article = null → shopifyGraphQlService.js:852 throws 'Article not found' → the catch at :872 logs it (jsonPayload.tag='[getShopifyArticleById]', 4 hits) and returns {} at :874 instead of rethrowing. appProxyController.js:123 receives {}; :128 `article.isPublished` is undefined → falsy, so control falls through to the publish mutation at :135. updateShopifyArticle resolves normally (~140ms: 13:25:19.775 → 13:25:19.916) because updateArticlePrimary returns the articleUpdate payload and getPreview never inspects result.userErrors — so didPublishForPreview is set true at :136 on a mutation that actually failed with 'Article does not exist'. Line :142 then evaluates `article.blog.handle` on {} → TypeError 'Cannot read properties of undefined (reading \'handle\')' (4 hits) → catch at :161 returns HTTP 500 (4 request-log 500s on /proxy/seoOn-preview). The finally at :169 runs revertArticleToDraft, which loops 3× at :27 with a 1s delay, each returning userErrors [{"field":["id"],"message":"Article does not exist"}] (12 hits = 4 requests × 3 attempts), and then emits the CRITICAL log at :50 (4 hits). The revert userErrors are themselves the proof the article does not exist, i.e. the CRITICAL condition it reports cannot be true.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when resp.data.article is null — this is the throw named in the prod stack (lib/services/shopifyGraphQlService.js:947)
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns {} instead of rethrowing, so the caller cannot tell 'missing article' from 'article object'
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on {} is undefined → falsy, so the missing article takes the publish-for-preview branch
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation fired with no userErrors check; it failed with 'Article does not exist' but resolved, so the failure is invisible here
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview = true set on an unverified mutation — this is what arms the false CRITICAL
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on {} throws the logged TypeError reading 'handle', producing the 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally calls revertArticleToDraft because didPublishForPreview is true
- `packages/functions/src/controllers/appProxyController.js:30` — revert reads result.userErrors but treats every non-empty userErrors identically — 'Article does not exist' is retried like a transient failure
- `packages/functions/src/controllers/appProxyController.js:50` — the CRITICAL 'left PUBLISHED, manual unpublish required' line that fired the alert

## Evidence
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-07-31T13:10:24.768Z" AND timestamp<="2026-07-31T13:40:24.768Z" AND textPayload:"CRITICAL: article left PUBLISHED"`
- 12 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-07-31T13:10:24.768Z" AND timestamp<="2026-07-31T13:40:24.768Z" AND textPayload:"revert userErrors"`
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-07-31T13:10:24.768Z" AND timestamp<="2026-07-31T13:40:24.768Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-07-31T13:10:24.768Z" AND timestamp<="2026-07-31T13:40:24.768Z" AND jsonPayload.message:"Cannot read properties of undefined (reading 'handle')"`
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-07-31T13:10:24.768Z" AND timestamp<="2026-07-31T13:40:24.768Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.03
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
