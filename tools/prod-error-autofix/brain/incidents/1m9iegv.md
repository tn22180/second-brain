fingerprint: 1m9iegv
service: api
message: HTTP 500 POST /api/ai-inline
app: BLOG
repo: blogs
date: 2026-08-25T04:56:09.210Z
status: fix_disabled
attempt: 1

# BLOG · api · 1m9iegv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** blogAssist.controller.js calls creditPayload(tokenResult) in getResultAiInline (and getCompletions) but never imports it — its import line only pulls reduceTokens from @functions/helpers/reduceTokens — so every POST /api/ai-inline throws ReferenceError: creditPayload is not defined and returns 500.

**Mechanism.** Commit b2cac34f5 'Wire real token deduction into credits_used across every AI credit-spending endpoint' added `ctx.state.eventPayload = creditPayload(tokenResult)` to 8 controllers plus helpers/processLocaleSummary.js and added `export function creditPayload` to helpers/reduceTokens.js. Seven of those files also changed their import to `import {reduceTokens, creditPayload} from '@functions/helpers/reduceTokens'`; blogAssist.controller.js did not — it still imports only `{reduceTokens}` (line 6, unchanged from disk to avadanet/master tip fd32f793c). Babel emits no compile-time error for a free identifier, so the bare `creditPayload` becomes a runtime global lookup that fails. The statement sits after the awaited reduceTokens() and before `ctx.status = 200`, so the throw lands in getResultAiInline's own catch, which sets 500 and logs '[getResultAiInline] <shopId> AI Inline Error:'. Prod stack `/workspace/lib/controllers/blogAssist.controller.js:154:9` is the babel image of that line (src line 118 on avadanet/master). Revision api-00155-jeh was created 2026-08-25T04:13:07Z; the first failure is 04:53:11Z, and all 3 POST /api/ai-inline requests since are 500. Note: this worktree is 77 commits behind avadanet/master (prod), so the defective line is not on disk here — the fix must be cut against avadanet/master.

Confidence: `high`

## Code
- `packages/functions/src/controllers/blogAssist.controller.js:6` — The import that must become `import {reduceTokens, creditPayload} from '@functions/helpers/reduceTokens'`; identical on disk and on avadanet/master, which is why the identifier is unbound in both getResultAiInline and getCompletions.
- `packages/functions/src/helpers/reduceTokens.js:12` — The module the symbol belongs to — on avadanet/master it also exports `creditPayload` at line 41; on this stale checkout only reduceTokens is exported, confirming the symbol's home.
- `packages/functions/src/routes/api.js:142` — Registers POST /api/ai-inline → blogAssistController.getResultAiInline, tying the alerted endpoint to the throwing function.

## Evidence
- 4 matching entries: `timestamp>="2026-08-18T08:00:00Z" AND "creditPayload is not defined"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/ai-inline" AND timestamp>="2026-08-25T04:30:00Z"`

## Job
- analyze rounds: 1
- cost: $1.91

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
