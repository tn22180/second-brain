fingerprint: 1dew7rz
service: api
message: [getList] JAHTITCoMn5GID14g3Jn Error listing related keywords Error: Unknown pageToken x
app: BLOG
repo: blogs
date: 2026-09-18T11:01:20.712Z
status: fix_disabled
attempt: 1

# BLOG · api · 1dew7rz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1fxldhb: no request failed. A Python-urllib smoke test of the newly shipped GET /api/related-keywords sent the made-up cursor pageToken=x. listRelatedKeywordsByShop rejected it on purpose, and getList logged that rejection at logger.error (severity=ERROR) while still answering HTTP 200 {success:false}. This alert is the second, [getList] copy of the same event.

**Mechanism.** At 10:54:35–10:55:04Z, 17 GET requests with UA Python-urllib/3.13 probed the new related-keywords endpoint (commits c07dccf0b/b96089407). The request at 10:55:03Z used `?limit=2&pageToken=x`. In listRelatedKeywordsByShop, collection.doc('x').get() returned a snapshot that does not exist, so the function threw `Unknown pageToken x`. This is intentional: the repo test 'refuses an unknown pageToken instead of silently restarting from page one' covers it. The repository catch logged `[listRelatedKeywordsByShop]` at logger.error (10:55:03.356173Z) and rethrew. The controller getList then logged `[getList] … Error listing related keywords` at logger.error (10:55:03.356400Z), which is the alerted line, and set ctx.body={success:false,error} with the default 200. The BLOG logger emits severity, so both lines became ERROR. They are the only 2 ERROR entries in the window. The requests read is 0 because the status was 200. The defect is classification: a bad cursor sent by the client is logged twice as a server error and is not rejected with a 400.

Confidence: `high`

## Code
- `packages/functions/src/repositories/relatedKeywordsRepository.js:99` — Throws `Unknown pageToken ${pageToken}` when the cursor doc does not exist. That is bad caller input, not a server fault.
- `packages/functions/src/repositories/relatedKeywordsRepository.js:114` — The repository catch logs the rejection at logger.error. This is the first of the 2 ERROR lines.
- `packages/functions/src/controllers/relatedKeywordController.js:99` — getList passes the raw ctx.query.pageToken through to the repository without checking it.
- `packages/functions/src/controllers/relatedKeywordController.js:105` — The `[getList]` logger.error, i.e. the alerted line. It still answers 200 {success:false}, not a 400.

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND severity>=ERROR AND jsonPayload.message:"Unknown pageToken" AND timestamp>="2026-09-18T10:40:16.285Z" AND timestamp<="2026-09-18T11:10:16.285Z"`
- 1 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"pageToken=x" AND timestamp>="2026-09-18T10:54:00Z" AND timestamp<="2026-09-18T10:56:30Z"`
- 17 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"related" AND httpRequest.userAgent:"Python-urllib" AND timestamp>="2026-09-18T10:54:00Z" AND timestamp<="2026-09-18T10:56:30Z"`

## Job
- analyze rounds: 1
- cost: $1.03

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
