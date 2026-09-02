fingerprint: 17whf6b
service: handlehooksubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T18:17:45.583Z
status: infra
attempt: 1

# SEO · handlehooksubscribergen2 · 17whf6b

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so every handlehooksubscribergen2 cold-start container in 2026-09-01T17:28–17:43Z died before binding :8080 and the one Pub/Sub push routed to such a container was answered 503 'instance failed the readiness check'.

**Mechanism.** 6 of the 7 instances in the pulled window logged the identical boot stack — `Provided module can't be loaded.` → `Detailed stack trace: Error: EIO: i/o error, read` → `at Object.readFileSync (node:fs:440:20)` → `at defaultLoadImpl (node:internal/modules/cjs/loader:1122:17)` → `Could not load the function, shutting down.` — each failing at a DIFFERENT require site inside node_modules (@avada/core/build/index.js:56, @avada/core/build/auth.js:41, @avada/core/build/session/session-utils.js:6, @avada/shopify-api/dist/auth/oauth/oauth.js:10 and :13, @avada/shopify-api/dist/utils/index.js:16). A code or bundle defect would fail at the same line every time; a random read fault on the image layer does not. Each dead container then produced 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' (11 in the window, 11 distinct instanceIds, all on the single revision handlehooksubscribergen2-00343-zaq). The alerted request is the collateral: POST / (topic handleHook, UA APIs-Google) arrived 17:40:31.347613Z, Cloud Run started instance 00a41e8c1d120c… for it, that instance hit EIO at 17:42:59.485726Z and failed its probe at 17:43:00.341673Z, so the request was answered 503 after latency 69.132734s. Code is provably fine: the one warm instance 00a41e8c1d80ac… served the same window normally — 2× HTTP 200 plus 9 application lines including '[handleHook] bulkOp kSHzIYd3kmxGXdX5zSRg COMPLETED' at 17:46:35.441743Z and '[handleHook] bulkOp yjQlVSltcqnrrD9WCmG9 COMPLETED' at 17:48:17.524067Z — same revision, same image. Fleet-wide and bounded: 76 EIO lines across 14 avada-seo services in the 17:00Z hour (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, …) against 2 in the whole preceding two hours 15:00–17:00Z, and 0 EIO on this service in the 6 hours 18:00–24:00Z. Same event already recorded on 2026-09-01 for koudd9, 1esj5e, txdvop, vtubke, 1gbu5l7, 13ojanr, 18882z, 10y5ot5. handleHookSubscriberGen2 declares minInstances: 1, so Cloud Run kept re-attempting the spare instance every ~3–5 min through the window, which is why one Pub/Sub push found no ready container. Blast radius: subscribeHandleHook was never entered on the dead containers (die at module load, before any handler), so no partial writes; Pub/Sub redelivers the message. A 9-request tail of 500 'The request failed because the instance could not start successfully.' at 18:13–18:14Z is the same fault family, outside the alert window.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:344` — handleHookSubscriberGen2 export — the Cloud Run service whose cold starts died on EIO during module load
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — {memory: '2GiB', timeoutSeconds: 540, topic: 'handleHook', minInstances: 1} — 2GiB with zero 'Memory limit' lines rules out P3 OOM; minInstances:1 is why Cloud Run kept retrying a spare container through the window
- `packages/functions/src/handlers/exports/pubsubFunctions.js:346` — wrapPubSub(subscribeHandleHook) — the handler never ran on the failed containers; the process died at require() time, before this callback exists

## Evidence
- 12 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-09-01T17:28:01.371Z" AND timestamp<="2026-09-01T17:58:01.371Z" AND severity>=ERROR`
- 93 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-09-01T17:28:01.371Z" AND timestamp<="2026-09-01T17:58:01.371Z" AND logName:"stderr"`
- 1 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-09-01T17:28:01.371Z" AND timestamp<="2026-09-01T17:58:01.371Z" AND httpRequest.status>=500`
- 76 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"EIO: i/o error"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T17:00:00Z" AND textPayload:"EIO: i/o error"`
- 2 matching entries: `resource.labels.service_name="handlehooksubscribergen2" AND timestamp>="2026-09-01T17:28:01Z" AND timestamp<="2026-09-01T17:58:01Z" AND httpRequest.status<500 AND httpRequest.status>=200`

## Job
- analyze rounds: 1
- cost: $1.87

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
