fingerprint: 1xhq5xp
service: apiv2
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:20:23.529Z
status: infra
attempt: 1

# IMG-OPT · apiv2 · 1xhq5xp

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen2 deploy audit log — anhnt@avada.io's UpdateFunction on apiv2 failed at Cloud Build because npm could not fetch the transitive tarball ignore@7.0.11 (HTTP 404 from registry.npmjs.org). No request failed and no app code ran.

**Mechanism.** The only entry in the 30-min window is logName cloudaudit.googleapis.com%2Factivity, methodName google.cloud.functions.v2.FunctionService.UpdateFunction, resourceName .../functions/apiv2, principalEmail anhnt@avada.io, status.code 3 with message 'Build failed with status: FAILURE ... npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz'. The build resolves dependencies from scratch on every deploy: packages/functions/.gcloudignore ships only package.json, .npmrc, lib/**, templates/** and Dockerfile — no package-lock.json or yarn.lock reaches the builder — and every entry in packages/functions/package.json dependencies is an unpinned caret range, so npm re-resolves the whole transitive graph in Cloud Build against the registry named in .npmrc. When that registry answered 404 for the ignore@7.0.11 tarball at 2026-09-30T14:20:20Z, npm install aborted (E404), the build failed, and the Cloud Functions control plane emitted the failed-operation audit log at 14:21:18.437Z with severity ERROR — the one line the prod-error sink matched. stderr=0 and requests=0 confirm no application execution and no 5xx.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/.gcloudignore:1` — `*` then allowlist of package.json/.npmrc/lib/templates/Dockerfile — no lockfile is uploaded, so Cloud Build resolves the dependency graph fresh on every deploy
- `packages/functions/package.json:24` — dependencies block: every version is a caret/latest range (e.g. cors: 'latest', esbuild: '^0.25.4'), so the transitive graph including ignore@7.0.11 is chosen at build time, not pinned
- `packages/functions/.npmrc:3` — registry=https://registry.npmjs.org/ — the exact host that returned 404 for /ignore/-/ignore-7.0.11.tgz in the build log

## Evidence
- 1 matching entries: `resource.labels.function_name="apiv2" AND logName="projects/app-plaza-image-optimizer/logs/cloudaudit.googleapis.com%2Factivity" AND protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-09-30T14:06:23.050Z" AND timestamp<="2026-09-30T14:36:23.050Z"`
- 0 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-09-30T14:06:23.050Z" AND timestamp<="2026-09-30T14:36:23.050Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.80

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
