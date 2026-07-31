fingerprint: 1lkslmo
service: reconcilependingfinalizegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-07-31T10:54:50.804Z
status: infra
attempt: 1

# SEO · reconcilependingfinalizegen2 · 1lkslmo

**Outcome.** infra class — reported, no MR

**Root cause.** reconcilePendingFinalizeGen2 is the only Cloud Function in the repo declared at memory: '512MiB', and loading the shared gen2 functions bundle peaks at 516–533 MiB, so the container is OOM-killed before it can listen on port 8080 — the startup TCP probe fails and the instance never starts.

**Mechanism.** packages/functions/src/handlers/exports/cronFunctions.js:30 declares onSchedule({timeoutSeconds: 540, memory: '512MiB', schedule: '0 2 * * *'}) — every other export in that file uses 1GiB or 2GiB. All gen2 functions share one built image (us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__internal_gen2:version_1), so this container loads the same full module graph as its 1GiB/2GiB siblings but with half the RAM ceiling. Cloud Run logged `'Memory limit of 512 MiB exceeded with 533 MiB used'` at 2026-07-31T02:00:39.969544Z and `'…with 516 MiB used'` at 09:45:53.582539Z; each is followed 0.4ms later by `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` Two distinct consequences: (a) 02:00:02 was an AUTOSCALING cold start for the cron's own schedule '0 2 * * *' — it logged `The request failed because the instance failed the readiness check` and produced no handler output, so the 2026-07-31 reconcile run never executed; (b) 09:45 was a DEPLOYMENT_ROLLOUT boot of revision reconcilependingfinalizegen2-00040-kop, which failed its healthcheck, leaving status.latestReadyRevisionName pinned at 00039-yek with 100% traffic — the deploy tuannv@avadagroup.com pushed at 09:45 is not live for this function.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:30` — memory: '512MiB' — the only sub-1GiB allocation in the file; every sibling onSchedule export loads the same bundle at 1GiB or 2GiB and boots fine
- `packages/functions/src/handlers/exports/cronFunctions.js:30` — schedule: '0 2 * * *' matches the 02:00:02 AUTOSCALING cold start that OOM'd, tying the failed boot to this function's own cron trigger rather than to the deploy
- `packages/functions/src/handlers/cron/reconcilePendingFinalize.js:12` — logger.warn('[handleReconcilePendingFinalize] reconcile complete', …) — this line emits on every successful run and is absent from the 02:00 window, confirming the handler body never executed

## Evidence
- 2 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="reconcilependingfinalizegen2" AND textPayload:"Memory limit of 512 MiB exceeded" AND timestamp>="2026-07-30T10:00:00Z"`
- 2 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="reconcilependingfinalizegen2" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-07-30T10:00:00Z"`
- 4 matching entries: `resource.labels.service_name="reconcilependingfinalizegen2" AND timestamp>="2026-07-31T01:59:00Z" AND timestamp<="2026-07-31T02:20:00Z"`
- 5 matching entries: `(resource.labels.service_name="reconcilependingfinalizegen2" OR resource.labels.function_name="reconcilependingfinalizegen2") AND timestamp>="2026-07-31T09:31:27.035Z" AND timestamp<="2026-07-31T10:01:27.035Z" AND severity>=ERROR`
- 8 matching entries: `resource.labels.service_name="reconcilependingfinalizegen2" AND textPayload:"STARTUP TCP probe succeeded" AND timestamp>="2026-07-30T00:00:00Z" AND timestamp<="2026-07-31T10:05:00Z"`

## Job
- analyze rounds: 1
- cost: $1.33

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
