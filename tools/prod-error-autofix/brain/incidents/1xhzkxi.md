fingerprint: 1xhzkxi
service: changelogtriggers-subscriptions
message: The request failed because the instance failed the readiness check.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T15:04:37.670Z
status: infra
attempt: 1

# IMG-OPT · changelogtriggers-subscriptions · 1xhzkxi

**Outcome.** infra class — reported, no MR

**Root cause.** changelogTriggers-* are the only functions in this repo deployed with no memory/cpu override — config/changelog.js:8 calls registerV2 with only `collections`, so Cloud Run runs them at 256Mi / 1 vCPU while the container still loads the whole packages/functions/src/index.js bundle; that cold start measures 47–101s when it succeeds, and two attempts on 2026-09-01 exceeded Cloud Run's 240s startup TCP probe deadline, so the instance never bound :8080 and the Eventarc push got 503.

**Mechanism.** One Firestore write to subscriptions at 14:52:48 produced an Eventarc push (POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING, UA APIs-Google) to changelogtriggers-subscriptions revision -00060-lod. No warm instance existed, so Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' at 14:52:48.476 on instance 00a41e8c1deb4b53…. That container's entrypoint is the deployed lib/ build of packages/functions/src/index.js (changelogTriggers is exported from it at index.js:278, imported at index.js:53), i.e. the same full import graph as every other function in the app, but with resources limits cpu:'1', memory:'256Mi' (gcloud run services describe changelogtriggers-subscriptions — the smallest tier in the project; apiv2 next door is 2GiB at index.js:65) because registerV2 at packages/functions/src/config/changelog.js:8 passes no `memory`, an option the library does support (node_modules/firestore-bigquery-changelog/README.md:72,78). The process did not listen on :8080 in time: at 14:56:49.335 (241s after start) Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED', and the queued request was answered 503 with latency 245.226051s. Pub/Sub retried at 14:57:09 → identical outcome (probe fail 15:01:09.631, 503, latency 244.111924s). Same-service cold starts that did finish in that minute took 47.14s, 61.08s and 100.91s (changelogtriggers-shops, changelogtriggers-shopinfos 100.17s) versus 0.05–0.87s warm, so start time sits at ~20–40% of the 240s deadline on a good run and crosses it on a bad one. No application log line exists for either failure (stderr read = 0 entries) because the app process never started.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — registerV2 is called with only `collections` — no memory/cpu/minInstances, so all three changelogTriggers land on the Cloud Run default 256Mi/1vCPU
- `packages/functions/src/index.js:278` — changelogTriggers is exported from the shared index.js, so its container loads the entire app import graph (sharp, puppeteer, @google-cloud/*) just to write one BigQuery row
- `packages/functions/src/index.js:65` — contrast: every hand-declared function sets memory explicitly (apiv2 = 2GiB); the changelog triggers are the only ones that do not

## Evidence
- 2 matching entries: `resource.labels.service_name="changelogtriggers-subscriptions" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T15:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.labels.service_name=~"changelogtriggers-.*" AND logName:"run.googleapis.com%2Frequests" AND timestamp>="2026-09-01T14:50:00Z" AND timestamp<="2026-09-01T18:00:00Z"`
- 6 matching entries: `timestamp>="2026-08-25T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 2
- cost: $3.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
