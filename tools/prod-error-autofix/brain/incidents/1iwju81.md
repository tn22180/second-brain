fingerprint: 1iwju81
service: changelogtriggers-shops
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-08-18T08:31:51.845Z
status: infra
attempt: 1

# BLOG · changelogtriggers-shops · 1iwju81

**Outcome.** infra class — reported, no MR

**Root cause.** The three brand-new gen2 Firestore triggers changelogTriggers-{shops,shopInfos,subscriptions} are registered by firestore-bigquery-changelog's registerV2 with no memory option, so they deploy at the firebase-functions v2 default of 256 MiB, and loading this repo's src/index.js import graph needs 308-345 MiB — the container is OOM-killed before it binds :8080 and all three CreateFunction calls fail.

**Mechanism.** packages/functions/src/index.js:12 exports changelogTriggers, so every changelogtriggers-* container evaluates the whole functions graph (src/index.js re-exports http, pubsub, scheduled and firestore: koa, shopify, langchain/langgraph, ioredis, googleapis) before the functions framework can listen on :8080. packages/functions/src/config/changelog.js:8 calls changelog.registerV2({collections:[...]}) with no memory field, and packages/functions/src/globalOptions.js:5 sets only region and VPC, so no memory is declared anywhere in the chain and firebase-functions/v2 falls back to its 256 MiB default. Each of the three containers logged 'Memory limit of 256 MiB exceeded with 308/318/345 MiB used' immediately followed (0.4 ms later, same instanceId) by 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080', so the probe failure is the consequence of the OOM kill, not a platform stall — the reported usage is 20-35% over the limit and the kill happens during module load, before any trigger payload is handled. Cloud Functions then failed the deploy with status code 3, 'Container Healthcheck failed', naming revision changelogtriggers-shops-00001-baq. Revision 00001 for all three means this was their first-ever deploy, so the functions do not exist in prod and no shops/shopInfos/subscriptions changelog rows are reaching BigQuery. Contrast within the same deploy: 30 other functions of avada-blog-app updated successfully in the 08:00-09:00Z window (empty status), and every one of them declares memory >= 512MiB in src/functions/{http,pubsub,scheduled,firestore}.js — 3 of 3 undeclared functions failed, 0 of 30 declared functions failed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2({collections:[...]}) passes no memory/cpu option, so all three generated gen2 triggers take the firebase-functions v2 default of 256 MiB
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions sets only region and VPC — no global memory floor, so nothing rescues a function that declares none
- `packages/functions/src/index.js:12` — changelogTriggers is exported from the same index.js that re-exports http/pubsub/scheduled/firestore, so each changelogtriggers-* container loads the full 300MiB+ import graph at startup
- `packages/functions/src/functions/firestore.js:14` — the hand-written Firestore triggers in this repo declare memory: '512MiB' and deployed fine in the same run — the tier the changelog triggers should match

## Evidence
- 16 matching entries: `(resource.labels.service_name=~"changelogtriggers" OR resource.labels.function_name=~"changelogTriggers") AND timestamp>="2026-08-18T07:00:00Z" AND timestamp<="2026-08-18T09:30:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe" OR protoPayload.status.code>0)`
- 33 matching entries: `protoPayload.methodName=~"FunctionService.(Create|Update)Function" AND timestamp>="2026-08-18T08:00:00Z" AND timestamp<="2026-08-18T09:00:00Z" AND operation.last=true`
- 5 matching entries: `(resource.labels.service_name="changelogtriggers-shops" OR resource.labels.function_name="changelogtriggers-shops") AND timestamp>="2026-08-18T08:10:27.345Z" AND timestamp<="2026-08-18T08:40:27.345Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
