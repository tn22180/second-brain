fingerprint: jphxvx
service: lighthouseauditrunnergen2
message: 'Memory limit of 4096 MiB exceeded with 4104 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-01T05:02:02.933Z
status: infra
attempt: 1

# SEO · lighthouseauditrunnergen2 · jphxvx

**Outcome.** infra class — reported, no MR

**Root cause.** lighthouseauditrunnerGen2 is declared memory: '4GiB' (packages/functions/src/handlers/exports/httpFunctions.js:71) while a single mobile/densen4G Lighthouse+Chrome audit of https://www.mandotos.com peaks at 4104–4275 MiB, so 4 of the 16 identical audits in the window were OOM-killed mid-run and Cloud Run answered 500.

**Mechanism.** Every one of the 16 requests to /lighthouse/auditNew in the 30-min window is byte-identical: shopId=H7Mp9P0k2AnZlMlRFrp0, url=https://www.mandotos.com, device=mobile, throttling=densen4G, uploadResult=true, useAvadaLightHouse=true. concurrency: 1 (httpFunctions.js:73) means each request gets its own container, so each OOM is one audit alone, not co-tenancy. performAudit launches a full Chrome via puppeteer.launch (lightHouseController.js:38), then auditLightHouse asks ag-lighthouse for output: ['html','json'] (lightHouseService.js:261), holding the complete HTML report string plus the lhr JSON in the same heap as Chrome's renderer; on top of that every gen2 container in this repo boots the whole src/ import graph because app.js:13-19 re-exports all four handler modules (measured boot floor 516–533 MiB in incident zd4n21), so real audit headroom is ~3.5 GiB, not 4. Each of the 4 killed instances maps 1:1 to a 500 by instanceId and by start+latency: 500 at 04:49:03.15 (+263.04s) -> OOM 04:53:26.50 instance 001548f72936558c09; 04:50:00.28 (+244.54s) -> 04:54:05.33 instance 001548f729b09d4621; 04:51:00.27 (+279.47s) -> 04:56:01.65 instance 001548f729e84f425a; 04:53:01.86 (+254.08s) -> 04:57:15.88 instance 001548f729761fd757. 4/4 exact. The other 12 identical audits of the same URL returned 200 at 195.98–235.57s, i.e. the peak floats right at the cap and which run dies is non-deterministic, matching the observed 4104 / 4123 / 4129 / 4275 MiB overshoots (8–179 MiB over). Amplifier, not the cause: fetchLightHouse aborts at AbortSignal.timeout(120000) (lightHouseService.js:65) while every observed audit took 195–280s, so all 16 responses — the 12 successes included — were already discarded by the caller, and something re-issued the same audit 1–3× per minute for 5 straight minutes, which is what stacked 16 concurrent 4 GiB Chrome containers for one shop.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:71` — memory: '4GiB' — the cap the 4104-4275 MiB audits exceeded
- `packages/functions/src/handlers/exports/httpFunctions.js:73` — concurrency: 1 — proves each OOM is a single audit, not several sharing an instance
- `packages/functions/src/controllers/lightHouseController.js:38` — puppeteer.launch — full Chrome in-process, the dominant allocation
- `packages/functions/src/services/lightHouseService.js:261` — output: ['html','json'] keeps the whole HTML report string plus the lhr object resident alongside Chrome
- `packages/functions/src/services/lightHouseService.js:65` — AbortSignal.timeout(120000) on the caller while every audit ran 195-280s — all 16 responses discarded, drives the repeat calls
- `packages/functions/src/app.js:13` — export * of every handler module: each gen2 container boots the whole src/ graph (516-533 MiB measured, incident zd4n21), cutting audit headroom to ~3.5GiB

## Evidence
- 4 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-01T04:38:00Z" AND timestamp<="2026-08-01T05:08:27Z" AND textPayload:"Memory limit of 4096 MiB exceeded"`
- 4 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-01T04:38:00Z" AND timestamp<="2026-08-01T05:08:27Z" AND httpRequest.status>=500`
- 16 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-08-01T04:38:00Z" AND timestamp<="2026-08-01T05:08:27Z" AND httpRequest.requestUrl:"mandotos.com"`
- 4 matching entries: `(resource.labels.service_name="lighthouseauditrunnergen2") AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T05:08:27Z" AND textPayload:"Memory limit of 4096 MiB exceeded"`

## Job
- analyze rounds: 1
- cost: $1.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
