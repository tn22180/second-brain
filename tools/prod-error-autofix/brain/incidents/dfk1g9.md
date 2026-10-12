fingerprint: dfk1g9
service: auth
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-10-12T07:21:08.396Z
status: infra
attempt: 1

# IMG-OPT · auth · dfk1g9

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen1 deploy audit log — anhnt@avada.io's 2026-10-12T07:17Z mass UpdateFunction sweep of app-plaza-image-optimizer had the `auth` function's update rejected by Google with gRPC code 13 INTERNAL, while the already-deployed revision kept serving 100% successfully.

**Mechanism.** At 2026-10-12T07:17:36.678Z anhnt@avada.io issued google.cloud.functions.v1.CloudFunctionsService.UpdateFunction on projects/app-plaza-image-optimizer/locations/us-central1/functions/auth as part of a ~70-function deploy sweep (07:12:13Z → 07:18:40Z). At 07:18:14.126Z the operation's terminal audit entry (operation.last=true, producer cloudfunctions.googleapis.com, insertId 8boqgncicc) landed in cloudaudit.googleapis.com/activity with status.code=13 and status.message 'The service has encountered an internal error. Please try again later', severity=ERROR. Because the prod-error-alerts sink filters severity>=ERROR on resource.labels.function_name, that audit entry matched and fired the alert with no message body — `auth` is a gen1 function (packages/functions/src/index.js:79), so its own logs go to logName cloudfunctions.googleapis.com/cloud-functions, not to the `stderr` logName the sender's stderr read filtered on, which is why all three pre-pulled reads returned 0 while the function was in fact logging. Nothing in packages/functions/src executed to produce this entry: the Google-side control-plane error has no application stack frame, and the function served 770 × HTTP 200 plus 4 × HTTP 302 (OAuth redirect, 1.06–1.25s) and zero 4xx/5xx across 774 executions in the exact 07:03:16.870Z–07:33:16.870Z alert window, including at 07:18:47Z, 33s after the failed update. `gcloud functions describe auth` still reports status ACTIVE, versionId 282, updateTime 2026-10-09T02:53:57.092Z — so the 2026-10-12 update never applied and the Oct-9 revision is what has been serving; no retry UpdateFunction for `auth` exists anywhere after 07:18:14Z through end of day.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:79` — The alerted resource: `export const auth = functions.runWith({memory: '2GB'}).https.onRequest(authHandler.callback())` — a firebase-functions v1 (gen1) HTTPS function, which is why its runtime logs carry logName cloudfunctions.googleapis.com/cloud-functions and were invisible to the sender's `logName:"stderr"` filter.
- `packages/functions/src/handlers/auth.js:1` — The Koa app behind that export — named only to show no code in it ran for this alert: there is not a single app log line of any severity tied to the 07:18:14.126Z entry, and all 774 of its executions in the window finished 200/302.

## Evidence
- 1 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-10-12T07:18:00Z" AND timestamp<="2026-10-12T07:19:00Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.function_name="auth" OR resource.labels.service_name="auth") AND timestamp>="2026-10-12T00:00:00Z" AND timestamp<="2026-10-12T12:00:00Z" AND severity>=WARNING`
- 82 matching entries: `protoPayload.methodName:"CloudFunctions" AND timestamp>="2026-10-12T06:30:00Z" AND timestamp<="2026-10-12T08:30:00Z"`
- 774 matching entries: `resource.labels.function_name="auth" AND logName="projects/app-plaza-image-optimizer/logs/cloudfunctions.googleapis.com%2Fcloud-functions" AND timestamp>="2026-10-12T07:03:16.870Z" AND timestamp<="2026-10-12T07:33:16.870Z" AND textPayload:"finished with status code"`
- 0 matching entries: `resource.labels.function_name="auth" AND logName="projects/app-plaza-image-optimizer/logs/cloudfunctions.googleapis.com%2Fcloud-functions" AND timestamp>="2026-10-12T00:00:00Z" AND (textPayload:"Error" OR textPayload:"error" OR textPayload:"status code: 5" OR textPayload:"status code: 4")`

## Job
- analyze rounds: 1
- cost: $1.01

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
