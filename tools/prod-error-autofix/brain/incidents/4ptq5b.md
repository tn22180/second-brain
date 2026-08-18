fingerprint: 4ptq5b
service: changelogtriggers-subscriptions
message: 'Memory limit of 256 MiB exceeded with 318 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: BLOG
repo: blogs
date: 2026-08-18T08:38:14.417Z
status: infra
attempt: 1

# BLOG · changelogtriggers-subscriptions · 4ptq5b

**Outcome.** infra class — reported, no MR

**Root cause.** The first-ever deploy of gen2 Firestore trigger changelogTriggers-subscriptions was registered by firestore-bigquery-changelog's registerV2 with no memory option and no global memory default, so Cloud Run created revision changelogtriggers-subscriptions-00001-xer at the 256 MiB default and the container was OOM-killed at 318 MiB while loading this repo's src/index.js import graph, failing the startup healthcheck.

**Mechanism.** The 08:25:31.213Z audit log is a CreateFunction (first deploy, revision -00001-xer) by tuannv@avadagroup.com returning status code 3: 'Container Healthcheck failed... failed to start and listen on the port defined provided by the PORT=8080'. 5s earlier at 08:25:26.219215Z the container logged 'Memory limit of 256 MiB exceeded with 318 MiB used', and 0.4ms later at 08:25:26.219656Z 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' — same revision, so the OOM happened before listen(), i.e. during module load, not while handling a document write. The Cloud Run revision spec captured in the 08:25:26.711549Z system_event shows resources.limits.memory = '256Mi' (cpu 1, containerConcurrency 80, timeoutSeconds 60) — the Cloud Run default: packages/functions/src/config/changelog.js:8 calls changelog.registerV2({collections:[{shops},{shopInfos},{subscriptions}]}) passing no runtime options, and packages/functions/src/globalOptions.js:5 sets only region and vpcConnector, no memory. The revision's build-function-target is 'changelogTriggers.subscriptions', which resolves through packages/functions/src/index.js:2 and re-exports http/pubsub/scheduled/firestore (index.js:7-10), so every changelogTriggers container loads the entire src import graph — ~318 MiB of heap, > 256. Every other Firestore trigger in the repo declares memory: '512MiB' explicitly (packages/functions/src/functions/firestore.js:14). Same registerV2 call, same deploy, same failure as already-recorded fingerprints 17mauzc (changelogTriggers-shops, 308 MiB), 1kfbbue (shopInfos, 345 MiB) and 1iwju81 — one call, three sibling functions, three OOM'd first deploys.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — registerV2 declares changelogTriggers-{shops,shopInfos,subscriptions} with only `collections` — no memory option, so Cloud Run's 256 MiB default applies, matching the 'Memory limit of 256 MiB exceeded' text exactly
- `packages/functions/src/config/changelog.js:12` — the subscriptions collection entry is the one that becomes the alerting function changelogTriggers-subscriptions (build-function-target 'changelogTriggers.subscriptions' in the revision annotations)
- `packages/functions/src/globalOptions.js:5` — the only setGlobalOptions call sets region + vpcConnector and no memory, so no fleet-wide default lifts changelogTriggers off 256 MiB
- `packages/functions/src/index.js:7` — index.js re-exports http/pubsub/scheduled/firestore, so the changelogTriggers.subscriptions container loads the whole src import graph at cold start — the 318 MiB measured before listen()
- `packages/functions/src/functions/firestore.js:14` — the repo's other Firestore triggers declare memory: '512MiB'; changelogTriggers is the only family left on the 256 MiB default

## Evidence
- 5 matching entries: `(resource.labels.service_name="changelogtriggers-subscriptions" OR resource.labels.function_name="changelogtriggers-subscriptions") AND timestamp>="2026-08-18T08:10:29.426Z" AND timestamp<="2026-08-18T08:40:29.426Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.service_name="changelogtriggers-subscriptions" AND timestamp>="2026-08-18T08:10:29.426Z" AND timestamp<="2026-08-18T08:40:29.426Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 1 matching entries: `protoPayload.resourceName="projects/avada-blog-app/locations/us-central1/functions/changelogTriggers-subscriptions" AND timestamp>="2026-08-18T08:10:29.426Z" AND timestamp<="2026-08-18T08:40:29.426Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.99

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
