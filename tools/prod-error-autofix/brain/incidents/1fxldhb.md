fingerprint: 1fxldhb
service: api
message: [listRelatedKeywordsByShop] JAHTITCoMn5GID14g3Jn Error listing related keywords: Error: Unknown pageToken x
app: BLOG
repo: blogs
date: 2026-09-18T11:00:44.448Z
status: fix_disabled
attempt: 1

# BLOG · api · 1fxldhb

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** No request failed. A Python-urllib smoke test of the newly shipped GET /api/related-keywords sent the made-up cursor `pageToken=x`. listRelatedKeywordsByShop rejects unknown cursors by design, but it logs that rejection with logger.error, and getList logs it again. Invalid caller input therefore pages as two severity=ERROR entries while the client gets a normal 200 {success:false}.

**Mechanism.** At 10:54:35–10:55:04Z, 17 GET requests from UA `Python-urllib/3.13` probed the new endpoint (commits c07dccf0b/b96089407). Seven of them first guessed wrong paths and got 404s: /api/keywords/related, /api/relatedKeywords, and others. The rest hit /api/related-keywords with limit=1, limit=2, articleId=999999, and at 10:55:03.299Z with `?limit=2&pageToken=x`. That last request returned HTTP 200 in 0.056s. In relatedKeywordsRepository.listRelatedKeywordsByShop, `collection.doc('x').get()` returned a snapshot that does not exist, so the function threw `Unknown pageToken x`. That guard exists on purpose, so a stale cursor does not quietly restart from page one; the repo test 'refuses an unknown pageToken' covers it. The repository's own catch then calls logger.error('[listRelatedKeywordsByShop]', …) and rethrows. The controller getList catch calls logger.error('[getList]', …) and answers ctx.body={success:false,error:e.message} with the default 200. The BLOG logger emits severity, so both lines land at ERROR. They are 0.2ms apart (10:55:03.356173Z / .356400Z), and they are the only 2 ERROR entries in the window. The requests read is 0 because the status was 200. The defect is severity classification: a client-supplied bad cursor is logged as a server error and is not answered with a 400.

Confidence: `high`

## Code
- `packages/functions/src/repositories/relatedKeywordsRepository.js:99` — Throws `Unknown pageToken ${pageToken}` when the cursor doc does not exist, which is caller input and not a server fault
- `packages/functions/src/repositories/relatedKeywordsRepository.js:114` — Catch logs the rejection at logger.error. This is the alerted `[listRelatedKeywordsByShop]` line
- `packages/functions/src/controllers/relatedKeywordController.js:97` — getList passes raw ctx.query.pageToken through to the repository without validation
- `packages/functions/src/controllers/relatedKeywordController.js:105` — Second logger.error `[getList]` for the same rejection. It answers 200 {success:false}, not 400

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND severity>=ERROR AND jsonPayload.message:"Unknown pageToken" AND timestamp>="2026-09-18T10:40:16.057Z" AND timestamp<="2026-09-18T11:10:16.057Z"`
- 1 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"pageToken=x" AND timestamp>="2026-09-18T10:54:00Z" AND timestamp<="2026-09-18T10:56:30Z"`
- 17 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"related" AND httpRequest.userAgent:"Python-urllib" AND timestamp>="2026-09-18T10:54:00Z" AND timestamp<="2026-09-18T10:56:30Z"`

## Job
- analyze rounds: 1
- cost: $1.25

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
