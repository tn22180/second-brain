fingerprint: 32rhxe
service: changelogtriggers-shopinfos
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-08-14T08:40:49.221Z
status: infra
attempt: 1

# SEO · changelogtriggers-shopinfos · 32rhxe

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-filesystem fault that swept avada-seo/us-central1 during the 2026-08-14 04:0x–05:3xZ deploy hour hit changelogtriggers-shopinfos — a cold-start container read a JSON file out of /workspace/node_modules and got 'EIO: i/o error, read', so the function module never loaded and every subsequent startup probe on revisions -00256-laq and -00257-zod timed out.

**Mechanism.** At 04:26:12.104Z the container of revision changelogtriggers-shopinfos-00256-laq logged 'Detailed stack trace: Error: EIO: i/o error, read' with the frames Object.readFileSync (node:fs:440:20) → defaultLoadImpl → loadSource → Object..json (node:internal/modules/cjs/loader:1922:31) → /workspace/node_modules/har-validator/lib/schemas/index.js:13:16 → har-validator/lib/runner.js:3:15, followed by 'Provided module can't be loaded.' and 'Could not load the function, shutting down.'. The failing read is a *.json schema file inside node_modules, loaded by require() during module init, not by any src/ code — an EIO from the container's read-only image layer, i.e. the storage layer under the container, not a syntax/reference error (a JS defect surfaces as SyntaxError/ReferenceError, never EIO in fs.readFileSync). With the process dead before listen(), Cloud Run logged 8× 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' across both revisions 04:26:05Z–04:39:38Z, and the queued Pub/Sub deliveries of the shopInfos changelog trigger (declared at packages/functions/src/config/changelog.js:12) drained as 7× 503 'instance failed the readiness check' with flat 241.1–250.1s latencies (the probe deadline, identical to 3 decimal places across all 7 — a platform timer, not variable app work) plus 2× 500 'instance could not start successfully' at 0s. Zero application log lines and zero requests that reached a handler in the whole 30-minute window.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:12` — The {collectionId: 'shopInfos'} entry is what registerV2 turns into the changelogtriggers-shopinfos gen2 function; it is the only src/ line that owns this service, and nothing in it is implicated — the failing require is in node_modules/har-validator.
- `packages/functions/src/config/changelog.js:9` — memory: '1GiB' is the only resource knob on these triggers; recorded to show the failure is not a memory limit (no 'Memory limit … exceeded' line anywhere in the window).

## Evidence
- 23 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:21:47.805Z" AND timestamp<="2026-08-14T04:51:47.805Z" AND severity>=ERROR`
- 32 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:21:47.805Z" AND timestamp<="2026-08-14T04:51:47.805Z" AND logName:"stderr"`
- 9 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:21:47.805Z" AND timestamp<="2026-08-14T04:51:47.805Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="changelogtriggers-shopinfos" AND timestamp>="2026-08-14T04:21:47.805Z" AND timestamp<="2026-08-14T04:51:47.805Z" AND textPayload:"EIO"`

## Job
- analyze rounds: 1
- cost: $1.13

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
