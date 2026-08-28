fingerprint: 119yvyj
service: api
message: [update] sdM2qurElZCYXAFSi7o1 articleId: 998902595779 version skipped: previous content unavailable
app: BLOG
repo: blogs
date: 2026-08-28T05:59:45.589Z
status: fix_disabled
attempt: 1

# BLOG · api · 119yvyj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A single transport-level GCS read failure ('socket hang up') on the article-content blob made getContent return null with no retry, so hydrate flagged the previous version contentUnavailable and articleController.update took its guard branch — skipping the version save and logging it at logger.error (severity=ERROR), which is what fired the alert; the HTTP request itself succeeded.

**Mechanism.** At 05:50:50.773357Z getContent logged '[getContent] articles/sdM2qurElZCYXAFSi7o1/998902595779/en/H5JQ1FvQpEiOHa9nNIsq.br request to https://storage.googleapis.com/.../o/...?alt=media failed, reason: socket hang up'. That message is the catch at articleContent.service.js:106, reached because the single `await getFile(blobPath).download()` at line 103 rejected — there is no retry loop in getContent and `new Storage()` at line 71 is constructed with no retryOptions. The catch returns null, so hydrate (line 133) returns `{...doc, contentUnavailable: true}`. That hydrated doc is `prevVersion`, fetched via getLastVersion inside the Promise.all at articleController.js:621. 912 ms later, at 05:50:51.685119Z, the guard at articleController.js:685 saw `prevVersion.contentUnavailable`, logged '[update] sdM2qurElZCYXAFSi7o1 articleId: 998902595779 version skipped: previous content unavailable' at logger.error (line 688) and skipped createArticle, then still answered `{success: true, data: preparedData}` at line 709. requests read = 0 entries with httpRequest.status>=500, confirming no 5xx: the merchant got a 200 and silently lost one version-history entry. The error is transport-level, not a 404 — a deleted object returns 'No such object' from the JSON API, not a socket hang up.

Confidence: `high`

## Code
- `packages/functions/src/services/articleContent.service.js:103` — single `await getFile(blobPath).download()` — one attempt, no retry wrapper, so a transient socket reset is terminal
- `packages/functions/src/services/articleContent.service.js:106` — the catch that emitted the '[getContent] ... socket hang up' line at 05:50:50.773357Z, then returns null
- `packages/functions/src/services/articleContent.service.js:71` — `const storage = new Storage()` — no retryOptions configured for the download path
- `packages/functions/src/services/articleContent.service.js:133` — hydrate converts the null read into `contentUnavailable: true` on the version doc
- `packages/functions/src/controllers/articleController.js:621` — getLastVersion inside the Promise.all supplies the hydrated `prevVersion` that carries the flag
- `packages/functions/src/controllers/articleController.js:685` — `if (prevVersion?.contentUnavailable)` — the guard branch that fired
- `packages/functions/src/controllers/articleController.js:688` — logger.error emitting the exact alerted message at severity=ERROR for a handled, non-fatal skip
- `packages/functions/src/controllers/articleController.js:709` — the request still returns `{success: true}` — merchant is never told the version was skipped

## Evidence
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-28T05:36:05.868Z" AND timestamp<="2026-08-28T06:06:05.868Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-21T00:00:00Z" AND jsonPayload.tag="[getContent]"`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-21T00:00:00Z" AND jsonPayload.message:"version skipped: previous content unavailable"`
- 48 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-28T05:36:05.868Z" AND timestamp<="2026-08-28T06:06:05.868Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.87

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
