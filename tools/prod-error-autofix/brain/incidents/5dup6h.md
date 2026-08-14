fingerprint: 5dup6h
service: apigen2
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-08-14T07:49:07.393Z
status: infra
attempt: 1

# SEO · apigen2 · 5dup6h

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem fault in avada-seo/us-central1 during 2026-08-14T04:09Z–04:46Z made Node's readFileSync of the deployed bundle fail with `EIO: i/o error, read` at cold start, so apigen2 containers died during module load and Cloud Run answered every request routed to them with 500 'The request failed because the instance could not start successfully.'

**Mechanism.** At 04:26:11.500Z instance 001548f729bcf9 of revision apigen2-00324-zab logged `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read` with the frames `at Object.readFileSync (node:fs:440:20)` → `defaultLoadImpl` → `Object.<anonymous> (/workspace/lib/helpers/seoSpeed.js:25:18)` → `Object.<anonymous> (/workspace/lib/services/lightHouseService.js:18:17)`, then `Could not load the function, shutting down.` The stack is the ordinary cold-start require chain — lightHouseService imports seoSpeed (packages/functions/src/services/lightHouseService.js:9), seoSpeed imports its own dependency graph — and EIO is a device read error raised by the kernel on the read-only /workspace layer, not a JS error: no application code executed. Because the container never bound :8080, Cloud Run failed 114 requests with 'instance could not start successfully', 14 with 'failed the readiness check' and 31 with 'no available instance' (queued behind the dead cold starts) across 16 instances and 24 distinct /api/* paths — /api/track-event 24, /api/subscription 17, /api/analysis-count 16 — i.e. one cause, many endpoint symptoms. The same fault is fleet-wide, not apigen2-specific: 22 identical `EIO: i/o error` module-load failures across 9 different services in the same project/region between 04:09:45Z and 04:43:52Z (authgen2 8, embedappgen2 3, onupdateshopgen2 3, changelogtriggers-shops 2, handleproderroralertgen2 2, apigen2/extensiongen2/changelogtriggers-shopinfos/handleprocessinternallinkreportgen2 1 each). The same window also killed a deploy: UpdateFunction on apiGen2 by tuannv@avadagroup.com finished at 04:46:34Z with status code 3, 'Container Healthcheck failed … failed to start and listen on the port defined provided by the PORT=8080' for revision apigen2-00325-woz, preceded at 04:46:28Z by 'Default STARTUP TCP probe failed … Connection failed with status DEADLINE_EXCEEDED' — same platform fault hitting the new revision.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/services/lightHouseService.js:9` — `import {checkLCPImage} from '@functions/helpers/seoSpeed'` — the require edge that appears in the cold-start stack as lightHouseService.js → seoSpeed.js; the module graph is normal, the read of it failed
- `packages/functions/src/helpers/seoSpeed.js:1` — top of the module whose file read raised EIO during readFileSync at cold start; nothing in this file ran, so no code defect is implicated

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:19:18.125Z" AND timestamp<="2026-08-14T04:49:18.125Z" AND textPayload:"EIO: i/o error"`
- 114 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:19:18.125Z" AND timestamp<="2026-08-14T04:49:18.125Z" AND httpRequest.status>=500 AND textPayload:"instance could not start successfully"`
- 22 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 2 matching entries: `logName="projects/avada-seo/logs/cloudaudit.googleapis.com%2Factivity" AND protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND protoPayload.resourceName:"apiGen2" AND timestamp>="2026-08-14T04:19:18.125Z" AND timestamp<="2026-08-14T04:49:18.125Z"`

## Job
- analyze rounds: 1
- cost: $1.71

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
