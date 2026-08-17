fingerprint: 1t95lvv
service: aggregateAiReferralsScheduler
message: [no message]
app: AEO
repo: llm-ai-search-seo
date: 2026-08-17T04:45:48.753Z
status: infra
attempt: 1

# AEO · aggregateAiReferralsScheduler · 1t95lvv

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen1 deploy audit log — a second UpdateFunction on `aggregateAiReferralsScheduler` from nghiavt@avadagroup.com (FirebaseCLI/13.35.1) at 2026-08-17T04:37:04.913171Z was rejected with status code 9 (FAILED_PRECONDITION) because the deploy operation started 2m13s earlier at 04:34:51.496676Z was still in progress.

**Mechanism.** A firebase deploy of seo-on-aeo issued UpdateFunction for `aggregateAiReferralsScheduler` at 2026-08-17T04:34:51.496676Z, creating operation operations/c2VvLW9uLWFlby91cy1jZW50cmFsMS9hZ2dyZWdhdGVBaVJlZmVycmFsc1NjaGVkdWxlci9lbWdSaTdPcDhiYw with operation.first=True. That operation did not report last=True until 04:39:15.843086Z — a 4m24s window. At 04:37:04.913171Z, inside that window, the CLI (or a retry / second pipeline job) issued a second UpdateFunction for the same function with the same updateMask and the same firebase-functions-hash 7419a1cb60839be45c07c6093523a3c9ad916c61; the Cloud Functions v1 control plane serializes operations per function and answered code 9 'An operation on function aggregateAiReferralsScheduler in region us-central1 in project seo-on-aeo is already in progress. Please try again later.' A third, successful UpdateFunction followed at 04:43:48.611931Z. The entry is logName cloudaudit.googleapis.com%2Factivity with severity ERROR, so the prod-error-alerts sink matched it. No application code ran and no request failed (stderr=0, requests=0 over the 30-minute window). The alert message is empty because an AuditLog carries no textPayload and no httpRequest, so the sender's extractMessage had nothing to pull. Same event class and same deploy sweep as already-recorded fingerprints 3dzffb (auth, rejected 04:37:04.926397Z), 85s1po (changelogTriggers-shops, 04:37:04.955606Z), ualqkr and 1hq8j7p — one fleet-wide deploy-all, one rejected retry per function, all within ~50ms of each other.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:75` — the `export const aggregateAiReferralsScheduler` Gen1 export whose entryPoint 'aggregateAiReferralsScheduler' matches the UpdateFunction request (runWith memory '512MB' matches availableMemoryMb: 512, timeoutSeconds 300 matches timeout '300s', pubsub.schedule matches eventTrigger google.pubsub.topic.publish on firebase-schedule-aggregateAiReferralsScheduler-us-central1) — named only to identify the deploy target; it did not execute
- `packages/functions/src/index.js:79` — the `.onRun(fanoutAiReferralAggregation)` wiring; confirms the scheduler's only runtime path is the 15-minute cron fan-out, none of which appears in the window — no invocation-side code is implicated

## Evidence
- 1 matching entries: `(resource.labels.service_name="aggregateAiReferralsScheduler" OR resource.labels.function_name="aggregateAiReferralsScheduler" OR resource.labels.job_name="aggregateAiReferralsScheduler") AND timestamp>="2026-08-17T04:22:23.350Z" AND timestamp<="2026-08-17T04:52:23.350Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-08-17T04:22:23Z" AND timestamp<="2026-08-17T04:52:23Z" AND protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction"`

## Job
- analyze rounds: 1
- cost: $0.94

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
