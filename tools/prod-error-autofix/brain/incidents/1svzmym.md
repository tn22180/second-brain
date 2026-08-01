fingerprint: 1svzmym
service: dailyjobspublishergen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-08-01T00:15:18.772Z
status: mr_open
attempt: 1

# SEO · dailyjobspublishergen2 · 1svzmym

**Outcome.** duplicate of 1ihmdly — MR https://gitlab.com/avada/seo/-/merge_requests/2096

**Root cause.** Duplicate of fingerprint 1ihmdly (MR https://gitlab.com/avada/seo/-/merge_requests/2096 open, unmerged): cleanEmailNotify never filters anything because its predicate `validateEmailFormat(email.trim()) ? email.trim() : emailShop` returns the truthy shop email for invalid lines, so a malformed 404-report recipient reaches nodemailer's `to:` verbatim, SMTP answers 501 at RCPT TO, and the unguarded Promise.all fails the whole dailyJobsPublisherGen2 run with a 500.

**Mechanism.** Cloud Scheduler POSTs / at 00:00:01.523Z (userAgent Google-Cloud-Scheduler, requests log, status 500, latency 60.639s — not a timeout, the function is declared timeoutSeconds: 540 at cronFunctions.js:25). handleDailyJobs -> send404PageReport builds each recipient list with cleanEmailNotify(notification?.email?.list, shop.email) (send404PageReport.js:21). cleanEmailNotify is an Array.prototype.filter whose callback returns `email.trim()` on a regex pass and `emailShop` on a fail (validateEmailFormat.js:19) — both truthy when shop.email is set, so filter keeps EVERY element, and keeps the ORIGINAL untrimmed element rather than the trimmed one; `.filter(i => i)` at :20 only drops the empty string. That raw string is handed to notify404Report and straight into transporter.sendMail({to: email}) (mailService.js:268). The SMTP server rejects it at RCPT TO with `501 Invalid command or cannot parse to address`; nodemailer throws `Can't send mail - all recipients were rejected`, which propagates out of the unguarded `await Promise.all(sendNotificationJobs)` (send404PageReport.js:29). firebase-functions' v2 scheduler wrapper (httpFunc, scheduler.js:72 in the stack) logs it at 00:01:03.105Z and answers 500. The four `[mailService:notify404Report] No data to send 404 report, skip <shopID>` lines at 00:01:01–02 are the normal empty-report branch (mailService.js:247) from the same execution_id 9lvnwuwgdcnj — they are not the failure.

Confidence: `high`

## Code
- `packages/functions/src/helpers/utils/validateEmailFormat.js:19` — the defect: filter predicate returns emailShop (truthy) for invalid lines, so nothing is filtered and the raw untrimmed element survives
- `packages/functions/src/helpers/utils/validateEmailFormat.js:20` — only the empty string is dropped afterwards; a '\r'-suffixed or whitespace-padded or plainly malformed line still gets through
- `packages/functions/src/handlers/cron/send404PageReport.js:21` — the cron's only recipient-building call site — feeds notification.email.list into the broken cleaner
- `packages/functions/src/handlers/cron/send404PageReport.js:29` — unguarded Promise.all: one rejected sendMail fails the entire scheduled run
- `packages/functions/src/services/email/mailService.js:268` — transporter.sendMail({to: email}) — the unvalidated string goes straight to SMTP; the only mail send reachable from handleDailyJobs
- `packages/functions/src/services/email/mailService.js:247` — the 'No data to send 404 report, skip' line seen in stderr — normal skip branch, not the failure
- `packages/functions/src/handlers/exports/cronFunctions.js:24` — dailyJobsPublisherGen2 = onSchedule('0 0 * * *') -> handleDailyJobs; timeoutSeconds 540 rules out the 60.6s latency being a timeout

## Evidence
- 8 matching entries: `resource.labels.service_name="dailyjobspublishergen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T01:00:00Z" AND textPayload:"all recipients were rejected"`
- 2 matching entries: `(resource.labels.service_name="dailyjobspublishergen2" OR resource.labels.function_name="dailyjobspublishergen2") AND timestamp>="2026-07-31T23:46:04.172Z" AND timestamp<="2026-08-01T00:16:04.172Z" AND severity>=ERROR`
- 4 matching entries: `resource.labels.service_name="dailyjobspublishergen2" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-01T01:00:00Z" AND textPayload:"notify404Report"`

## Job
- analyze rounds: 1
- cost: $1.05
- MR: https://gitlab.com/avada/seo/-/merge_requests/2096

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
