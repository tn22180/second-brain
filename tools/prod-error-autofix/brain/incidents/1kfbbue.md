fingerprint: 1kfbbue
service: changelogtriggers-shopinfos
message: 'Memory limit of 256 MiB exceeded with 345 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: BLOG
repo: blogs
date: 2026-08-18T08:35:26.997Z
status: infra
attempt: 1

# BLOG · changelogtriggers-shopinfos · 1kfbbue

**Outcome.** infra class — reported, no MR

**Root cause.** The brand-new gen2 Firestore trigger changelogTriggers-shopInfos was registered by firestore-bigquery-changelog's registerV2 with no memory option and no global memory default, so it deployed at Cloud Run's 256 MiB default and its container was OOM-killed at 345 MiB while loading this repo's src/index.js import graph, failing the deploy healthcheck.

**Mechanism.** The 08:25:32.968Z audit log is a CreateFunction (first-ever deploy, revision changelogtriggers-shopinfos-00001-civ) by tuannv@avadagroup.com returning status code 3: 'Container Healthcheck failed. The user-provided container failed to start and listen on the port defined provided by the PORT=8080'. 0.4s earlier, at 08:25:27.588168Z, the container logged 'Memory limit of 256 MiB exceeded with 345 MiB used', and at 08:25:27.588567Z 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' — same instanceId 00a41e8c1d59dff2…, so the OOM happened before listen(), i.e. during module load, not while handling a document write. The Cloud Run service spec captured in the same system_event log shows resources.limits.memory = '256Mi' (containerConcurrency 80, timeout 60), which is the Cloud Run default: packages/functions/src/config/changelog.js:8 calls changelog.registerV2({collections:[{shops},{shopInfos},{subscriptions}]}) passing no runtime options, and packages/functions/src/globalOptions.js:5 sets only region and vpcConnector — no memory. Loading the build-function-target changelogTriggers.shopInfos pulls packages/functions/src/index.js, which re-exports the whole http/pubsub/scheduled/firestore graph (index.js:7-10) into every container; that graph needs ~345 MiB of heap, > 256. Every other Firestore trigger in the repo declares memory: '512MiB' explicitly (packages/functions/src/functions/firestore.js:14). Same cause and same deploy as fingerprint 17mauzc (changelogTriggers-shops, 308 MiB) and 1iwju81 — one registerV2 call, three sibling functions, three OOM'd first deploys.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — registerV2 declares changelogTriggers-{shops,shopInfos,subscriptions} with only `collections` — no memory, so Cloud Run's 256 MiB default applies, matching the 'Memory limit of 256 MiB exceeded' text exactly
- `packages/functions/src/config/changelog.js:11` — the shopInfos collection entry is the one that becomes the alerting function changelogTriggers-shopInfos (build-function-target 'changelogTriggers.shopInfos' in the Cloud Run annotations)
- `packages/functions/src/globalOptions.js:5` — the only setGlobalOptions call sets region + vpcConnector and no memory, so no fleet-wide default lifts changelogTriggers off 256 MiB
- `packages/functions/src/index.js:7` — index.js re-exports http/pubsub/scheduled/firestore, so the changelogTriggers.shopInfos container loads the entire src import graph at cold start — the 345 MiB measured before listen()
- `packages/functions/src/functions/firestore.js:14` — the repo's other Firestore triggers declare memory: '512MiB'; changelogTriggers is the only family left on the 256 MiB default

## Evidence
- 1 matching entries: `(resource.labels.service_name="changelogtriggers-shopinfos") AND timestamp>="2026-08-18T08:10:29.092Z" AND timestamp<="2026-08-18T08:40:29.092Z" AND severity>=ERROR AND textPayload:"Memory limit of 256 MiB exceeded"`
- 1 matching entries: `(resource.labels.service_name="changelogtriggers-shopinfos") AND timestamp>="2026-08-18T08:10:29.092Z" AND timestamp<="2026-08-18T08:40:29.092Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 1 matching entries: `protoPayload.resourceName="projects/avada-blog-app/locations/us-central1/functions/changelogTriggers-shopInfos" AND timestamp>="2026-08-18T08:10:29.092Z" AND timestamp<="2026-08-18T08:40:29.092Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.07

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
