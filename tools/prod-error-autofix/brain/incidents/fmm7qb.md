fingerprint: fmm7qb
service: optimizesubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T18:27:28.439Z
status: infra
attempt: 1

# SEO · optimizesubscribergen2 · fmm7qb

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 31428 (same service, same revision optimizesubscribergen2-00343-rep, same instance 00a41e8c1dfdedae…, same single 503 at 18:01:44.447100Z): infra, not code — a platform-side container-start fault swept avada-seo/us-central1 during 2026-09-01T17:30–18:30Z, and one optimizesubscribergen2 cold-start container never bound :8080, so Cloud Run killed it at its 240s startup TCP probe deadline and answered the one Pub/Sub push waiting on it with 503 'instance failed the readiness check'.

**Mechanism.** This alert's window (17:50:48.827–18:20:48.827Z) covers the identical event already recorded as 31428 (window 17:50:46–18:20:46Z): the same 2 error entries, the same single request, the same 83 stderr lines. Only the alert text differs ('The request failed because the instance failed the readiness check.' here vs the STARTUP-probe line there), so the HTTP-fallback fingerprint differs while the incident does not — P7: on this app the sink sees only the request log, so two texts for one event get two fingerprints. Chain: at 2026-09-01T18:01:44.447100Z a Pub/Sub push (userAgent 'APIs-Google', remoteIp 192.178.15.10) for topic optimizeImage hit optimizesubscribergen2 on instance 00a41e8c1dfdedae…, revision -00343-rep. The container never reached listen(): at 18:05:45.189253Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. … Connection failed with status DEADLINE_EXCEEDED' on that same instanceId — 240.7s after the push, matching the gen2 default startupProbe timeoutSeconds:240 (P4: the latency identifies which limit fired). The request's own latency, 242.212414s, is that probe window plus scheduling. That instance emitted zero application log lines; all 83 stderr entries in the window came from a healthy sibling instance 00a41e8c1deb3d2a0a66 ('[subscribeOptimize] MSG_RECEIVED mS5Z6oXGTMzCWV05ml5B optimizingType alt …', packages/functions/src/handlers/cron/subscribeOptimize.js:23), so handler code ran normally throughout and the fault is cold-start only. Not service-specific: re-run now, the identical probe-failure line fired 200 times in 17:30–18:30Z across 26 distinct avada-seo services on different revisions and different images with unchanged code — apisagen2 ×62, authsagen2 ×22, partnerintegrationsubscribergen2 ×17, handlehooksubscribergen2 ×12 … optimizesubscribergen2 ×1 — the same platform window already recorded under 6u2krl / vtubke / txdvop / 1gbu5l7 / 1esj5e / 15bqjgv / 31428. P3 OOM ruled out: no 'Memory limit' line on this service and the container died before module load. optimizeSubscriberGen2 is declared with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:119-122), so every burst past current capacity pays a full cold start and is exposed to the fault. Blast radius is one Pub/Sub delivery: a 503 on a push subscription is retried by Pub/Sub and subscribeOptimize is re-entrant, so the optimize message was redelivered, not lost.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:119` — optimizeSubscriberGen2 export — the Cloud Run service whose cold-start container failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:120` — {timeoutSeconds: 540, memory: '2GiB', topic: OPTIMIZER_PUB_SUB_V1, ...vpcSettings} — no minInstances, so a burst pays a full cold start; 2GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/config/vpcSettings.js:12` — vpcSettings spreads only vpcConnector settings in prod — adds no minInstances, so the declaration above is the complete scaling config
- `packages/functions/src/handlers/cron/subscribeOptimize.js:23` — the '[subscribeOptimize] MSG_RECEIVED' line — all 83 stderr entries came from a healthy sibling instance, proving the handler ran fine and the fault is cold-start only

## Evidence
- 2 matching entries: `resource.labels.service_name="optimizesubscribergen2" AND timestamp>="2026-09-01T17:50:48.827Z" AND timestamp<="2026-09-01T18:20:48.827Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.service_name="optimizesubscribergen2" AND timestamp>="2026-09-01T17:50:48.827Z" AND timestamp<="2026-09-01T18:20:48.827Z" AND httpRequest.status>=500`
- 200 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T18:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 83 matching entries: `(resource.labels.service_name="optimizesubscribergen2") AND timestamp>="2026-09-01T17:50:48.827Z" AND timestamp<="2026-09-01T18:20:48.827Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.41

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
