fingerprint: 1g5ensn
service: api
message: [getVisionCompletion] Error: 400 URL did not return an image (received text/error content): <https://repairpal.com/timing-chain>
app: BLOG
repo: blogs
date: 2026-08-12T16:58:43.693Z
status: mr_open
attempt: 1

# BLOG · api · 1g5ensn

**Outcome.** duplicate of s0kn2e — MR https://gitlab.com/avada/blogs/-/merge_requests/860

**Root cause.** Not a request failure: getVisionCompletion already catches the provider's HTTP 400 for a non-image <img src> and returns null, but logs it at logger.error (severity ERROR), so the prod-error-alerts sink pages on an error the code has fully handled and whose request returned 200.

**Mechanism.** The merchant article body contains an <img> whose src is an HTML page URL (https://repairpal.com/timing-chain), not an image. generateImageAltText extracts it with the imgRegex and passes it to getVisionCompletion (packages/functions/src/services/auditAgent/chains.js:488). OpenRouter fetches the URL, gets text/html, and answers HTTP 400 'URL did not return an image (received text/error content)'. getVisionCompletion's catch logs it at logger.error (openAi.service.js:229) and returns null (openAi.service.js:230). Back in the loop, `if (altText)` (chains.js:493) is false, so that one image is skipped, the loop continues, and fixAuditIssue sets ctx.status = 200 (auditAgentController.js:144). Because helpers/logger.js emits a real `severity` field for BLOG, that swallowed 400 lands in the sink as ERROR and fires the alert. Both error entries in the window (09:35:46.740Z, 09:36:27.267Z, distinct execution_ids n1dgyj0a99d8 / n1ec4ndpgjc5, same instance 001548f729f6…) sit inside POST /api/audit-agent/fix-issue requests that logged status 200 at 09:35:45.684Z (1.05s) and 09:36:26.081Z (1.18s). Zero request logs with status>=500 in the 30-minute window.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:229` — logger.error('[getVisionCompletion]', e) — logs an already-handled provider 400 at ERROR severity, which is what the sink alerts on
- `packages/functions/src/services/openAi.service.js:230` — returns null instead of throwing; the JSDoc above (line 206) states 'Returns content string, or null on error' — the failure is by design non-fatal
- `packages/functions/src/services/auditAgent/chains.js:488` — the only caller: passes the raw <img src> scraped from merchant body HTML straight to the vision model, with no check that it is an image
- `packages/functions/src/services/auditAgent/chains.js:493` — `if (altText)` — a null result silently skips that one image and the for-loop continues to the next; nothing propagates
- `packages/functions/src/controllers/auditAgentController.js:144` — ctx.status = 200 on the success path — matches the three 200 request logs, proving the alert is not a user-facing failure
- `packages/functions/src/helpers/logger.js:82` — logger.warn writes severity 'WARNING', below the prod-error-alerts sink threshold — the correct level for this handled case

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-10T09:21:01.947Z" AND timestamp<="2026-08-10T09:51:01.947Z" AND jsonPayload.tag="[getVisionCompletion]"`
- 5 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-10T09:35:00Z" AND timestamp<="2026-08-10T09:37:30Z" AND httpRequest.requestUrl:"audit-agent"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-10T09:21:01.947Z" AND timestamp<="2026-08-10T09:51:01.947Z" AND severity>=ERROR`
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-09T09:00:00Z" AND timestamp<="2026-08-11T09:00:00Z" AND jsonPayload.tag="[getVisionCompletion]"`

## Job
- analyze rounds: 1
- cost: $1.18
- MR: https://gitlab.com/avada/blogs/-/merge_requests/860

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
