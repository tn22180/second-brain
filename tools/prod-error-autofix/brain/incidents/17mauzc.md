fingerprint: 17mauzc
service: changelogtriggers-shops
message: 'Memory limit of 256 MiB exceeded with 308 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: BLOG
repo: blogs
date: 2026-08-18T08:29:15.782Z
status: infra
attempt: 1

# BLOG · changelogtriggers-shops · 17mauzc

**Outcome.** infra class — reported, no MR

**Root cause.** The brand-new gen2 Firestore trigger changelogTriggers-shops was created by firestore-bigquery-changelog's registerV2 with no memory override and no global memory default, so it deployed at Cloud Run's 256 MiB default and its container was OOM-killed at 308 MiB while loading this repo's src/index.js import graph, failing the deploy healthcheck.

**Mechanism.** The 08:25:30Z audit log is a CreateFunction (first-ever deploy, revision changelogtriggers-shops-00001-baq) by tuannv@avadagroup.com that returned status code 3: 'Container Healthcheck failed... failed to start and listen on the port PORT=8080'. 0.4s earlier, at 08:25:24.308039Z, the container logged 'Memory limit of 256 MiB exceeded with 308 MiB used', and at 08:25:24.308432Z 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' — same instanceId 00a41e8c1dd39d87…, so the OOM happened before listen(), i.e. during module load, not while handling a document write. The 256 MiB is the Cloud Run default: packages/functions/src/config/changelog.js:8 calls changelog.registerV2({collections:[...]}) passing no runtime options, and packages/functions/src/globalOptions.js:5 sets only region and vpcConnector — no memory. Every other function in this repo declares memory explicitly at 512MiB or more (packages/functions/src/functions/firestore.js:14). Loading the function target pulls packages/functions/src/index.js, which re-exports the whole http/pubsub/scheduled/firestore graph (index.js:7-10) into every container, and that graph needs ~308 MiB of heap, > 256.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — registerV2 declares the three changelogTriggers-* functions with only `collections` — no memory, so Cloud Run's 256 MiB default applies, matching the 'Memory limit of 256 MiB exceeded' text exactly
- `packages/functions/src/globalOptions.js:5` — the only setGlobalOptions call sets region + vpcConnector and no memory, so there is no fleet-wide default to lift changelogTriggers off 256 MiB
- `packages/functions/src/index.js:7` — index.js re-exports http/pubsub/scheduled/firestore, so the changelogTriggers.shops container loads the entire src import graph at cold start — the 308 MiB measured before listen()
- `packages/functions/src/functions/firestore.js:14` — the repo's other Firestore triggers declare memory: '512MiB'; changelogTriggers is the only one left on the 256 MiB default

## Evidence
- 1 matching entries: `(resource.labels.service_name="changelogtriggers-shops") AND timestamp>="2026-08-18T08:10:27.341Z" AND timestamp<="2026-08-18T08:40:27.341Z" AND severity>=ERROR AND textPayload:"Memory limit of 256 MiB exceeded"`
- 1 matching entries: `(resource.labels.service_name="changelogtriggers-shops") AND timestamp>="2026-08-18T08:10:27.341Z" AND timestamp<="2026-08-18T08:40:27.341Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 1 matching entries: `protoPayload.resourceName="projects/avada-blog-app/locations/us-central1/functions/changelogTriggers-shops" AND timestamp>="2026-08-18T08:10:27.341Z" AND timestamp<="2026-08-18T08:40:27.341Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $1.94

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
