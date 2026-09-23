---
name: seo-auto-features-dead
description: "seo \"auto\" features mostly dead in prod — products/create webhook 0 req/30d, autoSchedule cron unwired, 404 auto-redirect DevZone-only"
metadata:
  node_type: memory
  type: project
  originSessionId: 005eea2a-e35c-4db2-a422-cee810919f26
  modified: 2026-09-23T07:49:54.272Z
---

Verified 2026-09-23 on master `0547925a9cb` + prod `avada-seo` Cloud Logging:
- `webhookCreateProductGen2`: 0 requests in 30 days. Subscription removed in `6663e0891bf` (2025-03-23) and `imageHook.js:8` actively deletes `products/create`. Code only registers `BULK_OPERATIONS_FINISH` + `APP_SUBSCRIPTIONS_UPDATE`. So alt/compress on new product is dead even though the handler (`bulkOperationHook.js:132`) exists.
- `autoSchedule.autoOptimize` week/month: `handleAutoOptimize` default export is not wired to any cron; UI `SpeedUp/Settings/Settings.js` returns null.
- 404 auto-redirect (weekly Pro+, daily Enterprise) runs only when `permanentlyRedirect.isDevZoneEnabled=true`, which only the internal DevZone page sets.
- Meta templates DO auto-apply: render-time Liquid, no writes.
- Plan table markets "Autopilot optimization" on Pro (`PlanFeatures.json`) with no feature behind it.

**Why:** a feature's code existing ≠ it runs; the AutoPilot plan (jobs/seo/auto_pilot.md) is built on reviving these triggers.
**How to apply:** before claiming any seo "auto" works, check prod request logs / the cron export, not the handler.
