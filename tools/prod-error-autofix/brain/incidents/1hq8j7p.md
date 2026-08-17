fingerprint: 1hq8j7p
service: authSa
message: [no message]
app: AEO
repo: llm-ai-search-seo
date: 2026-08-17T04:44:43.041Z
status: infra
attempt: 1

# AEO · authSa · 1hq8j7p

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen1 deploy audit log — a second UpdateFunction on function `authSa` from nghiavt@avadagroup.com (FirebaseCLI/13.35.1) at 2026-08-17T04:37:04.715096Z was rejected with status code 9 (FAILED_PRECONDITION) because the deploy operation started 2m13s earlier at 04:34:51.514662Z was still running.

**Mechanism.** A firebase deploy of seo-on-aeo issued UpdateFunction for `authSa` at 2026-08-17T04:34:51.514662Z, creating operation operations/c2VvLW9uLWFlby91cy1jZW50cmFsMS9hdXRoU2EvMFBXLWtLalVaQ3c (operation.first=True). That operation did not report last=True until 04:39:32.626861Z — a 4m41s window. At 04:37:04.715096Z, inside that window, the CLI (or a retry / second pipeline job) issued a second UpdateFunction for the same function with the same updateMask; the Cloud Functions v1 control plane serializes operations per function and answered code 9 'An operation on function authSa in region us-central1 in project seo-on-aeo is already in progress. Please try again later.' The entry is logName cloudaudit.googleapis.com%2Factivity with severity ERROR, so the prod-error-alerts sink matched it. No application code ran and no request failed (stderr=0, requests=0 in the 30-minute window). The alert message is empty because an AuditLog carries no textPayload and no httpRequest, so the sender's extractMessage had nothing to pull. Same event class as fingerprints 3dzffb (auth, rejected 04:37:04.926397Z) and 85s1po (changelogTriggers-shops, 04:37:04.955606Z) — one fleet-wide deploy-all sweep, one rejected retry per function, all three within 240ms.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:54` — the `export const authSa` Gen1 function whose entryPoint 'authSa' matches the UpdateFunction request (runWith memory '1GB' matches the request's availableMemoryMb: 1024) — named only to identify the deploy target; it did not execute
- `packages/functions/src/handlers/authSa.js:48` — the Koa handler mounted at prefix '/authSa' wired into that export; confirms authSa is an HTTP function (httpsTrigger in the request) and that no invocation-side code path is implicated

## Evidence
- 1 matching entries: `(resource.labels.service_name="authSa" OR resource.labels.function_name="authSa" OR resource.labels.job_name="authSa") AND timestamp>="2026-08-17T04:22:22.888Z" AND timestamp<="2026-08-17T04:52:22.888Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.function_name="authSa") AND timestamp>="2026-08-17T04:22:22Z" AND timestamp<="2026-08-17T04:52:22Z" AND protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction"`

## Job
- analyze rounds: 1
- cost: $0.97

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
