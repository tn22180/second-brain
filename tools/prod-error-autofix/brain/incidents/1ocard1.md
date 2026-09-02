fingerprint: 1ocard1
service: changelogtriggers-subscriptions
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T15:11:24.585Z
status: infra
attempt: 1

# IMG-OPT · changelogtriggers-subscriptions · 1ocard1

**Outcome.** infra class — reported, no MR

**Root cause.** changelogTriggers-* are the only Cloud Run services in app-plaza-image-optimizer deployed at the firebase-functions v2 default 256Mi/1CPU, and at that size a cold start of the repo's single full-app index.js import graph takes 47-101s normally and blows past the 240s startup TCP probe under a write burst, so the instance is never started and Eventarc gets a 503.

**Mechanism.** packages/functions/src/index.js pulls 52 top-level handler imports (sharp/puppeteer/shopify chains) and every gen2 container in this repo loads that whole module. Every export in index.js passes an explicit `memory` option except `export {changelogTriggers}` at index.js:278, which comes from changelog.registerV2({collections:[shops,shopInfos,subscriptions]}) in config/changelog.js:8 — registerV2 is called with no memory/cpu option, so the three services deploy at the gen2 default 256Mi/1CPU (gcloud run services list: changelogtriggers-{shops,shopInfos,subscriptions}=256Mi, every other service >=512Mi). During the 14:52-15:05Z Firestore write burst, cold starts of that graph at 256Mi were measured at 47.14s / 61.08s / 100.17s / 100.91s (HTTP 200), and 6 of them exceeded the service's startupProbe (tcpSocket:8080, timeoutSeconds=240, failureThreshold=1) — latencies 242.12s, 242.16s, 242.22s, 242.23s, 244.11s, 245.23s, i.e. the 240s probe deadline plus routing overhead. Cloud Run logged 'Default STARTUP TCP probe failed ... DEADLINE_EXCEEDED' and answered the Eventarc push with 503. Not a bad build: revision -00060-lod deployed 2026-08-27T08:02:12Z reported 'Containers became healthy in 13.86s'. No 'Memory limit ... exceeded' entry exists anywhere in the window — this is slow module load under a tight heap, not an OOM kill.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2({collections:[...]}) is called with no memory/cpu option — the three changelogTriggers services therefore deploy at the gen2 default 256Mi/1CPU
- `packages/functions/src/index.js:278` — `export {changelogTriggers}` is the only export in index.js that carries no memory option
- `packages/functions/src/index.js:66` — representative sibling export — every other function passes an explicit memory ('512MiB' here, 2GiB/4GiB elsewhere)
- `packages/functions/src/index.js:2` — first of 52 top-level handler imports; the whole app graph is loaded by every container including changelogTriggers

## Evidence
- 7 matching entries: `resource.type="cloud_run_revision" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T14:00:00Z" AND timestamp<="2026-09-01T15:30:00Z"`
- 24 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name=~"changelogtriggers" AND timestamp>="2026-09-01T14:40:00Z" AND timestamp<="2026-09-01T15:15:00Z" AND httpRequest.requestMethod="POST"`
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="changelogtriggers-subscriptions" AND httpRequest.status>=500 AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-09-01T15:12:30Z"`
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="changelogtriggers-subscriptions" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-25T00:00:00Z" AND timestamp<="2026-09-01T15:12:30Z"`

## Job
- analyze rounds: 2
- cost: $3.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
