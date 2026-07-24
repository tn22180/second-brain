---
name: seo-redis-command-timeout-noise
description: "SEO's \"[redisCache:*] Command timed out\" is client-side noise, not a Redis fault — Memorystore measured idle; don't re-investigate the server."
metadata: 
  node_type: memory
  type: project
  originSessionId: b73d2473-e06e-4033-a98a-31f4a5c4699b
  modified: 2026-07-24T09:03:48.129Z
---

Investigated 2026-07-24. `[redisCache:get|set|del|delByPattern|rateLimit] Command timed out`
in `avada-seo` is **not** a Redis problem. Prod `seo-redis` (Memorystore BASIC 1GB, `10.96.79.131`,
us-central1) measured: CPU ≤1.3%, memory ≤1.7% of 1GB, ~7.2k keys, 0 evictions, connection churn ~0,
VPC connector pushing only ~35–56 KB/s. Timeouts landed **in proportion to command volume** across
every service (proxygen2 + apigen2 = 76%), scattered, often in pairs <1ms apart.

`commandTimeout` is measured in the Node process, so a GC pause or busy event loop trips it while
Redis answers in <1ms. It was 200ms. Chronic since the cache layer shipped ~2026-06-25 (0 on 06-20,
≥2000/day by 06-25), running 400–1400/day — never an incident, always fail-open.

Fixed 2026-07-24 in `packages/functions/src/helpers/redisCache.js`: `commandTimeout` 200→1000,
`keepAlive: 30000`, timeouts log at `warn` via `logCacheFailure()` (the `prod-error-alerts` sink
filters `severity>=ERROR`, so `logger.error` was paging Slack ~700×/day), and the previously
commented-out `error`/`close` handlers restored behind a 60s rate limiter. Not yet deployed —
deploy is manual.

**Why:** the cheap instinct is to blame Redis and resize/scale it; the metrics say the server has
never been near a limit, so that spends money and fixes nothing.

**How to apply:** if these logs reappear, check the *client* (event loop, Cloud Run CPU) before the
server. Still-open: `retryStrategy` returns `null` after 5 attempts, killing reconnection for the
rest of the instance's life — it now logs, but nothing recovers it short of container recycle.

Related: [[seo-prod-error-slack-pipeline]], [[seo-fleet-tailscale-staging4]]
