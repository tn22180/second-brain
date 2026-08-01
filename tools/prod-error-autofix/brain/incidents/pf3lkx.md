fingerprint: pf3lkx
service: reviewupdatesschedule
message: HTTP 500 POST /
app: BLOG
repo: blogs
date: 2026-08-01T12:11:07.166Z
status: mr_open
attempt: 1

# BLOG · reviewupdatesschedule · pf3lkx

**Outcome.** duplicate of epfkly — MR https://gitlab.com/avada/blogs/-/merge_requests/814

**Root cause.** Shopify App Store review-card markup no longer matches the selector `.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)`, so that querySelector returns null inside getPageReviews' page.evaluate and `.outerText` throws a TypeError that aborts every scheduled reviewUpdatesSchedule run — the same unfixed defect as fingerprint pf3lkx attempt 1 (MR deferred by mr_per_repo_per_day, never merged).

**Mechanism.** Stack frame is `pptr:evaluate;getPageReviews (/workspace/lib/services/puppeteer/getPageReviews.js:27:21):5:101` — lib:27:21 is the `page.evaluate(` call (src line 19), and the `:5:101` is inside the babel-collapsed evaluate callback: line 1 `() => {`, 2 `const reviews = []`, 3 `const elements = document.querySelectorAll('[data-merchant-review]')`, 4 `elements.forEach(reviewEle => {`, 5 the customer extraction collapsed onto one line. On that line `const customer = reviewEle.querySelector('<50-char selector>').outerText.trim();` puts the `.outerText` access at column 95 + 6 spaces of babel indent = 101, matching the reported column exactly. The other three extractions are excluded: `querySelectorAll(...)[0]` (reviewDate) would report 'undefined' not 'null', and `.tw-relative` would report `reading 'ariaLabel'`. `[data-merchant-review]` itself still matches — an empty NodeList would skip the forEach and return `[]` silently — so the page loads and cards exist; only the inner Tailwind build classes changed. The TypeError propagates out of page.evaluate through crawlNewestReviews/crawlBadReviews to handleReviewUpdates' catch (src/handlers/cron/handleReviewUpdates.js:288-289), which logs `[handleReviewUpdates] Cannot read properties of null (reading 'outerText')` — the exact line in this window — then rethrows at :290, so the firebase-functions v2 scheduler wrapper answers Cloud Scheduler HTTP 500 (latency 27.36s). Failure rate is now 4 of 4 runs since 2026-07-31T00:01 (07-31T00:01, 07-31T12:01, 08-01T00:01, 08-01T12:00), identical file:line:column across four revisions (00100, 00106, 00107) — deploys do not clear it, and there is not one successful POST in that span. Cadence of exactly 2 failures/day matches schedule '0 0,12 * * *'.

Confidence: `high`

## Code
- `packages/functions/src/services/puppeteer/getPageReviews.js:25` — `.outerText` on the unguarded querySelector chain — the throw site, lib callback line 5 col 101
- `packages/functions/src/services/puppeteer/getPageReviews.js:24` — selector `.tw-order-2.tw-text-fg-tertiary > div:nth-child(1)` returned null; Tailwind build classes, no null guard here or on the three sibling extractions (lines 27, 29, 30)
- `packages/functions/src/services/puppeteer/getPageReviews.js:30` — `.tw-break-words` extraction is equally unguarded — next selector to break once line 24 is fixed
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:289` — catch logs `[handleReviewUpdates] Cannot read properties of null (reading 'outerText')` — the exact log line in this window
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:290` — rethrow turns one unparsable review card into a 500 for the entire scheduled run
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:260` — crawlBadReviews runs after crawlNewestReviews; a throw on any page discards already-crawled results too
- `packages/functions/src/functions/scheduled.js:21` — schedule '0 0,12 * * *' explains the exactly-two-failures-per-day cadence

## Evidence
- 4 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-31T00:00:00Z" AND textPayload:"outerText"`
- 4 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-31T00:00:00Z" AND httpRequest.requestMethod="POST"`
- 18 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-24T00:00:00Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-08-01T11:46:11.658Z" AND timestamp<="2026-08-01T12:16:11.658Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $0.76
- MR: https://gitlab.com/avada/blogs/-/merge_requests/814

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
