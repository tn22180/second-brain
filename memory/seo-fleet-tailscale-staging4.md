---
name: seo-fleet-tailscale-staging4
description: "seo worker fleet runs over a Tailscale mesh; staging4 = avada-seo-staging-4; the box IPs are local/uncommitted, not in the repo"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

The `seo` self-hosted worker fleet is joined over a **Tailscale mesh** (job pull + logs push);
`FLEET_HOST` is reachable "over Tailscale only" (fleet docs under
`.claude/worktrees/worker-pubsub-migration/docs/`). `staging4` maps to project `avada-seo-staging-4`
(`.firebaserc:8`), fed by CI `STAGING_4_ENV_FILE` → `packages/functions/.env.staging4`.

Caveat: specific box IPs (`192.168.2.184`, `…50`) are **not committed** — they live in local env /
inbox notes only, so treat them as unverifiable from the repo. Prod cache-Redis is a separate host
(`REDIS_SELF_HOST=10.96.79.131` in the gitignored `.env.avada-seo`), not a fleet box.
