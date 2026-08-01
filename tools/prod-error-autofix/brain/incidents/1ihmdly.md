fingerprint: 1ihmdly
service: dailyjobspublishergen2
message: Error: Can't send mail - all recipients were rejected: 501 Invalid command or cannot parse to address
app: SEO
repo: seo
date: 2026-08-01T00:13:52.014Z
status: mr_open
attempt: 1

# SEO · dailyjobspublishergen2 · 1ihmdly

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2096

**Root cause.** cleanEmailNotify never filters: its predicate `validateEmailFormat(email.trim()) ? email.trim() : emailShop` returns the truthy shop email for INVALID lines, so every raw, untrimmed line of a shop's 404-report recipient list is kept and passed verbatim as nodemailer's `to:`, and the SMTP server answers 501 on RCPT TO, which nodemailer surfaces as "all recipients were rejected" and fails the whole dailyJobsPublisherGen2 run.

**Mechanism.** Cloud Scheduler hits dailyJobsPublisherGen2 (cronFunctions.js:24, schedule '0 0 * * *') -> handleDailyJobs -> send404PageReport. For each 404-report notification it builds the recipient list with cleanEmailNotify(notification.email.list, shop.email) (send404PageReport.js:21). cleanEmailNotify is an Array.prototype.filter whose callback returns `email.trim()` when the regex passes and `emailShop` when it fails (validateEmailFormat.js:19) — both truthy whenever shop.email is set, so filter keeps EVERY element, and keeps the ORIGINAL untrimmed element, not the trimmed/substituted one. A list line carrying a stray '\r' (list is split on '\n' only), surrounding whitespace, or a plainly malformed address therefore survives; `.filter(i => i)` at :20 only drops the empty string. That string reaches `to: email` in transporter.sendMail (mailService.js:268). The SMTP server rejects it at RCPT TO with `501 Invalid command or cannot parse to address`; nodemailer throws `Can't send mail - all recipients were rejected`, the rejection propagates out of `await Promise.all(sendNotificationJobs)` (send404PageReport.js:29), which has no per-recipient guard, so the whole scheduled handler rejects and firebase-functions' scheduler wrapper logs it and answers 500 to Cloud Scheduler. It reproduces on 8 of 8 consecutive days at exactly one occurrence per run, which is stored bad list data, not a transient SMTP fault.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/utils/validateEmailFormat.js:19` — the defect: filter predicate returns emailShop (truthy) for invalid lines, so nothing is ever filtered out and the raw untrimmed element is kept
- `packages/functions/src/helpers/utils/validateEmailFormat.js:20` — only the empty string is dropped afterwards; a whitespace-only or '\r'-suffixed line survives
- `packages/functions/src/handlers/cron/send404PageReport.js:21` — the cron's only recipient-building call site — feeds notification.email.list into the broken cleaner
- `packages/functions/src/handlers/cron/send404PageReport.js:29` — unguarded Promise.all: one rejected sendMail fails the entire scheduled run
- `packages/functions/src/services/email/mailService.js:268` — transporter.sendMail({to: email}) — the unvalidated string is handed straight to SMTP; the only mail send reachable from handleDailyJobs
- `packages/functions/src/handlers/exports/cronFunctions.js:24` — dailyJobsPublisherGen2 = onSchedule('0 0 * * *') -> handleDailyJobs, the alerting service

## Evidence
- 8 matching entries: `resource.labels.service_name="dailyjobspublishergen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T01:00:00Z" AND textPayload:"all recipients were rejected"`
- 16 matching entries: `resource.labels.service_name="dailyjobspublishergen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T01:00:00Z" AND severity>=ERROR`
- 12 matching entries: `timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-01T01:00:00Z" AND textPayload:"notify404Report"`

## Job
- analyze rounds: 2
- cost: $5.31
- branch: `fix/prod-seo-1ihmdly`
- fix commit: `1bfd7b58b25ac7b75a1080a97c514e6d47fb93dc`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2096
- tests: 779 tests, 9 failing · baseline 9 failing · reproduce test fails without the fix

```
packages/functions/src/handlers/cron/send404PageReport.js   |  5 ++++-
 packages/functions/src/helpers/utils/validateEmailFormat.js | 11 ++++++++---
 2 files changed, 12 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
