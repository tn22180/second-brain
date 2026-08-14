fingerprint: 1wblodj
service: optimizesubscriberv2gen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T07:29:13.537Z
status: infra
attempt: 1

# SEO · optimizesubscriberv2gen2 · 1wblodj

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 made optimizesubscriberv2gen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 4 Pub/Sub pushes for topic optimizeImageV2 waiting on those cold starts were answered 503 'instance failed the readiness check'.

**Mechanism.** All 4 failed requests are POST https://optimizesubscriberv2gen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/optimizeImageV2, one revision (optimizesubscriberv2gen2-00315-fem), 4 distinct instanceIds (001548f7290da1463d96, 001548f729f9d263fe52, 001548f7295832aa88f3, 001548f72903413e3cbc), each 503 paired ~18-20s later with 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' on the same instanceId. Every 503 latency is 241.084s / 241.109s / 243.100s / 246.105s — the 240s Cloud Run startup-probe deadline plus scheduling, i.e. P4: the latency identifies which limit fired, not a handler that ran slow. optimizeSubscriberV2Gen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds: LIMIT_TIME_PUBSUB_OPTIMIZE, topic: OPTIMIZER_PUB_SUB_V2, ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:124-132), so every optimizeImageV2 burst at zero warm instances pays a full cold start. Not this service's code: fleet-wide the same probe-failure line fired 593 times across 46 avada-seo services in the 04:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, … optimizesubscriberv2gen2 only 4) against 2 entries in the whole 03:00Z hour — a bounded platform window already recorded under fingerprints 1r74ll6, muzsov, 1470mjt, 8g3u6t, e9i6k0, 1bwfmw9, 1mprni, 1lwydlk. P3 OOM ruled out: zero 'Memory limit' lines on this service all day. The image boots fine — 9 successful startup probes the same day, and the same service logged healthy work inside the same window ([optimizeImg:processFileImage] LAUNCH_CLOUD_RUN / [runOptimizeImageJob] LAUNCHED at 04:37:40-41Z for shop 9sJwi1SYMfJLYX1NKuly). The container died before module load, so no application stack exists for these 4. Blast radius: subscribeOptimize never ran for those 4 messages, so no partial writes; Pub/Sub redelivers, and the 04:37Z success shows the topic drained.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:124` — optimizeSubscriberV2Gen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:126` — memory: '1GiB' — zero 'Memory limit' lines on this service, so P3 OOM is ruled out
- `packages/functions/src/handlers/exports/pubsubFunctions.js:128` — topic: OPTIMIZER_PUB_SUB_V2 — the optimizeImageV2 topic named in all 4 failed push URLs; no minInstances is declared, so each burst pays a full cold start

## Evidence
- 4 matching entries: `(resource.labels.service_name="optimizesubscriberv2gen2") AND timestamp>="2026-08-14T04:16:31.862Z" AND timestamp<="2026-08-14T04:46:31.862Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="optimizesubscriberv2gen2") AND timestamp>="2026-08-14T04:16:31.862Z" AND timestamp<="2026-08-14T04:46:31.862Z" AND severity>=ERROR`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 9 matching entries: `resource.labels.service_name="optimizesubscriberv2gen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.15

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
