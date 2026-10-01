fingerprint: 1f3vgxm
service: handleProdErrorAlertGen2
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:18:48.465Z
status: infra
attempt: 1

# IMG-OPT · handleProdErrorAlertGen2 · 1f3vgxm

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen2 deploy audit log — anhnt@avada.io's 2026-09-30T14:21:05.981Z UpdateFunction on handleProdErrorAlertGen2 failed at the Cloud Build step because npm answered HTTP 404 to GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz while installing packages/functions dependencies.

**Mechanism.** The audit entry is logName=cloudaudit.googleapis.com%2Factivity, methodName=google.cloud.functions.v2.FunctionService.UpdateFunction, status.code=3, message 'Build failed with status: FAILURE ... npm error code E404 / npm error 404 Not Found - GET https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz' (Cloud Build ac06a30f-441c-4ed1-825f-f92eefab3385, npm debug log 2026-09-30T14_20_03_201Z). No stderr and no httpRequest entries exist in the 30-minute window (stderr=0, requests=0), so handleProdErrorAlertGen2 never ran and never threw — the function body at packages/functions/src/index.js:320 is not involved. packages/functions ships a package.json with no lockfile beside it (only package.json exists in that directory; the repo's package-lock.json at root pins ignore@5.3.2), so Cloud Build resolves the dependency tree fresh on every deploy and picked the then-unfetchable ignore@7.0.11 tarball. The same npm 404 killed 5 of the 10 UpdateFunction operations in the window — handleProdErrorAlertGen2, apiv2, changelogTriggers-shops, changelogTriggers-shopInfos, changelogTriggers-subscriptions all returned status.code=3 — which is why this is a registry/deploy fault and not a per-function defect.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:320` — handleProdErrorAlertGen2 is the function named in resourceName; its body is a one-line onMessagePublished delegation and never executed in this window — cited to show the alert is not pointing at runtime code
- `packages/functions/package.json:24` — the dependencies block Cloud Build installs; packages/functions has no package-lock.json/yarn.lock beside it, so transitive resolution (here `ignore`) floats at deploy time instead of being pinned

## Evidence
- 1 matching entries: `(resource.labels.service_name="handleProdErrorAlertGen2" OR resource.labels.function_name="handleProdErrorAlertGen2" OR resource.labels.job_name="handleProdErrorAlertGen2") AND timestamp>="2026-09-30T14:06:23.047Z" AND timestamp<="2026-09-30T14:36:23.047Z" AND severity>=ERROR`
- 20 matching entries: `logName="projects/app-plaza-image-optimizer/logs/cloudaudit.googleapis.com%2Factivity" AND protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-09-30T14:06:23.047Z" AND timestamp<="2026-09-30T14:36:23.047Z"`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
