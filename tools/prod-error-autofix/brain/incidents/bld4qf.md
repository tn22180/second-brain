fingerprint: bld4qf
service: api
message: [getResultAiInline] yRYPtDkeEmwR3JyYekyx AI Inline Error: ReferenceError: creditPayload is not defined
app: BLOG
repo: blogs
date: 2026-08-25T05:03:08.523Z
status: fix_disabled
attempt: 1

# BLOG · api · bld4qf

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Commit b2cac34f5 added two `ctx.state.eventPayload = creditPayload(tokenResult)` call sites to blogAssist.controller.js but was the only one of the 8 files it touched that never added `creditPayload` to its `import {reduceTokens} from '@functions/helpers/reduceTokens'` line, so every POST /api/ai-inline throws `ReferenceError: creditPayload is not defined` on the deployed build.

**Mechanism.** Deployed revision api-00155-jeh (created 2026-08-25T04:13:07Z) is built from avadanet/master fd32f793c, which contains b2cac34f5 'Wire real token deduction into credits_used across every AI credit-spending endpoint [deploy-changed]'. That commit changed `void reduceTokens(...)` into `const tokenResult = await reduceTokens(...)` followed by `ctx.state.eventPayload = creditPayload(tokenResult)` at avadanet/master blogAssist.controller.js:59 (getCompletions) and :118 (getResultAiInline), and added `export function creditPayload` to helpers/reduceTokens.js:41. Every other file it touched got `import {reduceTokens, creditPayload} from '@functions/helpers/reduceTokens'` (anthropicController.js:6, articleController.js:77, auditAgentController.js:40, genAIBlogController.js:8, genImageAIController.js:11, langGraphController.js:8, toolsYouTubeController.js:8, helpers/processLocaleSummary.js:10); blogAssist.controller.js:6 still reads `import {reduceTokens} from '@functions/helpers/reduceTokens'`. Babel emits the identifier unresolved, so at runtime the line after the successful reduceTokens await throws ReferenceError, the catch at getResultAiInline sets ctx.status = 500 and logs `[getResultAiInline] <shopId> AI Inline Error`. The prod frame /workspace/lib/controllers/blogAssist.controller.js:154:9 is babel output of that src line. NOTE: this worktree is checked out at origin/master 0c2482b28, which is 77 commits behind the deployed avadanet/master — b2cac34f5 is NOT on disk here, so the cited src lines are the pre-commit versions of the exact lines the commit modified/should have modified.

Confidence: `high`

## Code
- `packages/functions/src/controllers/blogAssist.controller.js:6` — The defective import. On disk and on deployed avadanet/master this is identical: `import {reduceTokens} from '@functions/helpers/reduceTokens';` — b2cac34f5 added creditPayload call sites to this file but left this line alone.
- `packages/functions/src/controllers/blogAssist.controller.js:110` — End of the getResultAiInline reduceTokens block; on avadanet/master b2cac34f5 rewrote this block and inserted `ctx.state.eventPayload = creditPayload(tokenResult)` right after it at line 118 — the line the prod stack maps to (lib:154).
- `packages/functions/src/helpers/reduceTokens.js:35` — Last line of the file on disk; b2cac34f5 appended `export function creditPayload(tokenResult)` here (avadanet/master line 41). The symbol exists and is exported — only the import in blogAssist.controller.js is missing.
- `packages/functions/src/controllers/genAIBlogController.js:8` — Sibling controller whose identical import line the same commit DID update to `{reduceTokens, creditPayload}` — proves the omission in blogAssist.controller.js was an oversight, not a different pattern.
- `packages/functions/src/routes/api.js:142` — `router.post('/ai-inline', blogAssistController.getResultAiInline)` — ties the alerted endpoint to the defective handler.
- `packages/functions/src/routes/api.js:139` — `router.post('/blog-assist', blogAssistController.getCompletions)` — second, currently untrafficked endpoint carrying the same missing-import defect (avadanet/master line 59).

## Evidence
- 3 matching entries: `resource.labels.service_name="api" AND severity>=ERROR AND jsonPayload.error.message="creditPayload is not defined" AND timestamp>="2026-08-25T04:38:25Z" AND timestamp<="2026-08-25T05:08:25Z"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.status>=500 AND timestamp>="2026-08-25T04:38:25Z" AND timestamp<="2026-08-25T05:08:25Z"`
- 3 matching entries: `resource.labels.service_name="api" AND severity>=ERROR AND jsonPayload.error.message="creditPayload is not defined" AND timestamp>="2026-08-18T00:00:00Z"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/ai-inline" AND timestamp>="2026-08-25T00:00:00Z"`

## Job
- analyze rounds: 2
- cost: $3.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
