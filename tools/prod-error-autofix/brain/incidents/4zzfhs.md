fingerprint: 4zzfhs
service: apiv2
message: [startImageGeneration] NMiT2Y1z9EjJkzICo4te Failed to generate image Error: File upload failed: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-10-13T18:28:58.727Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · 4zzfhs

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop NMiT2Y1z9EjJkzICo4te's Shopify Admin access token was invalid during one langgraph blog run, and the apiv2 image/blog path — unlike proxy's tag.controller — never classifies 401/402/403 as an auth error, so a single revoked-token run emitted 20 severity=ERROR lines (3 stacked per failed image upload) and paged prod-error-alerts.

**Mechanism.** At 18:23:35–18:23:52 every Shopify Admin call in one apiv2 generation 401'd for that shop: 6× handleUploadFile (stagedUploadsCreate/fileCreate), 1× getBlogsGraphQL, 1× createBlog. handleUploadFile's catch logs logger.error unconditionally (shopifyGraphQlService.js:212) then rethrows a flattened `new Error('File upload failed: ' + error.message)` (line 213) which drops got's `error.response.statusCode`, so no caller upstack can run isShopifyAuthError on it; resolveImageResult (callModelNode.js:88) and startImageGeneration (callModelNode.js:168) each log logger.error again on the same failure → 3 ERROR lines × 6 images = 18, plus graphQLPosts.js:52 and genAIBlogService.js:107 = 20. api.js:147-152 states the policy for exactly this class ('a merchant action, not an app fault. Log it at warn so it doesn't page the prod-error-alerts sink') and tag.controller.js:128 implements it — all 24 proxy 401s in the same 3.5 days logged WARNING 'Shop no longer connected' and paged nothing. Secondary: createFile's catch (line 202) retries blindly 3× on a 401, which is non-retryable.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:212` — logger.error on every upload failure with no isShopifyAuthError branch — source of the paging ERROR line
- `packages/functions/src/services/shopifyGraphQlService.js:213` — rethrows a bare Error, dropping error.response.statusCode so upstack layers cannot classify the 401
- `packages/functions/src/services/shopifyGraphQlService.js:202` — createFile retries 3× on any error, including a non-retryable 401
- `packages/functions/src/langgraph/nodes/callModelNode.js:88` — second logger.error for the same upload failure
- `packages/functions/src/langgraph/nodes/callModelNode.js:168` — third logger.error for the same upload failure; 6 images in parallel → 18 ERROR lines
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError plus the comment stating 401/402/403 must log at warn so it does not page the sink
- `packages/functions/src/controllers/tag.controller.js:128` — the same 401 class handled correctly — logger.warn 'Shop no longer connected', 24 occurrences, zero alerts
- `packages/functions/src/helpers/graphql/graphQLPosts.js:52` — getBlogsGraphQL logs the 401 at ERROR
- `packages/functions/src/services/genAIBlogService.js:107` — createBlog logs the 401 at ERROR

## Evidence
- 20 matching entries: `timestamp>="2026-10-11T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "401 (Unauthorized)" AND resource.labels.service_name="apiv2"`
- 6 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-10-13T18:08:38Z" AND timestamp<="2026-10-13T18:38:38Z" AND "[handleUploadFile]" AND "401 (Unauthorized)"`
- 24 matching entries: `timestamp>="2026-10-11T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "401 (Unauthorized)" AND resource.labels.service_name="proxy" AND severity="WARNING"`
- 18 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apisa") AND timestamp>="2026-10-12T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "NMiT2Y1z9EjJkzICo4te"`

## Job
- analyze rounds: 1
- cost: $1.90

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
