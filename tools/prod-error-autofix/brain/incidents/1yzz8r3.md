fingerprint: 1yzz8r3
service: resetQuotaCycleSchedule
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-08T02:31:45.735Z
status: infra
attempt: 1

# IMG-OPT · resetQuotaCycleSchedule · 1yzz8r3

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single alerted ERROR is a Cloud Functions gen1 deploy audit log — the Firebase CLI's UpdateFunction call on resetQuotaCycleSchedule was rejected by the Cloud Functions control plane at 2026-09-07T04:11:02.720454Z with INVALID_ARGUMENT (code 3, 'The request has errors'), and the same deploy retried at 04:30:29Z and completed successfully at 04:36:07Z.

**Mechanism.** The only log entry in the 30-minute window is logName=projects/app-plaza-image-optimizer/logs/cloudaudit.googleapis.com%2Factivity, protoPayload.@type=google.cloud.audit.AuditLog, methodName=google.cloud.functions.v1.CloudFunctionsService.UpdateFunction, principalEmail=anhnt@avada.io, callerSuppliedUserAgent=FirebaseCLI/13.10.2, resource.type=cloud_function. It is an admin-write control-plane event, not an invocation: there is no request log (requests=0) and no application output (stderr=0, expected on this app per its bare-console logger). The request payload is exactly the deploy shape of the gen1 declaration at packages/functions/src/index.js:230 — entryPoint resetQuotaCycleSchedule, runtime nodejs20, availableMemoryMb 1024 (matching memory:'1GB'), timeout 540s (matching timeoutSeconds:540), eventTrigger google.pubsub.topic.publish on topic firebase-schedule-resetQuotaCycleSchedule-us-central1 (matching .pubsub.schedule('0 2 * * *')). The control plane answered status {code:3,'The request has errors'}; the CLI re-issued UpdateFunction at 04:30:29.704986Z and the operation finished at 04:36:07.039779Z at severity NOTICE with operation.last=true and no status code, i.e. the function deployed. No application code executed and no user request failed. Same class as recorded fingerprints 9z8gy9 (IMG-OPT webhookAppSubscriptionUpdate), 37aerf / 1t95lvv / 1hq8j7p (AEO) — gen1 deploy audit logs surfacing at severity=ERROR into the prod-error-alerts sink.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:230` — The gen1 declaration whose deploy config the rejected UpdateFunction request mirrors field-for-field: memory '1GB' -> availableMemoryMb 1024, timeoutSeconds 540 -> timeout '540s', pubsub.schedule('0 2 * * *') -> eventTrigger on topic firebase-schedule-resetQuotaCycleSchedule-us-central1.

## Evidence
- 1 matching entries: `(resource.labels.service_name="resetQuotaCycleSchedule" OR resource.labels.function_name="resetQuotaCycleSchedule" OR resource.labels.job_name="resetQuotaCycleSchedule") AND timestamp>="2026-09-07T03:56:19.563Z" AND timestamp<="2026-09-07T04:26:19.563Z" AND severity>=ERROR`
- 3 matching entries: `protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction" AND resource.labels.function_name="resetQuotaCycleSchedule" AND timestamp>="2026-09-07T03:00:00Z" AND timestamp<="2026-09-07T06:00:00Z"`
- 1 matching entries: `protoPayload.methodName=~"CloudFunctionsService.(Update|Create)Function" AND timestamp>="2026-09-07T03:00:00Z" AND timestamp<="2026-09-07T06:00:00Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
