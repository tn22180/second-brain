fingerprint: 13r3cvt
service: apiv2
message: [getBlogsGraphQL] Error fetching blogs: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-10-13T18:52:20.460Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · 13r3cvt

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 4zzfhs (also re-fired as s2kwos and 8n4f7b) — same app, service, shop NMiT2Y1z9EjJkzICo4te and the same 18:23:35–18:23:52 burst: that shop's Shopify Admin access token was invalid during one apiv2 langgraph blog run, and the apiv2 image/blog path never classifies 401 as an auth error, so one revoked-token run emitted 20 severity=ERROR lines and paged prod-error-alerts four times under four fingerprints.

**Mechanism.** This alert's fingerprint is derived from the [getBlogsGraphQL] line (18:23:52.265049Z) rather than the [startImageGeneration] line (18:23:48.806605Z) that produced 4zzfhs, but both are the same single failure cascade. Every Shopify Admin call in that one generation 401'd for shop NMiT2Y1z9EjJkzICo4te: 6× handleUploadFile, 1× getBlogsGraphQL, 1× createBlog. handleUploadFile's catch logs unconditionally at ERROR (shopifyGraphQlService.js:212) and rethrows a flattened `new Error('File upload failed: ' + error.message)` (line 213), dropping got's error.response.statusCode so no caller upstack can run isShopifyAuthError; resolveImageResult (callModelNode.js:88) and startImageGeneration (callModelNode.js:168) each log ERROR again on the same failure → 3 ERROR lines × 6 images = 18, plus graphQLPosts.js:52 ([getBlogsGraphQL]) and genAIBlogService.js:107 ([createBlog]) = 20. api.js:151 defines isShopifyAuthError and tag.controller.js:128 is the one call site that applies the warn-not-error policy for this class. The logs on disk for this job are byte-identical to the 4zzfhs read: same 21 errors / 22 stderr entries, 0 requests, same timestamps to the microsecond.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:212` — logger.error on every upload failure with no isShopifyAuthError branch — source of the paging ERROR lines
- `packages/functions/src/services/shopifyGraphQlService.js:213` — rethrows a bare Error, dropping error.response.statusCode so upstack layers cannot classify the 401
- `packages/functions/src/services/shopifyGraphQlService.js:202` — createFile retries 3× on any error, including a non-retryable 401
- `packages/functions/src/helpers/graphql/graphQLPosts.js:52` — the exact line that emitted this alert's message, [getBlogsGraphQL] … Error fetching blogs, at ERROR
- `packages/functions/src/services/genAIBlogService.js:107` — [createBlog] logs the same 401 at ERROR 73ms later in the same run
- `packages/functions/src/langgraph/nodes/callModelNode.js:88` — second logger.error for the same upload failure
- `packages/functions/src/langgraph/nodes/callModelNode.js:168` — third logger.error for the same upload failure; 6 images → 18 ERROR lines
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError — the classifier none of the apiv2 call sites use
- `packages/functions/src/controllers/tag.controller.js:128` — the only call site handling this 401 class correctly — logger.warn, 24 occurrences, zero alerts

## Evidence
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-10-13T18:08:53Z" AND timestamp<="2026-10-13T18:38:53Z" AND "[getBlogsGraphQL]" AND "401 (Unauthorized)"`
- 20 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-10-13T18:08:53Z" AND timestamp<="2026-10-13T18:38:53Z" AND "401 (Unauthorized)"`
- 6 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-10-13T18:08:38Z" AND timestamp<="2026-10-13T18:38:38Z" AND "[handleUploadFile]" AND "401 (Unauthorized)"`
- 24 matching entries: `timestamp>="2026-10-11T00:00:00Z" AND timestamp<="2026-10-14T12:00:00Z" AND "401 (Unauthorized)" AND resource.labels.service_name="proxy" AND severity="WARNING"`

## Job
- analyze rounds: 1
- cost: $0.66

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
