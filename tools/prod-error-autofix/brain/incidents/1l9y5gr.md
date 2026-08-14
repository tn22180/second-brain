fingerprint: 1l9y5gr
service: apigen2
message: HTTP 500 GET /api/dev
app: SEO
repo: seo
date: 2026-08-14T03:05:02.947Z
status: mr_open
attempt: 2

# SEO · apigen2 · 1l9y5gr

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2199

**Root cause.** packages/functions/src/controllers/devController.js uses the identifier `CHECKLIST_KEY` in the `done_checklist` branch of testOnly but the file never imports it from '@functions/const/seoIssues', so every GET /api/dev?x=done_checklist throws ReferenceError and returns 500.

**Mechanism.** The Dev Zone page for hhwings.myshopify.com (shop drphDXJQ4bhpWcMftsJn) issued 4 GET /api/dev?x=done_checklist calls at 01:21:46–01:22:03Z. All route to testOnly (packages/functions/src/controllers/devController.js:194), which dispatches on ctx.query.x and enters `case 'done_checklist'` (:1385). Building the updateChecklist payload evaluates the computed keys `[`${CHECKLIST_KEY}.scanning`]` (:1390) and `[`${CHECKLIST_KEY}.lastScanAt`]` (:1391). `CHECKLIST_KEY` is exported from packages/functions/src/const/seoIssues.js:42 and imported by localStorageController.js:6, seoController.js:76, recalcChecklistScore.js:1, internalTools.js:10 — but devController.js has no import for it (grep over the file's 162 import lines returns zero hits for 'seoIssues'; the only two occurrences of the symbol are the two uses). Node therefore throws `ReferenceError: CHECKLIST_KEY is not defined`, exactly as prod reports: 8 stderr lines (4× [api] + 4× [unhandledError]) with stack `at /workspace/lib/controllers/devController.js:1431:17 ... at async testOnly (/workspace/lib/controllers/devController.js:144:14)` (lib line ≠ src line; symbol match). Koa's unhandledError handler answered 500 with a 1028-byte body. Latency 0.45–0.71s across 3 distinct instances — consistent with failing right after getShopById/initShopify, not with a Firestore or Shopify stall; Audit.getChecklistId never ran and no checklist doc was written. The `done_checklist` case was added whole by merge 23716a3f07 (2026-07-28) without the accompanying import — same defect family as fingerprints 1tb355r/xg7e5b (`shopifyConfig` not defined) and attempt 1 of this fingerprint (`appConfig` not defined), all in this same file.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:1390` — `[`${CHECKLIST_KEY}.scanning`]` — first evaluation of the undefined identifier; this is the line the prod stack maps to (lib:1431).
- `packages/functions/src/controllers/devController.js:1391` — second use of `CHECKLIST_KEY` in the same updateChecklist payload.
- `packages/functions/src/controllers/devController.js:194` — testOnly(ctx) — the handler named in the prod stack (lib:144); dispatches on ctx.query.x.
- `packages/functions/src/controllers/devController.js:1385` — `case 'done_checklist':` — the branch the 4 failing requests entered.
- `packages/functions/src/const/seoIssues.js:42` — `export const CHECKLIST_KEY = 'avada-seo-checklist';` — the missing import's source.
- `packages/functions/src/controllers/localStorageController.js:6` — the correct import form (`import {CHECKLIST_KEY, SPEED_SCORE_KEY} from '@functions/const/seoIssues';`) that devController.js lacks.
- `packages/functions/src/repositories/localStorageRepository.js:6` — updateChecklist's own module imports CHECKLIST_KEY, showing the constant is the intended field prefix for this write.

## Evidence
- 8 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T01:06:48.341Z" AND timestamp<="2026-08-14T01:36:48.341Z" AND logName:"stderr" AND textPayload:"CHECKLIST_KEY is not defined"`
- 4 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T01:06:48.341Z" AND timestamp<="2026-08-14T01:36:48.341Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T01:06:48.341Z" AND timestamp<="2026-08-14T01:36:48.341Z" AND logName:"stderr" AND textPayload:"GET /api/dev"`

## Job
- analyze rounds: 1
- cost: $3.61
- branch: `fix/prod-seo-1l9y5gr-a2`
- fix commit: `97e28a71f4d6f75b9978e84fd7b0b0b284dc5bd9`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2199
- tests: 1037 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/devController.js | 1 +
 1 file changed, 1 insertion(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
