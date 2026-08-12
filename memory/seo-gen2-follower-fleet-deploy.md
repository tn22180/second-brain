---
name: seo-gen2-follower-fleet-deploy
description: How the SEO gen2 worker boxes (box1/box2) are deployed + reached; hydrate image needs FIREBASE_CONFIG + HEALTH_PORT=3800 or it regresses bucket/health.
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-12T10:13:15.085Z
---

SEO worker fleet is mid-migration: **old stack** (`~/Projects/seo-worker`, services
`bullboard`/`seo-worker-leader`/`seo-worker`, deployed by master CI `[deploy-worker]` →
`deploy-to-worker.sh`, CENTRAL only) runs ALONGSIDE **gen2** on the same redis (central
`100.87.235.36:6380` db0). `[deploy-worker]` does NOT touch box1/box2 — wrong tool for fleet fixes.

**gen2 follower boxes** (box1=`100.123.202.84`, box2=`100.104.18.124`, 2 replicas each, box1.1/.2
etc): compose `/home/avada/seo-worker-prod/compose.gen2-follower.yml`, image **name-pinned local**
`seo-worker:prod-gen2-hydrate` (not registry). Up: `WORKER_LABEL=boxN docker compose -f
compose.gen2-follower.yml up -d`. env_file `prod.env`; HARD GUARD worker.mjs:74 `APP_ENV=production
⇔ REDIS_DB=0`.

**Hydrate image gotchas** (the `prod-gen2-hydrate` image = master-built worker, fixes token-strip
via `hydrateShopInPayload` but REGRESSES vs `prod-gen2-1eed4e1` on 2 things — box compose MUST set):
- `FIREBASE_CONFIG: '{"storageBucket":"avada-seo.appspot.com","projectId":"avada-seo"}'` — else
  import-chain no-arg `firebase.initializeApp()` makes a bucketless app → `Bucket name not
  specified`. Same value central uses (`fbconfig-override.yml`). See [[seo-gen2-worker-firebase-config]].
- `HEALTH_PORT: "3800"` — image HEALTHCHECK hardcodes `localhost:3800/health`; box default was 3801
  → unhealthy.

**Reachability:** boxes only via Tailscale (behind NAT, DERP relay "sin"). Mac→box works after
one Tailscale-SSH browser re-auth per box. box→central and box2→central OUTBOUND are Tailscale-SSH
gated (fail non-interactively). Fastest image transfer: box pulls from central `100.87.235.36`
over Tailscale with `ssh -A` agent-forward (worked box1; box2 gated → route via Mac). gcp-gw
(`seo-worker-box` 10.0.0.2) ~0.76MB/s; Tailscale ~1.3MB/s. Registry `100.113.50.9:5000` DOWN +
box1/box2 absent from `fleet/inventory.ini` → ansible roll not usable; hand-ship image instead.

Central label `worker:version=prod-gen2-1eed4e1` is STALE (IMAGE_TAG env not updated on hand-retag);
actual central image is `prod-gen2-hydrate`. See [[fleet-control-queues-down-semantics]],
[[seo-fleet-tailscale-staging4]].
