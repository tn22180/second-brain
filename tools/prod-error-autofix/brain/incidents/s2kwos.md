fingerprint: s2kwos
service: apiv2
message: [handleUploadFile] NMiT2Y1z9EjJkzICo4te Upload file error HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-10-13T18:30:47.705Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · s2kwos

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 4zzfhs (same app, service, shop NMiT2Y1z9EjJkzICo4te, same 18:23:35–18:23:52 window, same 20 log lines): that shop's Shopify Admin access token was invalid during one apiv2 langgraph blog run, and the apiv2 image/blog path never classifies 401/402/403 as an auth error, so one revoked-token run emitted 20 severity=ERROR lines (3 stacked per failed image upload) and paged prod-error-alerts twice under two different fingerprints.

**Mechanism.** Every Shopify Admin call in that single generation 401'd: 6× handleUploadFile (stagedUploadsCreate/fileCreate), 1× getBlogsGraphQL at 18:23:52.265, 1× createBlog at 18:23:52.338. handleUploadFile's catch logs logger.error unconditionally (shopifyGraphQlService.js:212) then rethrows a flattened `new Error('File upload failed: ' + error.message)` (line 213), dropping got's error.response.statusCode so no upstack caller can run isShopifyAuthError (helpers/api.js:151) on it; resolveImageResult (callModelNode.js:88) and startImageGeneration (callModelNode.js:168) then each log logger.error on the same failure → 3 ERROR lines × 6 images = 18, plus graphQLPosts.js:52 and genAIBlogService.js:107 = 20. The alert text differs from 4zzfhs only in which of the three stacked lines the sink matched first — 4zzfhs fingerprinted the [startImageGeneration] line, this one the [handleUploadFile] line underneath it; same failure, same six uploads. api.js:147-150 states the policy for exactly this class and tag.controller.js:128 implements it (logger.warn 'Shop no longer connected'), which is why the same 401 on /proxy/* pages nothing. Secondary: createFile's catch (line 202) retries blindly 3× on a non-retryable 401.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:212` — logger.error on every upload failure with no isShopifyAuthError branch — the ERROR line this alert fingerprinted
- `packages/functions/src/services/shopifyGraphQlService.js:213` — rethrows a bare Error, dropping error.response.statusCode so upstack layers cannot classify the 401
- `packages/functions/src/services/shopifyGraphQlService.js:202` — createFile retries 3× on any error, including a non-retryable 401
- `packages/functions/src/services/shopifyService.js:25` — initShopify builds the client from the stored accessTokenHash with no liveness check — the invalid token enters here
- `packages/functions/src/langgraph/nodes/callModelNode.js:88` — second logger.error for the same upload failure
- `packages/functions/src/langgraph/nodes/callModelNode.js:168` — third logger.error for the same upload failure; 6 images → 18 ERROR lines
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError, plus the comment stating 401/402/403 must log at warn so it does not page the sink
- `packages/functions/src/controllers/tag.controller.js:128` — the same 401 class handled correctly on the proxy path — logger.warn, zero alerts
- `packages/functions/src/helpers/graphql/graphQLPosts.js:52` — getBlogsGraphQL logs the same run's 401 at ERROR
- `packages/functions/src/services/genAIBlogService.js:107` — createBlog logs the same run's 401 at ERROR

## Evidence
- 6 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-10-13T18:08:38Z" AND timestamp<="2026-10-13T18:38:38Z" AND "[handleUploadFile]" AND "401 (Unauthorized)"`
- 20 matching entries: `timestamp>="2026-10-11T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "401 (Unauthorized)" AND resource.labels.service_name="apiv2"`
- 24 matching entries: `timestamp>="2026-10-11T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "401 (Unauthorized)" AND resource.labels.service_name="proxy" AND severity="WARNING"`
- 18 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apisa") AND timestamp>="2026-10-12T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "NMiT2Y1z9EjJkzICo4te"`

## Job
- analyze rounds: 1
- cost: $0.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
