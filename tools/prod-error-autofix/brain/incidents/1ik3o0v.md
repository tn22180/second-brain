fingerprint: 1ik3o0v
service: subscribesummarynewpublishedarticle
message: [subscribeHandleSummaryNewPublishedArticle] IAD6Ij8qq3S7TQx2lQpA savePromises is not defined
app: BLOG
repo: blogs
date: 2026-08-04T04:51:55.104Z
status: mr_open
attempt: 2

# BLOG · subscribesummarynewpublishedarticle · 1ik3o0v

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/834

**Root cause.** generateAndSaveLocaleSummary references an undeclared variable `savePromises`, so every call throws ReferenceError: savePromises is not defined at `await Promise.all(savePromises)` — after the summary has already been written to Shopify.

**Mechanism.** packages/functions/src/helpers/processLocaleSummary.js declares no `savePromises` binding anywhere in the module (only uses at lines 133 and 140). Line 140 is unconditional, so 100% of calls that reach it throw ReferenceError in strict-mode babel output. subscribeHandleSummaryNewPublishedArticle calls it at line 109 and its catch at line 119 logs `logger.error('[subscribeHandleSummaryNewPublishedArticle]', shopId, e.message)` — which is byte-for-byte the alert text `[subscribeHandleSummaryNewPublishedArticle] IAD6Ij8qq3S7TQx2lQpA savePromises is not defined`. The throw happens after `updateArticleSummaryData(BATCH_UPDATE)` at line 116 has already persisted the summary, so the AI spend and the Shopify write both succeed and then the Pub/Sub message is nacked and redelivered, regenerating the same summary. `increaseCount` in the isCount branch never runs. The same defect hits the second caller, articleController.js:1130, on the `api` service — 2 of the 10 logged occurrences carry service_name=api. Introduced 2026-07-24 in d544290d5 (git blame lines 132-140).

Confidence: `high`

## Code
- `packages/functions/src/helpers/processLocaleSummary.js:140` — `await Promise.all(savePromises)` — unconditional, savePromises is never declared or imported in this module; this is the throw site
- `packages/functions/src/helpers/processLocaleSummary.js:133` — `savePromises.push(...)` in the isCount branch — the only other use, also undeclared; throws first when isCount is true
- `packages/functions/src/helpers/processLocaleSummary.js:116` — updateArticleSummaryData BATCH_UPDATE already committed the summary before the throw, so the failure is post-write: retries duplicate AI cost
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:109` — call site that reaches the throw
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:119` — catch that emits exactly `[subscribeHandleSummaryNewPublishedArticle] <shopId> <e.message>` — matches the alert string
- `packages/functions/src/controllers/articleController.js:1130` — second caller of the same function, explains the 2 occurrences logged under service api

## Evidence
- 10 matching entries: `jsonPayload.message:"savePromises is not defined" AND timestamp>="2026-07-24T00:00:00Z"`
- 1 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle" OR resource.labels.function_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-08-04T04:27:36.475Z" AND timestamp<="2026-08-04T04:57:36.475Z" AND severity>=ERROR`
- 2 matching entries: `resource.labels.service_name="subscribesummarynewpublishedarticle" AND timestamp>="2026-08-04T04:27:36.475Z" AND timestamp<="2026-08-04T04:57:36.475Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.69
- branch: `fix/prod-blog-1ik3o0v-a2`
- fix commit: `cb1b7e38d1da1d68cb0a6bfe63aa910c61d7ef42`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/834
- tests: 280 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/processLocaleSummary.js | 11 ++++-------
 1 file changed, 4 insertions(+), 7 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
