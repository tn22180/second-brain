fingerprint: b9z5wv
service: proxy
message: [getPreview] CRITICAL: article left PUBLISHED after preview, manual unpublish required <http://snowverb.myshopify.com|snowverb.myshopify.com> articleId=removed
app: BLOG
repo: blogs
date: 2026-08-03T00:33:37.211Z
status: mr_open
attempt: 1

# BLOG · proxy · b9z5wv

**Outcome.** duplicate of wtekj7 — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Duplicate of fingerprints 9m7zmo / 14ydm3m / at2cvw / hqfte0 / wtekj7 / 1s3aso7 (MR https://gitlab.com/avada/blogs/-/merge_requests/798 open, unmerged): the previewed article does not exist in Shopify for snowverb.myshopify.com, getShopifyArticleById swallows its own `throw new Error('Article not found')` and returns `{}`, so getPreview treats the empty object as an unpublished article, publishes without checking userErrors, sets didPublishForPreview=true, crashes on `article.blog.handle`, and the finally block emits a false CRITICAL 'left PUBLISHED' alert.

**Mechanism.** Per request, 6 identical cycles between 00:24:38Z and 00:25:00Z: makeGraphQlApi returns data.article = null → shopifyGraphQlService.js:852 throws 'Article not found' (6 stderr entries whose stack names lib/services/shopifyGraphQlService.js:947 called from lib/controllers/appProxyController.js:129, i.e. src/.../appProxyController.js:123) → the catch at :873 logs it and :874 returns {} instead of rethrowing. appProxyController.js:128 evaluates `article.isPublished` on {} → undefined → falsy, so control falls through to the publish mutation at :135. updateShopifyArticle resolves normally (~145ms) because getPreview never inspects result.userErrors, so didPublishForPreview is set true at :136 on a mutation that actually failed with 'Article does not exist'. Line :142 then reads `article.blog.handle` on {} → TypeError "Cannot read properties of undefined (reading 'handle')" (6 entries, jsonPayload.tag='[getPreview]') → catch at :161 sets ctx.status = 500 (6 request-log 500s on /proxy/seoon-preview, all snowverb.myshopify.com). The finally at :169 calls revertArticleToDraft, which loops 3× (:26) with a 1s delay, each returning userErrors [{"field":["id"],"message":"Article does not exist"}] — 18 entries = 6 requests × 3 attempts — then emits the CRITICAL line at :51 (6 entries). Those revert userErrors are themselves proof the article does not exist, so the CRITICAL condition it reports cannot be true: nothing was ever published.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when processJSONMetafield(resp.data.article) is falsy — the throw named in the prod stack at lib/services/shopifyGraphQlService.js:947
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns {} instead of rethrowing, so the caller cannot distinguish 'article missing' from 'article object'
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on {} is undefined → falsy, so the missing article takes the publish-for-preview branch
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation fired with no userErrors check; it failed with 'Article does not exist' but resolved, so the failure is invisible here
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview = true set on an unverified mutation — this is what arms the false CRITICAL
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on {} throws the logged TypeError reading 'handle', producing the 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally calls revertArticleToDraft because didPublishForPreview is true
- `packages/functions/src/controllers/appProxyController.js:30` — revert reads result.userErrors but treats every non-empty userErrors as retryable — 'Article does not exist' is retried 3× like a transient failure
- `packages/functions/src/controllers/appProxyController.js:51` — the CRITICAL 'left PUBLISHED, manual unpublish required' line that fired this alert

## Evidence
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-03T00:09:52.360Z" AND timestamp<="2026-08-03T00:39:52.360Z" AND textPayload:"CRITICAL: article left PUBLISHED"`
- 18 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-03T00:09:52.360Z" AND timestamp<="2026-08-03T00:39:52.360Z" AND textPayload:"revert userErrors"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-03T00:09:52.360Z" AND timestamp<="2026-08-03T00:39:52.360Z" AND jsonPayload.error.message="Article not found"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-03T00:09:52.360Z" AND timestamp<="2026-08-03T00:39:52.360Z" AND jsonPayload.tag="[getPreview]"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-03T00:09:52.360Z" AND timestamp<="2026-08-03T00:39:52.360Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $0.81
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
