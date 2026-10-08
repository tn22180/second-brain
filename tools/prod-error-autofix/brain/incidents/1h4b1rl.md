fingerprint: 1h4b1rl
service: api
message: [createArticle] nrkjbmKkyf9JkdTeYH74 Service Unavailable
app: BLOG
repo: blogs
date: 2026-10-08T12:18:20.236Z
status: fix_disabled
attempt: 1

# BLOG · api · 1h4b1rl

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The single non-resumable `file.save()` in putContent has no retry and no ifGenerationMatch precondition, so one transient GCS 503 ("Service Unavailable") aborts the article-version blob upload; createArticle swallows it, logs `[createArticle] <shopId> Service Unavailable`, returns null, and PUT /api/article/610725691733 still answers 200 {success: true} with savedVersionId: null.

**Mechanism.** articleController.update reaches the version-save branch and calls createArticle (articleController.js:719). createArticle runs blob-first: putContent (articleRepository.js:39) → getFile(blobPath).save(buffer, {resumable: false}) (articleContent.service.js:85). Storage is constructed bare (articleContent.service.js:71), so @google-cloud/storage ^6.9.5 runs its default idempotencyStrategy RetryConditionally — a simple upload with no ifGenerationMatch is treated as conditionally idempotent and is NOT retried. GCS answered 503 with a non-JSON body, so the ApiError carries the bare reason phrase "Service Unavailable" (a Firestore/grpc failure would read "14 UNAVAILABLE: ...", not this), the catch at articleRepository.js:43 logs exactly the alert string and returns null, and update falls through to `ctx.body = {success: true, data: preparedData, savedVersionId}` (articleController.js:732) — merchant sees a success toast, the version row is gone. Timing ties them 1:1: PUT at 12:12:53.195 +31.679s ends 12:13:24.874 vs error at 12:13:24.885 (11 ms); PUT at 12:13:28.760 +31.522s ends 12:14:00.282 vs error at 12:14:00.283 (1 ms); PUT at 12:15:39.590 +31.434s ends 12:16:11.024 vs error at 12:16:11.025 (1 ms).

Confidence: `medium`

## Code
- `packages/functions/src/services/articleContent.service.js:85` — the one-shot `save(..., {resumable: false})` with no ifGenerationMatch and no retryOptions — the call that 503'd
- `packages/functions/src/services/articleContent.service.js:71` — `new Storage()` with no retryOptions, so idempotencyStrategy stays RetryConditionally and uploads without preconditions are not retried
- `packages/functions/src/repositories/articleRepository.js:39` — await putContent inside createArticle's try — the only awaited GCS call under the `[createArticle]` tag
- `packages/functions/src/repositories/articleRepository.js:43` — emits literally `[createArticle] <shopId> <e.message>`, i.e. the alert text; then returns null, hiding the failure from the caller
- `packages/functions/src/controllers/articleController.js:719` — the caller: update's version-save branch, reached from PUT /api/article/:id
- `packages/functions/src/controllers/articleController.js:732` — returns success: true with savedVersionId: null — the lost version is never surfaced to the admin UI

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-08T11:58:53Z" AND timestamp<="2026-10-08T12:28:53Z" AND jsonPayload.tag="[createArticle]"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apiv2" OR resource.labels.service_name="apisa") AND timestamp>="2026-10-01T00:00:00Z" AND jsonPayload.message:"Service Unavailable"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-08T12:12:30Z" AND timestamp<="2026-10-08T12:20:00Z" AND httpRequest.requestMethod="PUT"`
- 0 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-08T11:58:53Z" AND timestamp<="2026-10-08T12:28:53Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
