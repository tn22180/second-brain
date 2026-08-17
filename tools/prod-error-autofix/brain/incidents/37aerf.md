fingerprint: 37aerf
service: cleanupAiReferralVisitsScheduler
message: [no message]
app: AEO
repo: llm-ai-search-seo
date: 2026-08-17T10:34:11.594Z
status: infra
attempt: 1

# AEO · cleanupAiReferralVisitsScheduler · 37aerf

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen1 deploy audit log — the 2026-08-17T10:29:22.876Z UpdateFunction on `cleanupAiReferralVisitsScheduler` (FirebaseCLI/13.35.1, nghiavt@avadagroup.com) was rejected with code 3 INVALID_ARGUMENT 'The request has errors' because it reused sourceToken 7c9161ca-b8f0-4cd6-8fa2-735774f62dc1 after that token's own batch had already finished, so the function alone was skipped by the deploy and still runs the 09:06:15Z build.

**Mechanism.** A deploy-all sweep of seo-on-aeo issued 21 UpdateFunction requests between 10:25:25Z and 10:29:22Z, in waves that share a build via `sourceToken`. Wave 3 (token 7c9161ca-b8f0-4cd6-8fa2-735774f62dc1) fired 10 requests at 10:28:42.604–42.898Z; all 10 started operations and reported last=True by 10:29:22.870Z. The 11th request carrying that same token — `cleanupAiReferralVisitsScheduler` at 10:29:22.876122Z, 6 ms after the token's last sibling operation completed — was rejected outright by the v1 control plane: no operation was created (no operation.first entry for this function in the window), status code 3, message 'The request has errors'. The request is otherwise byte-identical in shape to accepted sibling `llmsTxtSyncSubscriber` (same token, same updateMask, same firebase-functions-hash 4db4caf7060c50f365608560a2c684a3632fad2f, same availableMemoryMb 512, same timeout 540s), so config validity is not the cause; and code 3 is not the code 9 FAILED_PRECONDITION 'operation already in progress' seen on fingerprints 3dzffb / 85s1po. No application code ran: stderr=0 and requests=0 for the whole window (the function is a Firestore/Pub/Sub scheduler, `0 3 * * 0`, so there is no httpRequest by definition). The alert message is empty because an AuditLog carries no textPayload and no httpRequest, so the sender's extractMessage had nothing to pull. Operational consequence: `gcloud functions describe` shows the function ACTIVE at updateTime 2026-08-17T09:06:15.726Z with label firebase-functions-hash=584c1a00217cf2462d0dbd7a3c2bb778c53a7b58, while the other 20 functions carry 4db4caf7… — this one scheduler is running pre-sweep code, and no further deploy entry exists for it after 10:29:23Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:87` — the `export const cleanupAiReferralVisitsScheduler` Gen1 declaration whose entryPoint, memory '512MB' and timeoutSeconds 540 match the rejected UpdateFunction request (availableMemoryMb 512, timeout 540s) — identifies the deploy target; it did not execute
- `packages/functions/src/handlers/scheduled/cleanupAiReferralVisits.js:13` — the scheduled handler wired into that export; confirms it is a Pub/Sub schedule (`0 3 * * 0` UTC), i.e. no request path is implicated and the stale build is the only user-visible effect

## Evidence
- 1 matching entries: `(resource.labels.service_name="cleanupAiReferralVisitsScheduler" OR resource.labels.function_name="cleanupAiReferralVisitsScheduler" OR resource.labels.job_name="cleanupAiReferralVisitsScheduler") AND timestamp>="2026-08-17T10:14:30.054Z" AND timestamp<="2026-08-17T10:44:30.054Z" AND severity>=ERROR`
- 21 matching entries: `protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction" AND timestamp>="2026-08-17T10:20:00Z" AND timestamp<="2026-08-17T10:35:00Z"`
- 1 matching entries: `protoPayload.methodName="google.cloud.functions.v1.CloudFunctionsService.UpdateFunction" AND protoPayload.status.code=3 AND timestamp>="2026-08-17T10:00:00Z" AND timestamp<="2026-08-17T11:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
