fingerprint: ualqkr
service: aeoAuditRescanSubscriber
message: [no message]
app: AEO
repo: llm-ai-search-seo
date: 2026-08-17T04:43:40.722Z
status: infra
attempt: 1

# AEO · aeoAuditRescanSubscriber · ualqkr

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen1 deploy audit log — a second UpdateFunction on function `aeoAuditRescanSubscriber` from nghiavt@avadagroup.com (FirebaseCLI/13.35.1) at 2026-08-17T04:37:04.741481Z was rejected with status code 9 (FAILED_PRECONDITION) because the deploy operation started 2m13s earlier at 04:34:51.511948Z was still in progress.

**Mechanism.** A firebase deploy of seo-on-aeo issued UpdateFunction for aeoAuditRescanSubscriber at 2026-08-17T04:34:51.511948Z, creating operation operations/c2VvLW9uLWFlby91cy1jZW50cmFsMS9hZW9BdWRpdFJlc2NhblN1YnNjcmliZXIvMW9wS05KT3VvS2c (operation.first=True). That operation did not report last=True until 04:39:14.440101Z — a 4m23s window. At 04:37:04.741481Z, inside that window, the CLI issued a second UpdateFunction for the same function with the same updateMask (request.function.entryPoint='aeoAuditRescanSubscriber', eventTrigger topic projects/seo-on-aeo/topics/aeoAuditRescan, availableMemoryMb 2048, timeout 540s); the Cloud Functions v1 control plane serializes operations per function and answered code 9 'An operation on function aeoAuditRescanSubscriber in region us-central1 in project seo-on-aeo is already in progress. Please try again later.' The entry is logName cloudaudit.googleapis.com%2Factivity with severity ERROR, so the prod-error-alerts sink matched it. No application code ran and no message was processed (stderr=0, requests=0 over the 30-minute window). The alert message is empty because an AuditLog carries no textPayload and no httpRequest, so the sender's extractMessage had nothing to pull. Same event class and same deploy sweep as fingerprints 3dzffb (auth, rejected 04:37:04.926397Z) and 85s1po (changelogTriggers-shops, 04:37:04.955606Z) — one fleet-wide deploy-all, one rejected retry per function, all within 215ms.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:56` — the Gen1 pubsub-subscriber export block; note that no `aeoAuditRescanSubscriber` export exists anywhere under packages/ on this branch (main) — the deploy target ships from another ref, further confirming nothing in this worktree's request path executed
- `packages/functions/src/services/aeoAudit/aeoAuditService.js:26` — rescanAudit — the AEO rescan logic the deployed subscriber wraps; named only to identify the deploy target, it did not run (stderr=0 in the window)

## Evidence
- 1 matching entries: `(resource.labels.service_name="aeoAuditRescanSubscriber" OR resource.labels.function_name="aeoAuditRescanSubscriber" OR resource.labels.job_name="aeoAuditRescanSubscriber") AND timestamp>="2026-08-17T04:22:19.773Z" AND timestamp<="2026-08-17T04:52:19.773Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.function_name="aeoAuditRescanSubscriber") AND timestamp>="2026-08-17T04:22:19Z" AND timestamp<="2026-08-17T04:52:19Z" AND protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction"`

## Job
- analyze rounds: 2
- cost: $1.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
