fingerprint: b9a2xu
service: changelogTriggers-shops
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-01T07:23:15.820Z
status: infra
attempt: 1

# IMG-OPT · changelogTriggers-shops · b9a2xu

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen2 deploy audit log — anhnt@avada.io's UpdateFunction on changelogTriggers-shops at 2026-09-30T14:21:09Z failed its Cloud Build because npm could not fetch the transitive dependency tarball https://registry.npmjs.org/ignore/-/ignore-7.0.11.tgz (npm error code E404, '404 Not Found'). No request failed and no application code ran.

**Mechanism.** The alerted entry is logName cloudaudit.googleapis.com%2Factivity, protoPayload.methodName google.cloud.functions.v2.FunctionService.UpdateFunction, status.code 3, resourceName projects/app-plaza-image-optimizer/locations/us-central1/functions/changelogTriggers-shops — a deploy of the gen2 Firestore trigger declared at packages/functions/src/config/changelog.js:8, not an invocation of it. The build step was `npm install` inside the packed packages/functions directory; that directory ships no package-lock.json, so npm resolves every caret range fresh at build time. globby 14.1.0 (a transitive dep of the functions bundle) declares `ignore: ^7.0.3` (package-lock.json:52540), which npm resolved to 7.0.11, and registry.npmjs.org answered 404 for that version's tarball at 2026-09-30T14:20:03Z (per the npm debug log path in the build message). npm aborted, Cloud Build returned FAILURE, and the Cloud Functions control plane wrote the failure as a severity=ERROR audit entry — which is the only thing the prod-error-alerts sink (severity>=ERROR) can see on this app, hence stderr=0 and requests=0.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelogTriggers is produced by changelog.registerV2 — the alerted resourceName changelogTriggers-shops is this declaration's deploy target, confirming the ERROR is about deploying the function, not running it
- `package-lock.json:52540` — globby 14.1.0 under packages/functions declares `ignore: ^7.0.3`; the repo pins 7.0.5 (package-lock.json:53389) but the Cloud Build has no lockfile, so the caret range floated to the 7.0.11 tarball that 404'd

## Evidence
- 1 matching entries: `(resource.labels.service_name="changelogTriggers-shops" OR resource.labels.function_name="changelogTriggers-shops" OR resource.labels.job_name="changelogTriggers-shops") AND timestamp>="2026-09-30T14:06:23.077Z" AND timestamp<="2026-09-30T14:36:23.077Z" AND severity>=ERROR`
- 0 matching entries: `(resource.labels.service_name="changelogTriggers-shops" OR resource.labels.function_name="changelogTriggers-shops" OR resource.labels.job_name="changelogTriggers-shops") AND timestamp>="2026-09-30T14:06:23.077Z" AND timestamp<="2026-09-30T14:36:23.077Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.78

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
