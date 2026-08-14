# Phase B — Re-image prod workers Gen1 → Gen2 (rich telemetry)

**Goal:** prod workers run `packages/functions/worker.mjs` (`@avada-falcon/worker-sdk`) so the
fleet-control dashboard shows mem / version / per-worker running+history / reports + machine names
(jobs 16, 17, 19b). Today prod runs the Gen1 image (`@minhdevtree/worker-sdk`) which writes only a
thin heartbeat, so those columns are blank.

**Risk:** these jobs write Firestore/Shopify for real merchants. Gen2 SDK is staging-proven (v13/v15
healthy 23h+), but the Gen2 image against **prod db0** with **prod app-code** hasn't run. Every step is
HA-covered except the leader. Rollback at each step = bring the Gen1 follower compose back up.

**Order (do NOT reorder): canary box1 → box2 → leader/worker1 (maintenance window).**

## 0. Build a git-traceable Gen2 image (DEPLOY TRIGGER — Tuan runs)

From the Mac, on branch `feat/worker-pubsub-migration` (already reconciled with master 08-06):

```bash
cd ~/Documents/second-brain/projects/Falcon/seo/packages/functions
export SSHPASS=<build-box avada pass>          # never inline the value
./publish-worker.sh prod-gen2-$(git rev-parse --short HEAD)
```

This ships the committed `packages/functions/` tree → build box `100.113.50.9`, builds a NEW tag in the
registry `100.113.50.9:5000/seo-worker:prod-gen2-<sha>`, and POSTs `/api/deploy` (Ansible rolls the
STAGING workers too — expected; staging is the same code). The tag is immutable and traceable to the sha.
Note the tag; it becomes `IMAGE_TAG` below.

## 1. Canary — box1 (HA-covered, rollback = down)

box1 pulls from the registry over the avada tailnet (it already runs staging from it).

```bash
# on box1 (ssh avada@192.168.2.204)
cd ~/seo-worker-prod
cp ~/seo-worker-staging4/worker.config.yml ./worker.config.yml   # job registry; verify it matches prod jobs
docker pull 100.113.50.9:5000/seo-worker:prod-gen2-<sha>

docker compose -f compose.prod-follower.yml down                 # stop the Gen1 follower
IMAGE_TAG=prod-gen2-<sha> WORKER_ID=box1 WORKER_LABEL=box1 \
  docker compose -f compose.prod-follower-gen2.yml up -d
docker logs -f seo-worker-prod-box1                              # watch it boot + pick jobs
```

**Verify (from the leader dashboard `http://100.87.235.36:3900`, or curl `/api/fleet`):**
- box1 card shows a real `version` (= the tag), non-zero `mem`, label `box1`.
- box1 appears in per-worker running/history; `metrics:*` reports fill.
- box1 is processing prod jobs with no new failures (watch `failed 24h` stays 0).
- Let it soak ~15 min. Any misbehavior → `docker compose -f compose.prod-follower-gen2.yml down` +
  bring Gen1 back: `WORKER_ID=box1 docker compose -f compose.prod-follower.yml up -d`.

## 2. box2 (same, after box1 is clean)

```bash
# on box2 (ssh avada@192.168.2.184, LAN — tailnet SSH is blocked by Tailscale ACL)
# copy compose.prod-follower-gen2.yml + worker.config.yml + prod.env + credentials/ from box1 first
docker pull 100.113.50.9:5000/seo-worker:prod-gen2-<sha>
docker compose -f compose.prod-follower.yml down
IMAGE_TAG=prod-gen2-<sha> WORKER_ID=box2 WORKER_LABEL=box2 \
  docker compose -f compose.prod-follower-gen2.yml up -d
```

## 3. Leader + worker1 — cloud central (MAINTENANCE WINDOW, most sensitive)

The cloud box holds the singleton cron leader and is the only box GCF can reach for enqueue. It is on
the **tn221805** tailnet and **cannot reach the build-box registry** — transfer the image the same way
the Gen1 clone was seeded:

```bash
# on box1: export the image
docker save 100.113.50.9:5000/seo-worker:prod-gen2-<sha> | gzip -1 > /tmp/gen2.tar.gz
# ship box1 -> cloud (over tn221805): scp to 100.87.235.36, then on the cloud box:
gunzip -c /tmp/gen2.tar.gz | docker load
```

Then on the cloud box, swap the leader + worker1 services in `~/Projects/seo-worker/docker-compose.yml`
to the Gen2 image, keeping the leader's `CRON_LEADER=true` and worker1 as a follower. Set
`WORKER_LABEL=central-prod` (leader) / `central-prod-w1` (worker1). Roll one at a time (worker1 first,
verify, then the leader) so the cron singleton is never down more than a drain. This step is a manual
prod deploy on live merchant infra — do it in a window with a rollback image (`953d3496921c`) staged.

## Done when

All 4 workers show real version + mem + label(machine) + per-worker history on the dashboard, reports
populate, `failed 24h` stays 0, and prod job throughput is unchanged from the Gen1 baseline.
