fingerprint: orasbc
service: RevertImageCollectionSubscriber
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:25:53.774Z
status: infra
attempt: 1

# IMG-OPT · RevertImageCollectionSubscriber · orasbc

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the alerted ERROR is a Cloud Functions gen1 deploy audit log — the 2026-09-30T14:20Z UpdateFunction build for RevertImageCollectionSubscriber failed because the GCF buildpack's unlocked `npm install` of packages/functions resolved the transitive `ignore@^7.0.3` range to 7.0.11, whose tarball npm registry answered with HTTP 404 (`npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz`).

**Mechanism.** The single alerted entry is logName cloudaudit.googleapis.com%2Factivity, methodName google.cloud.functions.v1.CloudFunctionsService.UpdateFunction, status.code 3, message 'Build failed: ... npm error 404 ... ignore-7.0.11.tgz'. No stderr and no 5xx request logs exist in the window (stderr=0, requests=0), so nothing executed and no invocation failed. firebase.json:8 points the deploy at packages/functions and firebase.json:14 excludes `**/node_modules/**`, so the builder installs dependencies itself; that directory ships no package-lock.json or yarn.lock (only .npmrc), so the root lock — which pins packages/functions/node_modules/ignore at 7.0.5 — is never applied. The build therefore resolves globby@14's `"ignore": "^7.0.3"` (package-lock.json:52540) to the newest published 7.0.11, and the registry's tarball GET for that exact version returned 404 at 2026-09-30T14:20:05Z. All 9 functions in that one deploy (RevertImageCollectionSubscriber, api, apiv2, autoOptimizeImages, computeAfterScoreSubscriber, handleProdErrorAlertGen2, changelogTriggers-{shops,shopInfos,subscriptions}) failed with the identical message in a 38-second span, which is one build-time registry fault, not nine code faults.

Confidence: `high` · infra class, not auto-fixed

## Code
- `firebase.json:8` — deploy source is packages/functions — the directory the GCF builder npm-installs
- `firebase.json:14` — `**/node_modules/**` is excluded from the upload, so the builder must resolve every dependency itself at build time
- `packages/functions/package.json:24` — the shipped manifest's dependencies block; this directory contains no package-lock.json or yarn.lock, so resolution at build time is unpinned
- `package-lock.json:52540` — globby@14 under packages/functions requires `ignore: ^7.0.3`, the range that resolved to the 404-ing 7.0.11

## Evidence
- 9 matching entries: `(protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction" OR protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction") AND protoPayload.status.code=3 AND timestamp>="2026-09-30T13:50:00Z" AND timestamp<="2026-09-30T15:00:00Z"`
- 9 matching entries: `protoPayload.status.code=3 AND protoPayload.status.message:"ignore-7.0.11.tgz" AND timestamp>="2026-09-30T13:50:00Z" AND timestamp<="2026-09-30T15:00:00Z"`
- 9 matching entries: `protoPayload.status.code=3 AND protoPayload.status.message:"ignore-7.0.11.tgz" AND timestamp>="2026-09-24T00:00:00Z"`
- 0 matching entries: `(resource.labels.service_name="RevertImageCollectionSubscriber" OR resource.labels.function_name="RevertImageCollectionSubscriber" OR resource.labels.job_name="RevertImageCollectionSubscriber") AND timestamp>="2026-09-30T14:06:23.127Z" AND timestamp<="2026-09-30T14:36:23.127Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.11

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
