fingerprint: 1ef2myc
service: proxy
message: [getShopifyArticleById] iKvkUbMjIuVpAFMIe50Z [CARD] InvalidArticleIdError: Article id could not be resolved to a gid: "[CARD]"
app: BLOG
repo: blogs
date: 2026-10-09T10:31:34.992Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1ef2myc

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById throws InvalidArticleIdError for the non-numeric id `[CARD]` but its own catch swallows it and returns `{}` (shopifyGraphQlService.js:891), so getPreview treats the empty object as a real article, publishes it, then dereferences `article.blog.handle` and 500s — an unshipped recurrence of recorded fingerprint 18e2dxz, same two lines, different malformed id.

**Mechanism.** Two GET /proxy/seoOn-preview requests at 10:27:12.870 and 10:27:16.380, same shop full-of-yoga-2.myshopify.com, same noCache uuid 231070fc-1467-4161-937c-9b0fed428c27, UA HeadlessChrome/148.0.7778.96 (X11 Linux) — a replay of one editor-built draft-preview URL (the noCache+locale shape is only produced by buildDraftPreviewUrl, packages/assets/src/pages/Blog/containers/EditorContainer.jsx:144) whose `id` value was substituted with the literal DLP placeholder `[CARD]`. Cloud Run's own httpRequest.requestUrl carries `id=%5BCARD%5D`, so the client really sent it; nothing app-side rewrote it. appProxyController.js:113 only checks `!id`, so `"[CARD]"` passes the guard. getShopifyArticleById normalizes it, the regex `/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` rejects it, and line 760 throws InvalidArticleIdError — logged at 10:27:13.164643Z and 10:27:16.612724Z with the exact stack in the alert. The catch at line 890 logs and `return {}` (line 891). Back in getPreview, `article.isPublished` is undefined so the line 129 branch is skipped, line 136 fires updateShopifyArticle publish, which Shopify rejects with INVALID_VARIABLE `Invalid global id 'gid://shopify/Article/[CARD]'` (updateArticlePrimary resp.errors at 10:27:13.386902Z / 10:27:16.832856Z) — the return value is never inspected, so line 137 sets didPublishForPreview = true anyway. Line 143 then reads `article.blog.handle` on `{}` and throws `Cannot read properties of undefined (reading 'handle')` (10:27:13.387336Z / 10:27:16.833238Z), caught at line 170 → ctx.status = 500 (line 172). The `finally` at line 178 then runs revertArticleToDraft, whose 3 attempts all fail with the same INVALID_VARIABLE (attempt=1/3 10:27:13.598871Z → 3/3 10:27:16.031473Z, and again 10:27:17.052147Z → 10:27:19.518894Z), ending in the false `CRITICAL: article left PUBLISHED after preview` at appProxyController.js:52 — nothing was ever published, because the publish mutation failed too. The 6 wasted Shopify mutations are also what stretched each request to 3.13s/3.15s.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` instead of rethrowing, converting the named InvalidArticleIdError into a silently-empty article object — the single line that turns a 400-class bad input into a 500
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throws InvalidArticleIdError for `[CARD]` — the exact error name and message in the alert stack
- `packages/functions/src/controllers/appProxyController.js:113` — id guard checks presence only; a non-numeric, non-gid id passes straight through to the service
- `packages/functions/src/controllers/appProxyController.js:124` — the getShopifyArticleById call frame named in the stack (lib line 129); the `{}` it returns is never validated before use
- `packages/functions/src/controllers/appProxyController.js:136` — publishes before validating the article object; the mutation's userErrors are never inspected
- `packages/functions/src/controllers/appProxyController.js:137` — sets didPublishForPreview = true unconditionally, so the finally block reverts an article that was never published
- `packages/functions/src/controllers/appProxyController.js:143` — `article.blog.handle` on the `{}` returned by the swallowed error — the TypeError that becomes the 500
- `packages/functions/src/controllers/appProxyController.js:52` — emits the false CRITICAL manual-unpublish alert even though the publish mutation itself failed

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-10-09T10:12:15.306Z" AND timestamp<="2026-10-09T10:42:15.306Z" AND severity>=ERROR AND jsonPayload.error.name="InvalidArticleIdError"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-10-09T10:12:15.306Z" AND timestamp<="2026-10-09T10:42:15.306Z" AND severity>=ERROR AND jsonPayload.message:"Error fetching the resource: Cannot read properties of undefined"`
- 8 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-10-09T10:12:15.306Z" AND timestamp<="2026-10-09T10:42:15.306Z" AND severity>=ERROR AND jsonPayload.tag="[updateArticlePrimary]" AND jsonPayload.message:"INVALID_VARIABLE"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-10-09T10:12:15.306Z" AND timestamp<="2026-10-09T10:42:15.306Z" AND severity>=ERROR AND textPayload:"article left PUBLISHED after preview"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-10-09T10:12:15.306Z" AND timestamp<="2026-10-09T10:42:15.306Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"seoOn-preview"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
