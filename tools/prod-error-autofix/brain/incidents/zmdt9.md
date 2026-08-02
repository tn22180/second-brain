fingerprint: zmdt9
service: internalgen2
message: 'Memory limit of 512 MiB exceeded with 526 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-01T16:59:52.268Z
status: infra
attempt: 1

# SEO · internalgen2 · zmdt9

**Outcome.** infra class — reported, no MR

**Root cause.** internalGen2 is declared memory: '512MiB' (packages/functions/src/handlers/exports/httpFunctions.js:95) while a gen2 container in this repo needs 514–546 MiB just to boot the shared src/ import graph, so the container is OOM-killed before the startup TCP probe, the instance never starts, and Cloud Run answers 503 to whatever cold-start request triggered it.

**Mechanism.** Every Firebase gen2 container in this repo loads packages/functions/src/app.js, which `export *`s all four handler modules (app.js:13-19), so an internalGen2 instance boots the entire src/ tree — Firestore SDK, shopifyService, the Elasticsearch client internalTools.js:18 pulls in, ioredis, koa — regardless of which one function it will serve. The repo already measured that floor and wrote it down: pubsubFunctions.js:552-557 records that the shared src/ graph 'needs ~531MiB just to boot, so 512MiB OOM'd on cold start BEFORE the readiness probe', and that function was raised to 1GiB (pubsubFunctions.js:558). internalGen2 was left at 512MiB. Measured overshoot on this service over 7 days: 514, 520, 523, 526, 530, 538, 543, 546 MiB — 8 kills, all 2–34 MiB over the cap, which is why the failure is non-deterministic rather than total. Each kill maps to the alert triad in the same 10ms: 'Memory limit of 512 MiB exceeded' at 16:56:51.941628 / 16:57:03.941928 / 16:57:15.942037, each followed within 300µs by 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' at 16:56:51.941835 / 16:57:03.942274 / 16:57:15.942246 — 3/3 exact, same instanceId per pair. The three 503s ('The request failed because the instance failed the readiness check.', latency 18.02s / 12.02s / 11.02s) carry those same three instanceIds. That the cause is the boot, not the request, is proven by the successes: three requests to the identical URL in the same 90s burst returned 401 (16:56:52.647 at 0.080s warm, 16:57:52.640 at 12.15s cold-but-survived, 16:57:54.982 at 0.075s warm) — same handler, same path, same absent token, the only difference being whether boot RSS landed under 512. Note the traffic itself: all 12 requests this service has received in 7 days are unauthenticated scanner probes — GET /internal/ on 07-27 and GET /internal/.env.staging on 08-01, UA curl/8.7.1, from 66.249.93.x / 142.250.32.x. Zero 200s ever. setGlobalOptions({invoker: 'public'}) (httpFunctions.js:23) is what lets an anonymous scanner force these cold starts; the token gate (internalTools.js:45-58) correctly 401s every one that survives boot, so nothing leaked.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:95` — memory: '512MiB' — the cap the 514-546 MiB boots exceed; every other HTTP function in this file is 1GiB or more
- `packages/functions/src/handlers/exports/httpFunctions.js:94` — export const internalGen2 = onRequest — the function whose container is being killed
- `packages/functions/src/app.js:13` — export * of every handler module: an internalGen2 container boots the whole src/ import graph, not just internalTools
- `packages/functions/src/handlers/exports/pubsubFunctions.js:555` — repo's own recorded measurement of this exact failure — '512MiB OOM'd on cold start BEFORE the readiness probe'
- `packages/functions/src/handlers/exports/pubsubFunctions.js:558` — memory: '1GiB' — the fix already applied to the sibling function that hit the identical boot-floor OOM
- `packages/functions/src/handlers/internalTools.js:18` — createElasticsearchService import — one of the heavy deps resident at boot on a function whose routes may never touch it
- `packages/functions/src/handlers/exports/httpFunctions.js:23` — setGlobalOptions({invoker: 'public'}) — why an anonymous .env scanner can force cold starts on this function at all
- `packages/functions/src/handlers/internalTools.js:45` — the X-Internal-Token gate that produced the 401s — proves the handler is fine and the failure is pre-handler

## Evidence
- 3 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-08-01T16:41:52.923Z" AND timestamp<="2026-08-01T17:11:52.923Z" AND textPayload:"Memory limit of 512 MiB exceeded"`
- 3 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-08-01T16:41:52.923Z" AND timestamp<="2026-08-01T17:11:52.923Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-08-01T16:41:52.923Z" AND timestamp<="2026-08-01T17:11:52.923Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T17:11:52Z" AND textPayload:"Memory limit of 512 MiB exceeded"`
- 12 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T17:11:52Z" AND httpRequest.requestMethod!=""`
- 3 matching entries: `(resource.labels.service_name="internalgen2") AND timestamp>="2026-08-01T16:41:52.923Z" AND timestamp<="2026-08-01T17:11:52.923Z" AND httpRequest.status=401`

## Job
- analyze rounds: 1
- cost: $1.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
