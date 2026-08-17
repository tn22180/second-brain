fingerprint: 3dzffb
service: auth
message: [no message]
app: AEO
repo: llm-ai-search-seo
date: 2026-08-17T04:41:05.446Z
status: infra
attempt: 1

# AEO · auth · 3dzffb

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen1 deploy audit log — a second UpdateFunction on function `auth` from nghiavt@avadagroup.com (FirebaseCLI/13.35.1) at 2026-08-17T04:37:04.926397Z was rejected with status code 9 (FAILED_PRECONDITION) because the deploy operation started 2m13s earlier at 04:34:51.620378Z was still running.

**Mechanism.** A firebase deploy of seo-on-aeo issued UpdateFunction for `auth` at 2026-08-17T04:34:51.620378Z, creating operation operations/c2VvLW9uLWFlby91cy1jZW50cmFsMS9hdXRoL3Z6RzZzRFZzcTZF (operation.first=True). That operation did not report last=True until 04:39:12.765262Z — a 4m21s window. At 04:37:04.926397Z, inside that window, the CLI (or a retry / second pipeline job) issued a second UpdateFunction for the same function with the same updateMask; the Cloud Functions v1 control plane serializes operations per function and answered code 9 'An operation on function auth in region us-central1 in project seo-on-aeo is already in progress. Please try again later.' The entry is logName cloudaudit.googleapis.com%2Factivity with severity ERROR, so the prod-error-alerts sink matched it. No application code ran and no request failed (stderr=0, requests=0 in the 30-minute window). The alert message is empty because an AuditLog carries no textPayload and no httpRequest, so the sender's extractMessage had nothing to pull. This is the same event class as fingerprint 85s1po (changelogTriggers-shops, rejected at 04:37:04.955606Z, 29ms later) — one fleet-wide deploy-all sweep, one rejected retry per function.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:50` — the `export const auth` Gen1 function whose entryPoint 'auth' matches the UpdateFunction request (runWith memory '4GB' matches the request's availableMemoryMb: 4096) — named only to identify the deploy target; it did not execute
- `packages/functions/src/handlers/auth.js:1` — the Koa handler wired into that export; confirms `auth` is an HTTP function (httpsTrigger in the request) and that no invocation-side code path is implicated

## Evidence
- 1 matching entries: `(resource.labels.service_name="auth" OR resource.labels.function_name="auth" OR resource.labels.job_name="auth") AND timestamp>="2026-08-17T04:22:19.719Z" AND timestamp<="2026-08-17T04:52:19.719Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.function_name="auth") AND timestamp>="2026-08-17T04:22:19Z" AND timestamp<="2026-08-17T04:52:19Z" AND protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction"`

## Job
- analyze rounds: 1
- cost: $0.98

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
