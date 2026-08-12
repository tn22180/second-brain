fingerprint: u2coqc
service: reviewupdatesschedule
message: Error: Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!
app: BLOG
repo: blogs
date: 2026-08-12T08:19:13.543Z
status: mr_open
attempt: 1

# BLOG · reviewupdatesschedule · u2coqc

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/861

**Root cause.** reviewUpdatesSchedule calls puppeteer.launch() with no args, no explicit timeout and no retry, so when Chrome fails to print its DevTools WS endpoint within puppeteer's default 30 s the whole scheduled run throws — and the function is dead code in master (its onSchedule export was deleted on 2026-08-05) that was never undeployed, so revision reviewupdatesschedule-00115-rix keeps firing twice a day and failing.

**Mechanism.** Cloud Scheduler POSTs the stale revision at 00:00 and 12:00 UTC (deployed config: memory 2GiB, cpu 1, timeoutSeconds 540, maxInstances 1). On 2026-08-06 the instance started at 00:00:05.44Z and bound :8080 at 00:00:43.60Z (38.2 s cold start); handleReviewUpdates immediately hits `const browser = await puppeteer.launch({headless: 'new'})` (packages/functions/src/handlers/cron/handleReviewUpdates.js:249) and the error lands at 00:01:13.67Z — 30.08 s later, exactly puppeteer's default launch timeout. Same shape on 2026-08-10T12:00 (probe at 12:02:07.72Z after an 84.7 s cold start, error at 12:02:37.83Z, +30.1 s). Chrome emitted no stderr of its own in either run, so it spawned and simply never published the WS URL inside 30 s; the launch call passes no `timeout`, no `--no-sandbox/--disable-dev-shm-usage/--disable-gpu`, and has no retry, so a single slow Chrome start fails the whole cron. Cold-start length only partly explains it: the 84.7 s run is the worst in the set, but 08-06's 38.2 s ranks ~9th of 25 and four runs with 45–60 s cold starts launched Chrome fine — so the 30 s stall is a resource-side flake that the code gives no margin for. Separately, commit 793665ccf (2026-08-05 10:40 +0700, 'remove updateReviewHandle') removed the `reviewUpdatesSchedule` onSchedule export from packages/functions/src/functions/scheduled.js, but selective/partial deploys never delete removed functions, so the old service and its scheduler job are still live.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:249` — puppeteer.launch({headless:'new'}) — no launch args, no explicit timeout (defaults to 30000 ms), no retry; this is the call that threw
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:288` — catch logs error.message then rethrows, so the scheduler run 500s on a single launch flake
- `packages/functions/src/functions/scheduled.js:7` — file now exports only syncSubscribeActiveCharge / cleanupExportFiles / dailyJobsSyncCrispOneStarShops — reviewUpdatesSchedule is gone from source yet still deployed as revision 00115-rix
- `packages/functions/.puppeteerrc.cjs:12` — cacheDirectory pin that made Chrome present in the artifact — explains why the 12 earlier 'Could not find Chrome' failures stopped and launch now gets far enough to time out instead
- `packages/functions/src/services/puppeteer/getPageReviews.js:27` — the other, more frequent failure mode behind this same service (23 of 25 runs) — selector returns null, already covered by open MR 814; not the cause of this alert

## Evidence
- 2 matching entries: `resource.labels.service_name="reviewupdatesschedule" AND timestamp>="2026-07-31T00:00:00Z" AND textPayload:"Timed out after 30000 ms"`
- 23 matching entries: `resource.labels.service_name="reviewupdatesschedule" AND timestamp>="2026-07-31T00:00:00Z" AND textPayload:"outerText"`
- 37 matching entries: `resource.labels.service_name="reviewupdatesschedule" AND timestamp>="2026-07-25T00:00:00Z" AND httpRequest.status>=500`
- 4 matching entries: `resource.labels.service_name="reviewupdatesschedule" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-06T00:02:00Z"`
- 25 matching entries: `resource.labels.service_name="reviewupdatesschedule" AND timestamp>="2026-07-31T00:00:00Z" AND textPayload:"STARTUP TCP probe"`

## Job
- analyze rounds: 1
- cost: $3.01
- branch: `fix/prod-blog-u2coqc`
- fix commit: `3eb9e43dad05a11d75fb709d621524a7f1d8349e`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/861
- tests: 360 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/handlers/cron/handleReviewUpdates.js       | 25 +++++++++++++++++++---
 1 file changed, 22 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
