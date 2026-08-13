fingerprint: 1j0fnzi
service: apigen2
message: HTTP 500 POST /api/audit-agent/bulk-fix/1NVo4R1FXVBdvD23t9os/reoptimize
app: SEO
repo: seo
date: 2026-08-12T21:16:32.239Z
status: mr_open
attempt: 1

# SEO · apigen2 · 1j0fnzi

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2184

**Root cause.** reoptimizeBulkFix calls `publishTopic(...)` at packages/functions/src/controllers/bulkAuditFixController.js:205, but that module has no `publishTopic` import — the identifier is undefined, so the call throws ReferenceError and the catch converts it to HTTP 500.

**Mechanism.** The worker-pubsub migration converted the createBulkFix (:108) and applyBulkFix (:387) dispatches to `dispatchWork` (imported at :22) and dropped the `import publishTopic from '@functions/helpers/pubsub/publishTopic'` line, but left two call sites un-migrated: reoptimizeBulkFix (:205) and revertBulkFix (:448). POST /api/audit-agent/bulk-fix/1NVo4R1FXVBdvD23t9os/reoptimize for shop 7FPIoT17SVSJ1URPn4eG passed every guard (job found, shopID matched, status not PROCESSING, credits sufficient), reset all target product docs to PENDING and set the job to PENDING, then hit :205 and threw `ReferenceError: publishTopic is not defined` (stderr 18:23:33.882181Z, stack `at reoptimizeBulkFix (/workspace/lib/controllers/bulkAuditFixController.js:208:5)` — lib/ line, src/ equivalent is :205). The catch at :210 re-throws via ctx.throw(500, e.message), producing `InternalServerError: publishTopic is not defined` (18:23:33.883195Z) and the single 500 in the requests read (latency 0.880s). Side effect: the job doc and its product docs were already reset to PENDING before the throw, so the job is now stuck PENDING with nothing dispatched. Same defect family as already-recorded fingerprint a4t42q (revert path, MR 2181 open/unmerged) — this is the second orphan call site.

Confidence: `high`

## Code
- `packages/functions/src/controllers/bulkAuditFixController.js:205` — `await publishTopic(BULK_FIX_TOPICS.DISPATCH, ...)` — the undefined identifier that throws; stack frame `reoptimizeBulkFix` maps here
- `packages/functions/src/controllers/bulkAuditFixController.js:22` — the only dispatch import in the file is `dispatchWork`; there is no `publishTopic` import anywhere in the module (imports span :1-24)
- `packages/functions/src/controllers/bulkAuditFixController.js:212` — catch logs `[reoptimizeBulkFix] <shopID> publishTopic is not defined` then ctx.throw(500) at :213 — matches both stderr lines
- `packages/functions/src/controllers/bulkAuditFixController.js:448` — second surviving orphan `publishTopic` call in revertBulkFix — same ReferenceError waits on POST .../revert
- `packages/functions/src/controllers/bulkAuditFixController.js:204` — job status set to PENDING and product docs reset (:177-195) before the throw, so the failed request leaves the job stranded
- `packages/functions/src/routes/api.js:462` — route registration binding POST /audit-agent/bulk-fix/:id/reoptimize to bulkAuditFixController.reoptimizeBulkFix

## Evidence
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T18:09:00Z" AND timestamp<="2026-08-12T18:39:00Z" AND textPayload:"publishTopic is not defined"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T18:09:00Z" AND timestamp<="2026-08-12T18:39:00Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T18:09:00Z" AND timestamp<="2026-08-12T18:39:00Z" AND textPayload:"/api/audit-agent/bulk-fix/1NVo4R1FXVBdvD23t9os/reoptimize"`

## Job
- analyze rounds: 1
- cost: $2.92
- branch: `fix/prod-seo-1j0fnzi`
- fix commit: `fb1edc946d7370583bfce1ffc9a2174d1f291f79`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2184
- tests: 927 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/bulkAuditFixController.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
