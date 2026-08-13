fingerprint: 1iww1ih
service: apisagen2
message: HTTP 500 GET /apiSa/scanFeatureWorking/pageSpeed
app: SEO
repo: seo
date: 2026-08-12T16:37:23.636Z
status: infra
attempt: 1

# SEO · apisagen2 · 1iww1ih

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint gbr70g (same window, same two OOM kills, recorded infra, no MR): apiSaGen2 is declared memory:'2GiB' with concurrency:10 while every GET /apiSa/scanFeatureWorking/pageSpeed launches its own headless Chrome that keeps running after the handler's 60s Promise.race abandons it, so overlapping Chrome processes on one warm container crossed 2048 MiB and the OOM kill took the in-flight request down as a 500.

**Mechanism.** scanFeaturePageSpeedWorking races getPageContent against a 60s reject (featureCheckService.js:68,71). Promise.race does not cancel the loser: getFullPageContent is still awaiting getPage, whose page.goto carries timeout:120000 (getPageContent.js:357), and browser.close() only runs in the finally at getPageContent.js:142 once that settles — so the Chrome launched at getPageContent.js:327 stays resident up to ~120s after the request already returned at 60s. In the 30min window 12 scans hit that 60s race (12 stderr lines '[scanFeatureWorking] undefined [scanFeaturePageSpeedWorking] scan timed out'; the catch at seoController.js:1600 answers 200 with success:false, which is why only 2 requests are 5xx). Requests arrive ~every 60s per instance from referer https://seo.apps.avada.io/performance/speed-up/settings, so each new Chrome launches while the previous is still alive; concurrency:10 (httpFunctions.js:57) keeps Cloud Run routing them to the same warm container. Both 500s are the in-flight request on the instance that ran out, matched by instanceId and by start+latency to the tenth of a second: instance 001548f729bf9916 started 18:17:48.586, died at 27.48s, OOM logged 18:18:16.094Z ('2055 MiB used'); instance 001548f729309b83 started 18:18:49.143, died at 54.03s, OOM logged 18:19:43.112Z ('2054 MiB used'). 2/2 OOM kills map 1:1 onto the 2 500s. Neither 500 reached the 60s race itself (27.48s and 54.03s), so the race is not what returned them — the container death is. Headroom is smaller than 2GiB looks: every gen2 container boots the whole src/ import graph (516-533 MiB measured, incident zd4n21), leaving ~1.5GiB for two overlapping headless Chrome processes on a real storefront.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:55` — memory: '2GiB' — the cap the 2054/2055 MiB kills exceeded
- `packages/functions/src/handlers/exports/httpFunctions.js:57` — concurrency: 10 — up to 10 requests share one 2GiB container, each able to launch its own Chrome
- `packages/functions/src/services/featureCheckService.js:68` — Promise.race abandons the scan at 60s without cancelling it — request returns while Chrome keeps running
- `packages/functions/src/services/featureCheckService.js:71` — the 60000ms reject that produced all 12 'scan timed out' stderr lines
- `packages/functions/src/helpers/utils/getPageContent.js:327` — puppeteer.launch — one full Chrome per request, the dominant allocation
- `packages/functions/src/helpers/utils/getPageContent.js:357` — page.goto timeout: 120000 — Chrome stays alive ~2x longer than the 60s race the caller gave up on
- `packages/functions/src/helpers/utils/getPageContent.js:142` — browser.close() only in the finally after page.evaluate settles, so an abandoned scan frees nothing at 60s
- `packages/functions/src/helpers/utils/getPageContent.js:363` — getPage catch returns browser:null and drops an already-launched browser — permanent orphan path, no 'getPage error' line in this window so not what fired here
- `packages/functions/src/controllers/seoController.js:1600` — catch answers 200 with success:false, which is why 12 of 14 failed scans never appear as 5xx

## Evidence
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-08T18:05:29.300Z" AND timestamp<="2026-08-08T18:35:29.300Z" AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-08T18:05:29.300Z" AND timestamp<="2026-08-08T18:35:29.300Z" AND httpRequest.requestUrl:"scanFeatureWorking/pageSpeed" AND httpRequest.status>=500`
- 12 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-08T18:05:29.300Z" AND timestamp<="2026-08-08T18:35:29.300Z" AND textPayload:"[scanFeaturePageSpeedWorking] scan timed out"`

## Job
- analyze rounds: 1
- cost: $1.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
