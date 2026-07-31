fingerprint: 1rzr1j4
service: subscribesummarynewpublishedarticle
message: [subscribeHandleSummaryNewPublishedArticle] ZZ0HY8tpj3YOtiVSm3cV Shop not found or on FREE plan
app: BLOG
repo: blogs
date: 2026-07-30T14:01:43.976Z
status: inconclusive
attempt: 1

# BLOG · subscribesummarynewpublishedarticle · 1rzr1j4

**Outcome.** MR not opened: push_failed

**Root cause.** subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every article publish by a FREE-plan shop emits a severity=ERROR line and pages Slack; nothing in the function actually failed.

**Mechanism.** articleController.update publishes to topic 'summaryNewPublishedArticle' unconditionally whenever data.isPublished is true (packages/functions/src/controllers/articleController.js:569), with no plan gate — shop there was just loaded via getShopById(getCurrentShop(ctx)) at line 523, so the shop always exists. The subscriber then loads the same shop and hits the guard at packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:28; because the shop exists, the only way to enter it is shop.plan === FREE (FREE = 'free', packages/functions/src/config/subscription/plans.js:41). The guard calls logger.error and returns cleanly. logger emits a structured entry with severity ERROR in the Cloud Run runtime (packages/functions/src/helpers/logger.js), the prod-error-alerts sink filters severity>=ERROR, so a benign skip becomes an alert. No exception is thrown, the Pub/Sub message is acked, no request fails — the requests read (httpRequest.status>=500) is empty. The message also conflates 'not found' with 'FREE plan', so the alert text cannot tell an operator which case fired.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:28` — the guard `if (!shop || shop.plan === FREE)` — normal control flow, not an error path
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:29` — logger.error on that branch — the exact line that produced the alerted message, then `return` with no throw
- `packages/functions/src/controllers/articleController.js:569` — publishTopic('summaryNewPublishedArticle', ...) fires for every published article with no plan check — the source of the FREE-plan messages
- `packages/functions/src/controllers/articleController.js:523` — shop = await getShopById(getCurrentShop(ctx)) — proves the published shopId belongs to an existing shop, so the guard fires on the FREE-plan half, not the not-found half
- `packages/functions/src/config/subscription/plans.js:41` — export const FREE = 'free' — the value compared in the guard
- `packages/functions/src/helpers/logger.js:16` — logger emits `severity` in the Cloud Run runtime, which is why this line reaches the severity>=ERROR alert sink

## Evidence
- 17 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-29T12:00:00Z" AND timestamp<="2026-07-30T12:30:00Z" AND severity>=ERROR`
- 17 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-29T12:00:00Z" AND timestamp<="2026-07-30T12:30:00Z" AND jsonPayload.message:"Shop not found or on FREE plan"`
- 2 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-30T11:47:45.244Z" AND timestamp<="2026-07-30T12:17:45.244Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $3.23
- fix commit: `76508a93712d87c9c0c308c93d8932d7da389981`
- tests: 198 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/articleController.js        |  3 ++-
 .../pubsub/subscribeHandleSummaryNewPublishedArticle.js        | 10 +++++++---
 2 files changed, 9 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
