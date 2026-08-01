fingerprint: 1dzotmb
service: reconcilependingfinalizegen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-01T02:04:56.689Z
status: infra
attempt: 1

# SEO · reconcilependingfinalizegen2 · 1dzotmb

**Outcome.** infra class — reported, no MR

**Root cause.** reconcilePendingFinalizeGen2 is declared at memory: '512MiB' while this repo's shared src/ import graph needs ~514-548 MiB just to boot, so every cold start OOMs before the container ever passes its startup probe and Cloud Scheduler gets a 503 readiness-check failure.

**Mechanism.** Cloud Scheduler POSTs the function at 02:00 UTC. There is no warm instance (no minInstances, once-daily schedule), so Cloud Run cold-starts a container. Node loads packages/functions/lib/handlers/exports/cronFunctions.js, whose top-level imports pull the whole shared tree (shopifyService, Firestore SDK, p-limit, bulkOptimizeRepository, finalizeBulkOptimize, optimizeImageJob). Resident set crosses the 512 MiB cap declared at cronFunctions.js:30 during module load — measured 520 MiB at 02:01:02.885615Z, and 514-548 MiB across the last 11 kills. The container is killed 1ms before the 'Default STARTUP TCP probe failed ... The instance was not started' line at 02:01:02.886132Z, so the probe never sees port 8080 and the request returns 503 'The request failed because the instance failed the readiness check' after 49.02s. Because the kill lands during module load, no application code runs: handleReconcilePendingFinalize's logger.warn completion line (handlers/cron/reconcilePendingFinalize.js:12) is never emitted, which is why the stderr read is empty (0 entries) rather than merely severity-filtered — this is not P7 blindness. The repo already diagnosed this exact failure for a sibling function and wrote the finding into the source: pubsubFunctions.js:552-557 records that 512MiB 'OOM'd on cold start BEFORE the readiness probe' because the import graph 'needs ~531MiB just to boot', and raised that function to 1GiB. reconcilePendingFinalizeGen2 is one of only 3 declarations left at 512MiB out of 107 in handlers/exports (73x 1GiB, 24x 2GiB, 7x 4GiB), and it is the only cron among them.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:30` — the failing declaration: memory: '512MiB', schedule: '0 2 * * *' — every neighbour in this file is 1GiB or 2GiB
- `packages/functions/src/handlers/exports/pubsubFunctions.js:552` — in-repo precedent comment: identical 512MiB pre-readiness OOM on a sibling function, measured ~531MiB boot cost, resolved by moving to 1GiB at line 558
- `packages/functions/src/handlers/cron/reconcilePendingFinalize.js:12` — the only log line a successful run emits; it is absent from every one of the 8 failed runs, confirming the kill lands before any handler code executes
- `packages/functions/src/services/optimize/reconcilePendingFinalize.js:2` — top-level imports of bulkOptimizeRepository / finalizeBulkOptimize / optimizeImageJob that make up the boot-time import graph being measured

## Evidence
- 11 matching entries: `resource.labels.service_name="reconcilependingfinalizegen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T03:00:00Z" AND textPayload:"Memory limit of 512 MiB exceeded"`
- 8 matching entries: `resource.labels.service_name="reconcilependingfinalizegen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T03:00:00Z" AND textPayload:"readiness check"`

## Job
- analyze rounds: 2
- cost: $2.00

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
