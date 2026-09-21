---
name: prod-logs
description: Query an Avada app's PRODUCTION logs & data straight from its Firestore (read-only service account) — errorAlerts (the "what's erroring" feed), webhookLogs, activity, pubSubLogs, sync job logs, shops. Use to check whether a reported bug shows up as real prod errors, find error frequency/recency, or pull a shop's log entries. The apps log to FIRESTORE, not Cloud Logging.
---

# prod-logs — Firestore production queries

```bash
SECRETS_DIR=./secrets node tools/fs-query.js --app <app> <collection> \
  [--where 'field:op:value']... [--order 'field:desc'] [--limit N] [--json]
# ops: ==  !=  >  >=  <  <=  in  array-contains        (--where repeatable)
node tools/fs-query.js --app seo --collections          # list collections
node tools/fs-query.js --app seo errorAlerts --sample   # learn a collection's fields
```

Auth: `$SECRETS_DIR/sa/<app>-prod-sa.json` — **Datastore Viewer, read-only by credential**.

## Start here for "what's wrong in prod"

`errorAlerts --order 'lastSeenMs:desc' --limit 15` — aggregated errors with `appName`,
`service`, `severity`, `kind`, **`sample`** (the actual error message), `totalCount`,
`suppressed`, `firstSeenMs`/`lastSeenMs` (epoch ms), `expireAt`.

Other collections: `webhookLogs` (shopifyDomain, topic) · `activity` (shopID, type) ·
`pubSubLogs` (shopId) · `syncRedirectLogs`/`redirectMigrationLogs` (status, error) ·
`history*` · `shops`/`shopInfos`.

## Gotchas (real, hit in production use)

- **`lastSeen` is DEAD — order by `lastSeenMs`.** On 2026-07-23 all 5 apps moved the writer
  to the npm package `avada-prod-error-alert` (unscoped), which renamed `count`→`totalCount`
  and `firstSeen`/`lastSeen` (Timestamp) → `firstSeenMs`/`lastSeenMs` (epoch ms). Firestore
  **drops any doc missing the orderBy field**, so `--order lastSeen:desc` returns only
  pre-rename docs and the feed looks frozen in July. It is not: the pipeline never stopped.
- TTL on `errorAlerts` is **1 day** (the apps don't pass `ttlMs`, so the lib default wins) —
  anything older than ~24h is already gone. Don't read it as "nothing errored".

- **Shop field name is INCONSISTENT per collection**: `shopID` vs `shopId` vs
  `shopifyDomain`. `--sample` first, then filter with the right name.
- **Composite-index trap**: `--where` + `--order` on DIFFERENT fields fails with
  `FAILED_PRECONDITION: requires an index`. Drop the `--order` (filter only) or order
  without a where — NEVER create indexes on prod.
- Fields differ per app for the "same" collection — sample per app.
- Logs may contain tokens/PII — surface only what explains the issue.
- In the bot's diagnose evidence this is capped at 6000 chars and pre-set to
  `errorAlerts lastSeenMs:desc limit 10`.

> In the bot container the repo root is `/app` — prefix tool paths accordingly (e.g. `node /app/tools/…`); `SECRETS_DIR` is already `/secrets` there.
