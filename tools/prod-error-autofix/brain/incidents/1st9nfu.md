fingerprint: 1st9nfu
service: apisagen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T17:48:15.784Z
status: infra
attempt: 1

# SEO · apisagen2 · 1st9nfu

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 10y5ot5: infra, not code — the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` to Node's readFileSync during module load, so 14 apisagen2 cold-start containers of revision apisagen2-00346-xoh died before binding :8080 and the 240s startup TCP probe killed them; the alerted readiness-check failure is that platform fault's symptom.

**Mechanism.** Same service, same revision (apisagen2-00346-xoh), same platform event as 10y5ot5 — only the alert text differs (readiness-check vs STARTUP-probe line), so the HTTP-fallback fingerprint differs while the incident does not. apiSaGen2 is declared minInstances: 1, concurrency: 10 (packages/functions/src/handlers/exports/httpFunctions.js:53-62), so the 17:28–17:43Z admin traffic burst forced Cloud Run to cold-start extra containers. Each new container ran `require` over the read-only /workspace bundle and readFileSync threw `EIO: i/o error, read`, printing "Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read ... at Object.readFileSync (node:fs:440:20)" then "Could not load the function, shutting down." The failing module differs on every instance — 14 EIO lines on 14 distinct instanceIds at 14 distinct byte offsets: @avada/core/build/services/authService.js:88, @avada/shopify-api/dist/utils/index.js:5 and :10, @shopify/koa-shopify-webhooks/node_modules/@shopify/network/build/cjs/index.js:5, googleapis/build/src/apis/index.js:31, :56, :69, :89, :127, googleapis/.../logging/index.js:18, analyticsdata/index.js:18, billingbudgets/index.js:18, calendar/index.js:18, drive/index.js:20. A syntax error or missing dep would fail at the same file every time and would have failed since the revision shipped; revision 00346-xoh was created 2026-08-28T10:48:45Z (4 days of service) and 9 cold starts logged 'STARTUP TCP probe succeeded' inside this same 30-minute window, so the image boots. Because the process dies before listen(), the startupProbe (tcpSocket :8080, timeoutSeconds 240) times out: 13 requests logged 503 'instance failed the readiness check' at latencies 242.08–246.10s — matching the 240s deadline (P4) — plus 103 answered 500 'instance could not start successfully' at 0s latency and 8 'no available instance', 129 failures spread over 15 unrelated /apiSa/* paths (track-event 16, settings 13, shop-locales 12, shopify/themes 12, optimize-store 12, shops 11…). One cause, fifteen symptoms — not fifteen bugs. P3 OOM ruled out: zero 'Memory limit' lines against a declared 2GiB. Region-wide, not service-specific: the same EIO module-load stack fired 76 times across 14 distinct avada-seo services in the 17:00Z hour (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, savealtversionsubscribergen2 5, bulkauditfixapplygen2 5, scanspeedscoresubscriberv2gen2 5, proxygen2 4, apigen2 2…) — different revisions, different images, unchanged code — against just 2 in the whole preceding 16:00Z hour, and zero EIO or probe failures on apisagen2 itself in that hour. Already recorded on 2026-09-01 under 10y5ot5, 1gbu5l7, 13ojanr, 18882z, 1v639fk, 1esj5e, 1qrdito, 15bqjgv, 1mccpq.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:53` — apiSaGen2 export — the Cloud Run service whose cold-start containers failed module load with EIO
- `packages/functions/src/handlers/exports/httpFunctions.js:56` — memory: '2GiB' — with zero 'Memory limit' lines in the window, rules out P3 OOM
- `packages/functions/src/handlers/exports/httpFunctions.js:57` — minInstances: 1 with concurrency: 10 (:58) — one warm instance, so the 17:28Z admin burst forces the cold starts that hit the faulty filesystem

## Evidence
- 19 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:17:55.738Z" AND timestamp<="2026-09-01T17:47:55.738Z" AND textPayload:"EIO: i/o error"`
- 9 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-01T17:17:55.738Z" AND timestamp<="2026-09-01T17:47:55.738Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 76 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"EIO: i/o error"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T17:00:00Z" AND textPayload:"EIO: i/o error"`
- 129 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-01T17:17:55.738Z" AND timestamp<="2026-09-01T17:47:55.738Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.71

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
