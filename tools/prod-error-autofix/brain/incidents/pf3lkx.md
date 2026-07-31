fingerprint: pf3lkx
service: reviewupdatesschedule
message: HTTP 500 POST /
app: BLOG
repo: blogs
date: 2026-07-31T12:57:53.297Z
status: deferred
attempt: 1

# BLOG · reviewupdatesschedule · pf3lkx

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** The Shopify App Store review-card markup no longer matches `.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)`, so `querySelector` returns null inside `getPageReviews`'s `page.evaluate` and `.outerText` throws a TypeError that aborts the whole scheduled run.

**Mechanism.** The stack frame is `pptr:evaluate;getPageReviews (/workspace/lib/services/puppeteer/getPageReviews.js:27:21):5:101`. Babel-compiling src/services/puppeteer/getPageReviews.js locally reproduces the deployed bundle exactly: lib line 27 is `return await page.evaluate(() => {`, and line 5 of that callback is lib line 31, the collapsed `const customer = reviewEle.querySelector('.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)').outerText.trim();` — `awk 'NR==31{print index($0,".outerText")}'` returns exactly 101, the reported column. So the null receiver is the customer-name querySelector, not the date/rating/content ones. `[data-merchant-review]` itself still matches (an empty NodeList would skip the forEach and return `[]` with no error), so the page loaded and the cards are there; only the inner class chain changed — these are Shopify's Tailwind build classes, not stable hooks. The TypeError propagates out of page.evaluate through crawlNewestReviews/crawlBadReviews to handleReviewUpdates's catch, which logs `[handleReviewUpdates]` and rethrows, so the firebase-functions v2 scheduler wrapper answers Cloud Scheduler a 500. This is a new cause behind the same fingerprint: the previous `Could not find Chrome` failure ran 14 times 2026-07-24→07-30T12:00 on revs 00072–00099 and stopped; every run since rev 00100 (07-31T00:01 and 07-31T12:01, 2 of 2, identical file:line:column) fails here instead — Chrome now launches and the scraper gets far enough to hit stale selectors.

Confidence: `high`

## Code
- `packages/functions/src/services/puppeteer/getPageReviews.js:25` — `.outerText` on the unguarded querySelector chain — the exact throw site, lib 31 col 101
- `packages/functions/src/services/puppeteer/getPageReviews.js:24` — selector `.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)` that returned null; Tailwind build classes, no null check on it or the three sibling extractions (lines 27, 29, 30)
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:289` — catch logs then rethrows, so one unparsable review card fails the entire scheduled run and returns 500
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:260` — crawlBadReviews loops pages until a page yields zero reviews; a throw on any page discards the already-crawled results too
- `packages/functions/src/functions/scheduled.js:21` — schedule '0 0,12 * * *' explains the exactly-two-failures-per-day cadence

## Evidence
- 2 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-24T00:00:00Z" AND textPayload:"outerText"`
- 14 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-24T00:00:00Z" AND textPayload:"Could not find Chrome"`
- 1 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-31T11:46:19.793Z" AND timestamp<="2026-07-31T12:16:19.793Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-31T11:46:19.793Z" AND timestamp<="2026-07-31T12:16:19.793Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $0.97

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
