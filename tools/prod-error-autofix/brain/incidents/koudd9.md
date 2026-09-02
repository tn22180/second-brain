fingerprint: koudd9
service: proxygen2
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-09-01T18:01:29.190Z
status: infra
attempt: 2

# SEO · proxygen2 · koudd9

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so proxygen2 cold-start containers died before binding :8080 and Cloud Run answered every request routed to them with a synthetic 500 'The request failed because the instance could not start successfully.' at latency 0s.

**Mechanism.** All 69 alerted 500s are POST /proxy/save404 with httpRequest.latency exactly '0s' and textPayload 'The request failed because the instance could not start successfully.' — Cloud Run's own frontend message, emitted when no container is available; no application code ran, so no handler log exists for any of them. In the same 30-minute window three distinct proxygen2 instances (00a41e8c1da363 @ 17:31:30.937Z, 00a41e8c1dea64 @ 17:36:21.253Z, 00a41e8c1dc004 @ 17:39:33.643Z, all on revision proxygen2-00351-riz) logged 'Provided module can't be loaded. / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20) / at defaultLoadImpl (node:internal/modules/cjs/loader:1122:17) ... at Object.<anonymous> (/workspace/node_modules/clean-css/lib/clean.js:9:17)' followed by 'Could not load the function, shutting down.' The read fails inside node_modules on the read-only image layer, three different offsets in clean-css on three different instances — a per-container filesystem fault, not a code path. A fourth start (instance 00a41e8c1dd239 @ 17:47:12.135Z) died with 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 ... DEADLINE_EXCEEDED' and produced no application log at all, which explains the 31-request 17:47 burst. The 500 bursts land immediately after each failed start (17:36:21.9, 17:39:33.x, 17:47:1x). The fault is fleet-wide, not proxygen2-specific: the identical `EIO: i/o error, read` appears 76 times across 14 avada-seo services in the 17:00–18:00Z hour (apisagen2 19, handlehooksubscribergen2 10, changelogtriggers-subscriptions 7, partnerintegrationsubscribergen2 6, authsagen2 6, …), matching the already-recorded fingerprints 10y5ot5 / 1st9nfu / 1ombwxy / 10gpf63 / znz9xj / 1l9w2m4 / txdvop for the same window. The only app-side amplifier is that proxyGen2 is declared `concurrency: 2` with no minInstances, so a single dead cold start burns through a queue of crawler POSTs 2 at a time and every one is charged a 500; that is a blast-radius multiplier, not the cause.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — proxyGen2 is declared `{memory: '1GiB', timeoutSeconds: 120, concurrency: 2, ...vpcSettings}` with no minInstances, so /proxy/* traffic is served almost entirely by cold starts at 2 requests per instance — when the platform cannot start containers, 69 requests fail off 4 bad starts. No code defect here; this is the only knob that touches the blast radius.

## Evidence
- 69 matching entries: `(resource.labels.service_name="proxygen2" OR resource.labels.function_name="proxygen2") AND timestamp>="2026-09-01T17:21:23.554Z" AND timestamp<="2026-09-01T17:51:23.554Z" AND httpRequest.status>=500`
- 4 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"EIO: i/o error, read"`
- 8 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"Default STARTUP TCP probe failed"`
- 76 matching entries: `textPayload:"EIO: i/o error, read" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.99

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
