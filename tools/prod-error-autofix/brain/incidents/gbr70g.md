fingerprint: gbr70g
service: apisagen2
message: 'Memory limit of 2048 MiB exceeded with 2054 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-12T16:35:14.878Z
status: infra
attempt: 1

# SEO · apisagen2 · gbr70g

**Outcome.** infra class — reported, no MR

**Root cause.** apiSaGen2 is declared memory:'2GiB' with concurrency:10 while every GET /apiSa/scanFeatureWorking/pageSpeed launches its own full headless Chrome that keeps running after the handler's 60s Promise.race abandons it, so a client polling one hung storefront every ~60s stacked 2-3 live Chrome processes per instance and two of them crossed 2048 MiB.

**Mechanism.** scanFeaturePageSpeedWorking races getPageContent against a 60s reject (featureCheckService.js:68,71). Promise.race does not cancel the loser: getFullPageContent is still awaiting getPage, whose page.goto carries its own timeout:120000 (getPageContent.js:357), and browser.close() only runs in the finally at getPageContent.js:142 once that settles. So the Chrome launched at getPageContent.js:327 stays resident for up to ~120s while the HTTP request already returned at 60s. In the window 13 GET /apiSa/scanFeatureWorking/pageSpeed arrived, all from referer https://seo.apps.avada.io/performance/speed-up/settings, and 12 of them returned 200 at 60.03-61.14s latency — i.e. 12/12 completed scans hit the 60s race, matched 1:1 by 12 stderr lines '[scanFeatureWorking] undefined [scanFeaturePageSpeedWorking] scan timed out' (the catch at seoController.js:1600 answers 200 with success:false, which is why the alert only shows the 2 real 500s). Requests land every ~60s per instance, so each new Chrome launches while the previous one is still alive; at concurrency:10 (httpFunctions.js:57) Cloud Run keeps routing them to the same warm container instead of a fresh one. Both 500s are the in-flight request on the instance that ran out: instance 001548f729bf9916 took scans at 18:14:45, 18:15:47, 18:16:48, then its 18:17:48 request died at 27.48s against the OOM logged 18:18:16.094Z ('2055 MiB used'); instance 001548f729309b83 took scans at 18:15:45, 18:16:47, 18:17:47, then its 18:18:49 request died at 54.03s against the OOM logged 18:19:43.112Z ('2054 MiB used'). 2/2 OOM kills map to a 500 by instanceId and by start+latency. Headroom is smaller than 2 GiB looks: every gen2 container here boots the whole src/ import graph because app.js:13-19 re-exports all four handler modules (516-533 MiB measured, incident zd4n21), so ~1.5 GiB is left for Chrome — two overlapping headless Chrome processes on a real storefront cover that. Secondary leak, not evidenced in this window: if page.goto throws, getPage's catch returns {browser: null} (getPageContent.js:363) and drops the reference to an already-launched browser, orphaning that Chrome for the container's life; no 'getPage error' line appears in this window so it is not what fired here.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:55` — memory: '2GiB' — the cap the 2054/2055 MiB kills exceeded
- `packages/functions/src/handlers/exports/httpFunctions.js:57` — concurrency: 10 — up to 10 requests share one 2GiB container, each able to launch its own Chrome
- `packages/functions/src/services/featureCheckService.js:68` — Promise.race abandons the scan at 60s without cancelling it — the request returns while Chrome keeps running
- `packages/functions/src/services/featureCheckService.js:71` — the 60000ms reject that produced all 12 'scan timed out' stderr lines
- `packages/functions/src/helpers/utils/getPageContent.js:327` — puppeteer.launch — one full Chrome per request, the dominant allocation
- `packages/functions/src/helpers/utils/getPageContent.js:357` — page.goto timeout: 120000 — Chrome stays alive ~2x longer than the 60s race the caller gave up on
- `packages/functions/src/helpers/utils/getPageContent.js:142` — browser.close() only in the finally after page.evaluate settles, so an abandoned scan frees nothing at 60s
- `packages/functions/src/helpers/utils/getPageContent.js:363` — getPage catch returns browser:null and drops an already-launched browser — permanent orphan path, not evidenced in this window
- `packages/functions/src/controllers/seoController.js:1600` — catch answers 200 with success:false, which is why 12 of 14 failed scans never appear as 5xx
- `packages/functions/src/app.js:13` — export * of every handler module — each container boots the whole src/ graph (516-533 MiB, incident zd4n21), cutting Chrome headroom to ~1.5GiB

## Evidence
- 2 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-08T18:05:29Z" AND timestamp<="2026-08-08T18:35:29Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 15 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-08T18:05:29Z" AND timestamp<="2026-08-08T18:35:29Z" AND httpRequest.requestUrl:"scanFeatureWorking"`
- 12 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-08T18:05:29Z" AND timestamp<="2026-08-08T18:35:29Z" AND logName:"stderr"`
- 2 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-09T00:00:00Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`

## Job
- analyze rounds: 1
- cost: $1.69

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
