fingerprint: 171glpo
service: changelogTriggers-shopInfos
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:34:53.431Z
status: fix_disabled
attempt: 1

# IMG-OPT · changelogTriggers-shopInfos · 171glpo

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a runtime failure: anhnt@avada.io's 2026-09-30T14:20Z prod deploy of app-plaza-image-optimizer failed its Cloud Build npm install because packages/functions ships no lockfile, so the floating transitive range ignore@^7.0.3 (via critical 7.1.1 → globby ^14.0.1) resolved to 7.0.11, whose tarball answered HTTP 404 from registry.npmjs.org.

**Mechanism.** firebase.json:8 deploys `packages/functions` as the functions source, and firebase.json:9 only runs the babel `production` build — no lockfile is generated or present in that directory (only the monorepo-root package-lock.json exists), so Cloud Build runs a fresh `npm install` instead of `npm ci` and every caret range re-resolves at build time. packages/functions/package.json:48 pins `critical: 7.1.1`, which depends on `globby: ^14.0.1` (package-lock.json:49826); globby 14.1.0 depends on `ignore: ^7.0.3` (package-lock.json:52540). The root lockfile had that resolved at 7.0.5 (package-lock.json:53388-53389), but with no lockfile in the upload npm picked 7.0.11 and GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz (the registry set at packages/functions/.npmrc:3) returned `npm error code E404`. npm aborted, Cloud Build af8f366c-e647-4231-9b59-e3023abbc603 ended `Build failed with status: FAILURE`, and each cloudfunctions UpdateFunction operation recorded an AuditLog with status.code 3 at severity=ERROR — which is the only thing the prod-error-alerts sink (severity>=ERROR) could match for this service, so the alert arrived with [no message]. changelogTriggers-shopInfos never ran any application code in this window: stderr=0, requests=0.

Confidence: `high`

## Code
- `firebase.json:8` — functions deploy source is packages/functions — the directory uploaded to Cloud Build, which contains no package-lock.json, so npm install floats every range
- `firebase.json:9` — the only predeploy step is the babel build; nothing emits or validates a lockfile for the deployed source
- `packages/functions/package.json:48` — `critical: 7.1.1` is the direct dependency whose transitive chain (globby ^14.0.1 → ignore ^7.0.3) floated to the 404 version
- `package-lock.json:52540` — globby 14.1.0 declares `ignore: ^7.0.3`, the unpinned range that resolved to 7.0.11 on the build host
- `package-lock.json:53388` — the root monorepo lock resolves packages/functions/node_modules/ignore to 7.0.5 — a version that installs fine; this lock is never shipped to Cloud Build, which is why the build diverged
- `packages/functions/.npmrc:3` — sets registry=https://registry.npmjs.org/, the registry that answered 404 for ignore-7.0.11.tgz

## Evidence
- 1 matching entries: `(resource.labels.service_name="changelogTriggers-shopInfos" OR resource.labels.function_name="changelogTriggers-shopInfos" OR resource.labels.job_name="changelogTriggers-shopInfos") AND timestamp>="2026-09-30T14:06:38.866Z" AND timestamp<="2026-09-30T14:36:38.866Z" AND severity>=ERROR`
- 9 matching entries: `logName="projects/app-plaza-image-optimizer/logs/cloudaudit.googleapis.com%2Factivity" AND protoPayload.status.code=3 AND protoPayload.status.message:"ignore-7.0.11" AND timestamp>="2026-09-30T14:00:00Z" AND timestamp<="2026-09-30T15:00:00Z"`
- 0 matching entries: `(resource.labels.service_name="changelogTriggers-shopInfos" OR resource.labels.function_name="changelogTriggers-shopInfos") AND timestamp>="2026-09-30T14:06:38.866Z" AND timestamp<="2026-09-30T14:36:38.866Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $3.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
