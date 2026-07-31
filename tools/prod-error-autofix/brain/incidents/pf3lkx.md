fingerprint: pf3lkx
service: reviewupdatesschedule
message: HTTP 500 POST /
app: BLOG
repo: blogs
date: 2026-07-30T13:33:25.471Z
status: inconclusive
attempt: 1

# BLOG · reviewupdatesschedule · pf3lkx

**Outcome.** fix blocked at agent_failed

**Root cause.** reviewUpdatesSchedule fails on every scheduled run because Chrome is absent from the deployed function artifact, so puppeteer.launch() throws `Could not find Chrome (ver. 148.0.7778.97)` before any of the handler's error handling runs.

**Mechanism.** scheduled.js registers reviewUpdatesSchedule on `0 0,12 * * *`; handleReviewUpdates calls `puppeteer.launch()` as its first statement, outside the try/finally, so the throw propagates unchanged to the firebase-functions v2 scheduler wrapper (stack ends at `v2/providers/scheduler.js:72`, i.e. the framework logger, not the handler's own `logger.error('[handleReviewUpdates]')`) and Cloud Scheduler gets a 500. The 40.53s latency is cold start: `[redis.service] connected` is logged 39ms before the error, so the handler body did start. The cache path printed in the error moved from `/www-data-home/.cache/puppeteer` (rev 00096, runs on 07-29 and 07-30T00:00) to `/workspace/.cache/puppeteer` (rev 00099, run 07-30T12:00), which is exactly `join(__dirname,'.cache','puppeteer')` from .puppeteerrc.cjs — so the cache-relocation half of the earlier fix did deploy and is honoured, and the browser is still not there. The remaining gap is the download step: `gcp-build` is `node node_modules/puppeteer/install.mjs || echo 'WARN ...'`, which exits 0 whether or not Chrome was fetched, so a deploy with no Chrome in the artifact is indistinguishable from a good one. Cloud Build logs were not readable from here, so which of the two (install.mjs never run by the buildpack vs. run and failed) is unverified; that the artifact ships without Chrome is directly in the runtime log, 16 times out of 16.

Confidence: `high`

## Code
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:249` — puppeteer.launch() is the first statement and sits outside the try/finally, so the missing-Chrome error escapes as a raw 500 and neither logger.error('[handleReviewUpdates]') nor browser.close() runs
- `packages/functions/package.json:16` — gcp-build ends in `|| echo 'WARN puppeteer chrome install failed...'`, masking a failed or skipped Chrome download so the deploy succeeds with no browser in the artifact
- `packages/functions/.puppeteerrc.cjs:12` — cacheDirectory join(__dirname,'.cache','puppeteer') resolves to /workspace/.cache/puppeteer in prod — matches the path printed by rev 00099, proving the config is deployed and read, and that only the download is missing
- `packages/functions/src/functions/scheduled.js:19` — schedule '0 0,12 * * *' explains the exactly-two-failures-per-day cadence of the 16 occurrences

## Evidence
- 16 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-23T00:00:00Z" AND textPayload:"Could not find Chrome"`
- 3 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-29T00:00:00Z" AND textPayload:"/www-data-home/.cache/puppeteer"`
- 1 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-29T00:00:00Z" AND textPayload:"which is: /workspace/.cache/puppeteer"`
- 1 matching entries: `(resource.labels.service_name="reviewupdatesschedule") AND timestamp>="2026-07-30T11:45:47.812Z" AND timestamp<="2026-07-30T12:15:47.812Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.23

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
