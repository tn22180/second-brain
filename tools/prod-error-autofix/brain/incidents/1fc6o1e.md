fingerprint: 1fc6o1e
service: computeAfterScoreSubscriber
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:27:45.180Z
status: infra
attempt: 1

# IMG-OPT · computeAfterScoreSubscriber · 1fc6o1e

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen1 deploy audit log — the 2026-09-30T14:20–14:21Z UpdateFunction on computeAfterScoreSubscriber failed at the Cloud Build npm install step with `npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz`, an npm-registry-side missing tarball, not app code.

**Mechanism.** protoPayload.methodName is google.cloud.functions.v1.CloudFunctionsService.UpdateFunction on resourceName .../functions/computeAfterScoreSubscriber with status.code 3 (INVALID_ARGUMENT) and status.message 'Build failed: ... npm error code E404 / npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz'. logName is cloudaudit.googleapis.com%2Factivity — a deploy control-plane entry, never a request or an invocation. No stderr entry and no 5xx request exists in the window (stderr=0, requests=0), consistent with the function never having run. The amplifier that lets a registry hiccup break a deploy at all: firebase.json deploys packages/functions as-is (firebase.json:8) and that directory ships no package-lock.json or yarn.lock (only root yarn.lock / root package-lock.json exist, neither of which is uploaded), so Cloud Build runs `npm install` against packages/functions/package.json:24 and floats every transitive version at build time. The repo's own committed resolutions pin ignore to 7.0.5 (yarn.lock:21503) and 5.3.2 (package-lock.json:11811) — neither 7.0.11 — so the 7.0.11 the builder tried to fetch was picked up fresh from registry metadata at 14:20Z and its tarball 404'd. computeAfterScoreSubscriber itself (packages/functions/src/index.js:204) is not implicated; the deploy was fleet-wide, the per-function audit log just names each target.

Confidence: `high` · infra class, not auto-fixed

## Code
- `firebase.json:8` — functions source is packages/functions — that directory is what Cloud Build receives and runs npm install in
- `packages/functions/package.json:24` — the dependency block the builder resolves; no lockfile sits beside it, so transitive versions float per build
- `yarn.lock:21503` — repo pins ignore@7.0.5, not the 7.0.11 the failing build tried to fetch — proves the version came from live registry metadata, not from committed state
- `packages/functions/src/index.js:204` — the alerted function's declaration — unchanged and uninvolved; the error is a deploy audit entry targeting it, not its code

## Evidence
- 1 matching entries: `resource.labels.function_name="computeAfterScoreSubscriber" AND timestamp>="2026-09-30T14:06:26.694Z" AND timestamp<="2026-09-30T14:36:26.694Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.function_name="computeAfterScoreSubscriber" AND timestamp>="2026-09-30T14:06:26.694Z" AND timestamp<="2026-09-30T14:36:26.694Z" AND logName:"cloudaudit.googleapis.com%2Factivity"`

## Job
- analyze rounds: 1
- cost: $1.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
