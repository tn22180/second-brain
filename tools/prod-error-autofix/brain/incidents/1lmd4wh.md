fingerprint: 1lmd4wh
service: changelogtriggers-shops
message: The request failed because the instance failed the readiness check.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T15:18:44.189Z
status: infra
attempt: 1

# IMG-OPT · changelogtriggers-shops · 1lmd4wh

**Outcome.** infra class — reported, no MR

**Root cause.** changelogTriggers-shops runs the full packages/functions/src/index.js import graph on Cloud Run's smallest tier (cpu:1, memory:256Mi) because config/changelog.js registers it with no memory/cpu override, so its cold start (47–101s when it succeeds) crossed the 240s STARTUP TCP probe deadline three times at 14:48–14:52Z and Eventarc got 503.

**Mechanism.** Three Firestore writes to `shops` produced Eventarc pushes (POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING) to changelogtriggers-shops revision -00060-vir with no warm instance, so Cloud Run started instances 00a41e8c1dba31…, …1d2c72…, …1d7210…. Their entrypoint is the deployed lib/ build of packages/functions/src/index.js, which re-exports changelogTriggers (index.js:278) from the import at index.js:53 — the same whole-app graph (sharp, puppeteer, @google-cloud/*) every other function loads — but at cpu=1, memory=256Mi (`gcloud run services describe changelogtriggers-shops` → `cpu=1;memory=256Mi`, the smallest in the project; apiv2 next door is 2GiB at index.js:65) because registerV2 at packages/functions/src/config/changelog.js:8 passes only `collections` and no `memory`. None of the three bound :8080 in time: all three requests were answered 503 with latency 242.121076s / 242.155639s / 242.227693s, and Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' 4× at 14:58:15.164209Z, 14:58:15.164216Z, 14:58:15.662262Z and 14:59:39.874659Z. In the same minute three cold starts that did finish took 47.140499021s, 61.081073430s and 100.912363206s, versus 0.048–0.866s once warm — i.e. start time normally sits at 20–42% of the 240s deadline and crossed it here. stderr read = 0 entries because the app process never started. Same fault, same hour, same cause as recorded fingerprint 1xhzkxi on the sibling service changelogtriggers-subscriptions (probe fails 14:56:49Z, 15:01:09Z, 15:05:29Z) — one config defect, three services.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — registerV2 called with only `collections` — no memory/cpu/minInstances, so all three changelogTriggers land on the Cloud Run default 256Mi/1vCPU
- `packages/functions/src/index.js:278` — changelogTriggers is re-exported from the shared index.js, so its container loads the entire app import graph just to write one BigQuery row
- `packages/functions/src/index.js:53` — the import that pulls the changelog triggers into the shared bundle entrypoint
- `packages/functions/src/index.js:65` — contrast: hand-declared functions set memory explicitly (apiv2 = 2GiB); the changelog triggers are the only ones that do not

## Evidence
- 4 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 19 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND logName:"run.googleapis.com%2Frequests" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T16:00:00Z"`
- 7 matching entries: `timestamp>="2026-08-25T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 2
- cost: $1.95

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
