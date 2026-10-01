fingerprint: 10poefd
service: api
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:21:32.670Z
status: infra
attempt: 1

# IMG-OPT · api · 10poefd

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen1 deploy audit log — the UpdateFunction build for function `api` in app-plaza-image-optimizer failed at npm install because registry.npmjs.org answered HTTP 404 for the transitive tarball `ignore@7.0.11`.

**Mechanism.** protoPayload.methodName=google.cloud.functions.v1.CloudFunctionsService.UpdateFunction on resourceName .../functions/api returns status.code=3 with message 'Build failed: ... npm error code E404 / npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz - Not found' (npm debug log 2026-09-30T14_20_06_160Z, Error ID 7fa33aaa). The deploy source carries no lockfile for the functions package — packages/functions has package.json only (no package-lock.json / yarn.lock in that directory), and every dependency there is a floating caret range, so Cloud Build re-resolves the whole tree from the public registry on each deploy. `ignore` is a transitive dep, so resolution picked 7.0.11, whose tarball the registry did not serve at that moment, and the build aborted. No container ever started: stderr=0 and requests=0 in the same 30-minute window, so no request failed and no application code executed.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/package.json:24` — Deployed functions package declares only floating caret ranges and ships without a lockfile in this directory, so Cloud Build resolves the transitive tree (including `ignore`) fresh from registry.npmjs.org at deploy time — one unavailable upstream tarball fails the whole build.

## Evidence
- 1 matching entries: `resource.type="cloud_function" AND resource.labels.function_name="api" AND protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction" AND severity>=ERROR AND timestamp>="2026-09-30T14:06:23.072Z" AND timestamp<="2026-09-30T14:36:23.072Z"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-30T14:06:23.072Z" AND timestamp<="2026-09-30T14:36:23.072Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
