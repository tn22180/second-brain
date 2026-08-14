fingerprint: lisw3f
service: handleprocessinternallinkreportgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:23:48.431Z
status: infra
attempt: 1

# SEO · handleprocessinternallinkreportgen2 · lisw3f

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: during the 2026-08-14T04:4xZ prod deploy rollout of avada-seo, one cold-start container of handleprocessinternallinkreportgen2 (revision -00310-san) hit an EIO read fault on the container filesystem while require()-ing /workspace/node_modules/googleapis, so the function module never loaded, the process exited 1, and Cloud Run's startup TCP probe on :8080 reported CANCELLED.

**Mechanism.** At 2026-08-14T04:42:39.709129Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' for handleprocessinternallinkreportgen2 (revision handleprocessinternallinkreportgen2-00310-san). 73s later the Node runtime failed module load: 'Provided module can't be loaded.' / 'Is there a syntax error in your code?' / 'Detailed stack trace: Error: EIO: i/o error, read' at 04:43:52.202119Z, with a stack of Object.readFileSync (node:fs:440:20) → defaultLoadImpl → loadSource → Module.load → require → Object.<anonymous> (/workspace/node_modules/googleapis/build/src/apis/accessapproval/index.js:20:19), then 'Could not load the function, shutting down.' at 04:43:52.202738Z and 'Container called exit(1).' at 04:43:53.091237072Z. Because the process died before binding :8080, Cloud Run emitted the alerted line at 04:43:53.258270Z ('STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status CANCELLED') — CANCELLED, not DEADLINE_EXCEEDED, i.e. the container exited rather than timing out, so this is not the P4 240s-probe-deadline shape. The fault is in the filesystem read, not in this repo's code: googleapis@^67.1.1 (packages/functions/package.json:75) is a static production dependency required at module scope by helpers/google.js:2 and services/instantIndexingService.js:1, present in every container image of every function, and it loaded fine on the same revision minutes later — 'STARTUP TCP probe succeeded' at 05:23:37.041232Z and 05:39:57.781819Z. It is also not service-specific: in 04:00–05:30Z the same 'EIO: i/o error, read' line fired 22 times across 9 distinct avada-seo services (authgen2 ×8, onupdateshopgen2 ×3, embedappgen2 ×3, handleproderroralertgen2 ×2, changelogtriggers-shops ×2, extensiongen2, changelogtriggers-shopinfos, apigen2, this one ×1), on different revisions and different images, with unchanged code — the same platform-side container-filesystem fault already recorded as infra under fingerprints 5dup6h / q12jxx / pva4gd / 1i16r90 / e9i6k0. P3 OOM ruled out: zero 'Memory limit' lines on this service in 2026-08-13T00:00Z–2026-08-14T06:00Z, and the declared memory is 2GiB (packages/functions/src/handlers/exports/pubsubFunctions.js:435). Blast radius is zero lost work: requests read = 0 entries (Pub/Sub push, not HTTP 5xx), and a failed instance start means the internalLinkReport message is never ACKed, so Pub/Sub redelivers it to a healthy instance.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:434` — handleProcessInternalLinkReportGen2 export — the service whose cold start died during module load
- `packages/functions/src/handlers/exports/pubsubFunctions.js:435` — {memory: '2GiB', timeoutSeconds: 540, topic: 'internalLinkReport'} — 2GiB with zero 'Memory limit' lines rules out P3; onMessagePublished means an unstarted instance leaves the message un-ACKed and Pub/Sub redelivers
- `packages/functions/src/helpers/google.js:2` — import {google} from 'googleapis' at module scope — the package whose readFileSync threw EIO; it is a static dep of the shared src/ import graph, not something this handler chose to load
- `packages/functions/src/services/instantIndexingService.js:1` — second module-scope googleapis import, showing the package is in every container image — so the EIO is image/filesystem-side, not a code path this alert exercised

## Evidence
- 20 matching entries: `resource.labels.service_name="handleprocessinternallinkreportgen2" AND timestamp>="2026-08-14T04:40:00Z" AND timestamp<="2026-08-14T04:45:00Z"`
- 22 matching entries: `textPayload:"EIO: i/o error, read" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 45 matching entries: `resource.labels.service_name="handleprocessinternallinkreportgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 1 matching entries: `resource.labels.service_name="handleprocessinternallinkreportgen2" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe failed")`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
