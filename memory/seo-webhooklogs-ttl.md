---
name: seo-webhooklogs-ttl
description: "seo webhookLogs is an internal webhook-dedup ledger with a 30-day TTL; absence of a log is not evidence of anything"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

`webhookLogs` (seo) is a **webhook dedup ledger only** — internal, never exposed to the front-end.
TTL = **30 days**, set via `ttlExpireAt('webhookLogs')`.

Cite: `packages/functions/src/const/ttlPolicies.js:29-31` — `{collection: 'webhookLogs', days: 30,
note: 'Shopify webhook dedup ledger — dedup only needs a few days (retry ~48h)'}`. A related probe
comment (`shopProbeRepository.js:110`) warns "absence is NOT evidence of death (webhookLogs now
expires at 30 days)" — don't infer a webhook never arrived just because its log aged out.
