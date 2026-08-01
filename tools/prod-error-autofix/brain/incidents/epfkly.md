fingerprint: epfkly
service: reviewupdatesschedule
message: [handleReviewUpdates] Cannot read properties of null (reading 'outerText')
app: BLOG
repo: blogs
date: 2026-08-01T12:09:21.331Z
status: mr_open
attempt: 1

# BLOG · reviewupdatesschedule · epfkly

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/814

**Root cause.** Every run of reviewUpdatesSchedule since Chrome was restored on the container (2026-07-31) dies in getPageReviews because `reviewEle.querySelector('.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)')` returns null for at least one Shopify App Store review card and `.outerText` is read on that null with no guard, aborting the whole crawl inside `elements.forEach`.

**Mechanism.** Cloud Scheduler POSTs the function at 00:00 and 12:00 UTC (packages/functions/src/functions/scheduled.js:21, schedule '0 0,12 * * *'). The 2026-08-01T12:00 run logged `[redis.service] connected` at 12:00:43 — so puppeteer.launch and page nav succeeded — then threw at 12:00:52.448 with tag `[handleReviewUpdates]`. handleReviewUpdates calls crawlNewestReviews (handleReviewUpdates.js:259 → 299) and crawlBadReviews (handleReviewUpdates.js:260 → 316), both of which call getPageReviews. The prod frame `pptr:evaluate;getPageReviews (/workspace/lib/services/puppeteer/getPageReviews.js:27:21):5:101` names the second page.evaluate (getPageReviews.js:19 in src; lib line 27 after babel) and puts the throw at line 5, column 101 of the evaluated function source. Babel collapses the three-line chain at src lines 23-25 onto one line at indent 6, making its line 5 `      const customer = reviewEle.querySelector('.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)').outerText.trim();` — 6 indent + 17 (`const customer = `) + 24 (`reviewEle.querySelector(`) + 52 (quoted 50-char selector) puts the `.` of `.outerText` at column 101. It is the only `.outerText` on that emitted line; reviewDate's is on line 6, reviewContent's on line 8, and the line-6 `querySelectorAll(...)[0]` would report 'outerText' of **undefined**, not null. So the null is the customer-name querySelector — the App Store card markup no longer matches that selector. The TypeError propagates out of page.evaluate into handleReviewUpdates' catch, which logs at handleReviewUpdates.js:289 and rethrows at :290; firebase-functions v2 scheduler turns the rejection into the 500 POST / at 12:00:24.709 with latency 27.355s. Because the throw is inside `elements.forEach` (getPageReviews.js:22), one bad card kills extraction of every remaining card on that page and every remaining page — zero reviews ingested, so the bad-review/Crisp pipeline downstream gets nothing.

Confidence: `high`

## Code
- `packages/functions/src/services/puppeteer/getPageReviews.js:24` — the selector '.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)' that returns null on the current App Store review card markup
- `packages/functions/src/services/puppeteer/getPageReviews.js:25` — unguarded .outerText on that null — the throw site at line 5 col 101 of the babel-emitted evaluated source
- `packages/functions/src/services/puppeteer/getPageReviews.js:22` — elements.forEach — one failing card aborts extraction of every remaining card and page
- `packages/functions/src/services/puppeteer/getPageReviews.js:19` — the page.evaluate whose evaluated source the pptr frame line/column are relative to
- `packages/functions/src/services/puppeteer/getPageReviews.js:29` — same unguarded pattern on .tw-relative/.ariaLabel — next throw once line 25 is guarded
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:289` — logger.error('[handleReviewUpdates]', error.message) — produces the alert text
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:290` — rethrow converts the extraction TypeError into the scheduler 500
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:299` — crawlNewestReviews → getPageReviews, first call path reached
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:316` — crawlBadReviews → getPageReviews, second call path; same unguarded extractor
- `packages/functions/src/functions/scheduled.js:21` — schedule '0 0,12 * * *' — explains exactly 2 failures per day at 00:00 and 12:00 UTC

## Evidence
- 4 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-30T00:00:00Z" AND severity>=ERROR AND textPayload:"outerText"`
- 6 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-30T00:00:00Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-08-01T11:46:11.651Z" AND timestamp<="2026-08-01T12:16:11.651Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-08-01T11:46:11.651Z" AND timestamp<="2026-08-01T12:16:11.651Z" AND logName:"stderr"`
- 42 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-10T00:00:00Z" AND timestamp<="2026-07-31T00:00:00Z" AND severity>=ERROR AND textPayload:"Could not find Chrome"`

## Job
- analyze rounds: 1
- cost: $2.88
- branch: `fix/prod-blog-epfkly`
- fix commit: `e684bacf251e16f4d6e987811302e47fe8e4bf68`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/814
- tests: 255 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../src/services/puppeteer/getPageReviews.js       | 74 +++++++++++++++-------
 1 file changed, 52 insertions(+), 22 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
