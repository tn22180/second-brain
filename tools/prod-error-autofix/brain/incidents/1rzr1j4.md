fingerprint: 1rzr1j4
service: subscribesummarynewpublishedarticle
message: [subscribeHandleSummaryNewPublishedArticle] TaHZqDutXj9ZUUOuwJso Shop not found or on FREE plan
app: BLOG
repo: blogs
date: 2026-07-31T03:37:30.021Z
status: mr_open
attempt: 1

# BLOG · subscribesummarynewpublishedarticle · 1rzr1j4

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/790

**Root cause.** subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every article publish by a FREE-plan shop emits severity=ERROR and pages Slack even though nothing failed.

**Mechanism.** articleController.update publishes to topic 'summaryNewPublishedArticle' unconditionally whenever data.isPublished is true (packages/functions/src/controllers/articleController.js:569), with no plan gate; shop there was loaded via getShopById(getCurrentShop(ctx)) at line 523, so the shopId published always belongs to an existing shop. The subscriber reloads the same shop and hits the guard `if (!shop || shop.plan === FREE)` at packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:28; since the shop exists, only the FREE half can fire (FREE = 'free', packages/functions/src/config/subscription/plans.js:41). The guard calls logger.error at line 29 and returns cleanly — no throw, message acked, no request fails, which is why the requests read (httpRequest.status>=500) is empty. logger.formatEntry emits `{severity: 'ERROR', ...}` in the Cloud Run runtime (packages/functions/src/helpers/logger.js:61) and the prod-error-alerts sink filters severity>=ERROR, so a benign skip becomes an alert. Over the 24h window 2026-07-30T03:30Z→2026-07-31T03:30Z this message is 31 of 37 severity>=ERROR entries on the service, spread over ~20 distinct shopIds (Ek2Vc1WNepVP6HBXxLMx 7×) — consistent with individual publish events, not one batch. The message also conflates 'not found' with 'FREE plan', so an operator cannot tell which case fired. SECOND, DISTINCT CAUSE in the same service, not the alerted one: the remaining 6 entries are 'savePromises is not defined' — packages/functions/src/helpers/processLocaleSummary.js:133/140 push to and await a `savePromises` array that is never declared in generateAndSaveLocaleSummary, so every paid-plan summary run throws ReferenceError after the summary is saved, silently skipping increaseCount. It has its own message and needs its own fix.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:28` — the guard `if (!shop || shop.plan === FREE)` — normal control flow, not an error path
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:29` — logger.error on that branch — the exact line producing the alerted message, then `return` with no throw
- `packages/functions/src/controllers/articleController.js:569` — publishTopic('summaryNewPublishedArticle', ...) fires for every published article with no plan check — source of the FREE-plan messages
- `packages/functions/src/controllers/articleController.js:523` — shop = await getShopById(getCurrentShop(ctx)) — proves the published shopId belongs to an existing shop, so the guard fires on the FREE-plan half
- `packages/functions/src/config/subscription/plans.js:41` — export const FREE = 'free' — the value compared in the guard
- `packages/functions/src/helpers/logger.js:61` — formatEntry emits `severity` in the Cloud Run runtime, which is why this line reaches the severity>=ERROR alert sink
- `packages/functions/src/helpers/processLocaleSummary.js:140` — await Promise.all(savePromises) with savePromises never declared — the separate 6-entry ReferenceError in the same service

## Evidence
- 31 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-30T03:30:00Z" AND timestamp<="2026-07-31T03:30:00Z" AND jsonPayload.message:"Shop not found or on FREE plan"`
- 37 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-30T03:30:00Z" AND timestamp<="2026-07-31T03:30:00Z" AND severity>=ERROR`
- 6 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-30T03:30:00Z" AND timestamp<="2026-07-31T03:30:00Z" AND jsonPayload.message:"savePromises"`
- 2 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-07-31T02:54:52.822Z" AND timestamp<="2026-07-31T03:24:52.822Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.75
- branch: `fix/prod-blog-1rzr1j4`
- fix commit: `a1bc64892323197548d685cace01fca3918ae8ee`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/790
- tests: 197 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/articleController.js     |  3 ++-
 .../pubsub/subscribeHandleSummaryNewPublishedArticle.js     | 13 +++++++++++--
 2 files changed, 13 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
