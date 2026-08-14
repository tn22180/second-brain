fingerprint: 1her4w8
service: authgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T04:44:33.662Z
status: infra
attempt: 1

# SEO · authgen2 · 1her4w8

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprints 1e908f9 / mumebf (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 on 2026-08-14 04:05–04:19Z kept authgen2 from replacing its single warm instance — 66 startup TCP probes failed with DEADLINE_EXCEEDED and 5 more containers died with `Error: EIO: i/o error, read` while requiring files out of /workspace/node_modules — so POST /auth/webhook/shop/update was answered 500 before any container existed.

**Mechanism.** authgen2 runs on revision authgen2-00320-qaz, created 2026-08-13T09:10:06Z — 19h before the window, no deploy inside it. The alerted string 'The request failed because the instance failed the readiness check.' is one of three Cloud Run rejection variants emitted by the SAME event: in this 30-min window the service logged 10 'failed the readiness check', 3029+ 'instance could not start successfully' (the 200-entry requests read is truncated; the full read over 03:30–05:00Z counted 4888 5xx) and 1848 'no available instance' — every one a POST /auth/webhook/shop/update with httpRequest.latency 0s, i.e. rejected by the front end, never dispatched to app code. The 5 stderr entries are the only app-visible trace and they exonerate the app: 'Provided module can\'t be loaded.' → 'Detailed stack trace: Error: EIO: i/o error, read' at node:fs readFileSync/readSync during CJS and ESM module load of /workspace/node_modules/googleapis/build/src/apis/sheets/index.js, .../cloudfunctions/index.js and three ESM requires, on 5 distinct instanceIds (001548f729a6ff5a, 001548f7298356d2, 001548f729f62978, 001548f729ec2467, 001548f729d913f8), all the same unchanged revision. EIO on the read-only container image filesystem cannot be produced by JavaScript in this repo, and the same image loaded fine on the 8 starts that succeeded and for the 19h before. P3 OOM is ruled out: zero 'Memory limit … exceeded' lines for authgen2 in the window against a declared 1GiB. Recovery at 04:19:26Z was spontaneous — no deploy, no config change. The only app-side contribution is exposure, not cause: authGen2 is declared with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:83), so all shop/update webhook traffic rides one instance and its loss blackholes the endpoint until a replacement starts; the 674 req/min peak is Shopify's own webhook redelivery of the 500s, not a load surge.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:82` — authGen2 export — the Cloud Run service whose cold starts failed the readiness/startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:83` — {memory: '1GiB', region: 'us-central1', ...vpcSettings} — no minInstances, so a single instance carries every /auth/webhook/shop/update and there is no warm spare when a container-start fault hits; 1GiB with zero OOM lines rules out P3

## Evidence
- 10 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:36Z" AND textPayload:"failed the readiness check"`
- 66 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:36Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:36Z" AND textPayload:"EIO: i/o error"`
- 5 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:36Z" AND textPayload:"Could not load the function"`
- 2000 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:54:35Z" AND timestamp<="2026-08-14T04:24:36Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.42

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
