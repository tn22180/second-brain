# Prod Worker Fleet Migration — Handoff

## Progress

| #   | Job                                                                     | Status              |
| --- | ----------------------------------------------------------------------- | ------------------- |
| 1   | Ship `avadaService` lazy-init fix to prod worker (`[deploy-worker]`)     | ✅ done             |
| 2   | Verify prod worker health via CI (`deploy_worker` green 2026-08-05)     | ✅ done             |
| 3   | Regenerate revoked `GLAB_TOKEN` (scope `read_api`)                       | ✅ done             |
| 4   | Write this migration handoff                                            | ✅ done             |
| 5   | Recover handoff after worktree prune; move canonical → `second-brain/jobs/` | ✅ done          |
| 6   | Unshallow + compute branch↔master divergence                            | ✅ done             |
| 7   | Reconcile: merge `origin/master` → branch (2026-08-06)                   | ✅ done             |
| 8   | Document `dispatchWork` 3-gate routing + Pub/Sub fallback (§6a)          | ✅ done             |
| 9   | Fix root `CLAUDE.md` `dispatchWork` drift (describes stripped master ver) | ✅ done             |
| 10  | Tailscale on prod box (step 1, §4)                                       | 🔒 blocked (box access) |
| 11  | Stand up `compose.central.yml` on prod box                              | ⬜ pending          |
| 12  | Build + push amd64 worker image (`build_worker_image`)                   | ⬜ pending          |
| 13  | Add worker box(es) via `join-worker.sh`                                  | ⬜ pending          |
| 14  | Cut prod queue (db0) over to fleet                                       | ⬜ pending          |

> **Branch:** `feat/worker-pubsub-migration` · **Repo:** `seo` · **Prod project:** `avada-seo`
> **Status:** worker healthy on the _current_ single-box setup; master reconciled into the branch 2026-08-06 (§2). Remaining before live: Tailscale on the prod box (step 1, blocked on box access), then stand up central / build image / add workers / cut queue over.
> **Audience:** the engineer taking over the migration. Read top-to-bottom before touching prod.
>
> **Location note:** canonical copy is `second-brain/jobs/prod-worker-migration-handoff.md` (durable;
> the always-present brain repo). A **synced mirror** also lives on the seo branch at
> `docs/prod-worker-migration-handoff.md` — edit the canonical and re-sync, don't let them diverge.
> An earlier copy was lost when the nightly prune wiped its `seo/.claude/worktrees/` checkout — never
> keep durable work under `.claude/worktrees/`. Paths below are relative to the `seo` repo on
> `feat/worker-pubsub-migration`.

## 0. What this migration is

Replace the **current single-box prod worker** (one Ubuntu box, reached by CI over a WireGuard
gateway, running `seo-bullboard` / `seo-worker-leader` / `seo-worker` from the master source tree)
with the **Tailscale-mesh fleet** built on this branch:

- **Central box** (`compose.central.yml`): redis + loki + grafana + bullboard + the cron **leader**
  (singleton). Decided: **reuse the current prod box as central.**
- **Worker boxes** (`compose.worker.yml`): a `seo-worker` follower pool pointing at the central
  redis over its Tailscale IP. Added with `join-worker.sh` (run from the Mac).
- **Rolling deploy** via Ansible (`fleet/inventory.ini` = Tailscale IPs, `deploy-workers.yml`
  `serial:2` drain/verify, `deploy-central.yml`). CI `build_worker_image` builds `Dockerfile.worker`
  once → `$CI_REGISTRY_IMAGE/seo-worker:<sha>`; boxes pull the image instead of rsync+rebuild.

Full design: `packages/functions/fleet/README.md` and `docs/phase-*.md` (phase 0–5) on the branch.

## 1. Current worker health (verified 2026-08-06 via CI, not a live probe)

The **existing** prod worker is healthy. Last deploy `2026-08-05 09:59` (pipeline `2733438111`,
`deploy_worker` **success**), verified at deploy time:

- `seo-bullboard` Up (healthy), `seo-worker-leader` + `seo-worker-1` Up, redis/loki/grafana Up ~2 months.
- `✅ seo-worker-leader: Worker started`; jobs loaded: `testEcho, generateMissingAnchorTexts, processGenerateAnchorTextBatch, optimizeImage, optimizeImageV2, recursive, migrateBrokenUrlsId, syncUrlRedirects, syncUrlRedirectsBatch`.
- `✅ seo-worker-box: deploy verified — worker is up`. SDK `@avada-falcon/worker-sdk 0.5.6`.

No deploy since → the box runs the 2026-08-05 state. **A live-this-moment probe still requires box
access or the box on the tailnet** (neither exists yet — see §4). The deploy-time verification is
the strongest remote health signal available today.

To re-run this check: load `GLAB_TOKEN` from `speed-up-report/apps/functions/.env` into
`GITLAB_TOKEN` (never print it), then via the GitLab API on project `avada%2Fseo`, find the newest
`deploy_worker` job and read its trace tail for `deploy verified — worker is up`. The token was
**revoked once (2026-08-06) and regenerated** — if pipeline queries 401, it was rotated again.

## 2. Reconcile with master — DONE (2026-08-06)

`origin/master` was merged into the branch on 2026-08-06 (merge commit `5e3e9d2`, branch now at
`098e6c1`). The branch carries master's app code up to `e7963ef`; the worker image built from it is
current, **no longer ~5 weeks behind**. This was the hard prerequisite before `build_worker_image`.

|                                                  | value (branch `098e6c1`, 2026-08-06)                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| merge-base with master                           | `e7963ef` (2026-08-06)                                                |
| master still ahead                               | 7 commits (post-merge fixes: speed-score FAL-510, gh-surfaces nudges) |
| `packages/functions/src` differing master→branch | none material                                                         |
| `worker.config.yml`                              | present, reconciled                                                   |

Those 7 trailing master commits are small post-merge fixes — pull them in with another
`git merge origin/master` right before building the image if you want the very latest, but nothing
there blocks the build. **Watch the merge did not silently drop the fleet infra** — verify
`packages/functions/fleet/`, `install.sh`, `worker.config.yml`, and the richer `dispatchWork.js`
(3 gates + spill + fallback, §6a) all survived; the merge kept the branch versions of these.

Recompute divergence on a fresh checkout with: `git fetch --unshallow origin` (a fresh clone is
often shallow → `merge-base` reads empty until unshallowed), then
`git merge-base HEAD origin/master`.

## 3. Migration order (do NOT reorder)

1. **Tailscale on the prod box** (§4) — additive networking, safe on the live box. Sequenced first
   per the owner's call ("trước khi live prod setup tailscale").
2. **Merge fleet infra ↔ master** (§2) — so the image is built from current app code.
3. **Stand up `compose.central.yml`** on the prod box (redis / leader / bullboard). Redis **db0** is
   live prod queue data — untouched by a code rollout; do **not** flush it.
4. **Build + push the amd64 worker image** (`build_worker_image`). Boxes are amd64; build `linux/amd64`.
5. **Add worker box(es)** via `join-worker.sh` from the Mac.
6. **Cut the prod queue (db0) over** to the fleet, drain the old containers.

## 4. Step 1 runbook — Tailscale on the prod box

Additive networking only. Does **not** touch the running worker containers or the prod Redis (db0)
queue — safe on the live box.

**Target box:** `seo-worker-box`, reached by CI at `10.0.0.2` via the `gcp-gw` WireGuard gateway
(`34.87.163.45`, SSH user `avada`). Ubuntu. This box becomes the fleet **central**.

**Which Tailscale account / tailnet (decide first — it is load-bearing)**

The owner is **not an `avadagroup.com` Workspace admin**, so cannot mint auth-keys for the existing
avada tailnet. A tailnet is bound to its identity provider, so **the login account decides which
tailnet the box joins — and boxes only mesh if every one uses the same account.** Three paths:

- **A — owner's own `@avadagroup.com` account (member, no admin).** Box joins the **existing** avada
  tailnet (meshes with central `100.113.50.9`, staging4). A member can `tailscale up` interactively;
  if device-approval is on, an admin clicks "approve" **once** (far lighter than minting a key).
  **Preferred.**
- **B — a dedicated, team-owned Google account for a separate prod tailnet.** The owner is admin of
  *that* tailnet → mints keys, sets ACL `tag:prod`, no dependency on avada admins. Prod is isolated
  from dev/staging (good for blast radius). The Mac control node must log into this prod tailnet to
  operate it. **Fallback if A is impossible.**
- **C — a personal daily Gmail.** Works, but ties the prod network to one person's personal account
  (lose/rotate it → prod mesh breaks). **Avoid.**

**Invariant:** every prod box (central + all workers) must enrol under the **same** account, or they
will not see each other. The `--hostname` below and the runbook assume that account is fixed.

**Other prereqs**

- **A shell on the box.** Claude has no SSH into it (the gateway key is CI-only). Either run the
  commands below on the box, or hand over a reachable path (gateway creds / a jump).
- **A browser** logged into the chosen account to approve the device-auth URL printed by
  `tailscale up`. Interactive device login, not an auth-key (owner has no key rights).

**Run ON the prod box**

```bash
# 1. install tailscale (idempotent — skips if present)
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

# 2. join the tailnet via interactive login (no auth key). Prints a one-time URL:
#      To authenticate, visit: https://login.tailscale.com/a/xxxxxxxx
#    Open that URL in the Mac browser (logged into the tailnet), approve.
sudo tailscale up --ssh --hostname seo-worker-central-prod

# 3. confirm it got a 100.x tailnet IP — this becomes CENTRAL_REDIS_IP for workers
tailscale ip -4
tailscale status | head
```

**Verify from the Mac (already on the tailnet)**

```bash
tailscale status | grep -i prod        # the new node shows up
tailscale ping <the-100.x-ip>          # mesh reachability, not via gateway
```

Done when the box has a stable `100.x` IP and the Mac can ping it over the tailnet. This also
unblocks live worker health (fleet-control reads Redis heartbeats + BullMQ queue depth over the mesh).

## 5. Key files & paths (all on the branch unless noted)

| What                               | Where                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Fleet design + all scripts         | `packages/functions/fleet/README.md`                                          |
| Central compose                    | `packages/functions/fleet/compose.central.yml`                                |
| Worker compose                     | `packages/functions/fleet/compose.worker.yml`                                 |
| Box bootstrap (run from Mac)       | `packages/functions/fleet/join-worker.sh`                                     |
| Box-side bootstrap                 | `packages/functions/install.sh` (Tailscale step ~lines 150–157)               |
| Ansible inventory / rolling deploy | `fleet/inventory.ini`, `fleet/deploy-workers.yml`, `fleet/deploy-central.yml` |
| Worker job registry                | `packages/functions/worker.config.yml` (`jobs:`)                              |
| Phase docs                         | `docs/phase-0..5*.md`, `docs/distributed-worker-fleet-plan.md`                |
| Ops runbook                        | `docs/phase-5-ops-runbook.md`                                                 |
| This handoff (canonical)           | `second-brain/jobs/prod-worker-migration-handoff.md` (not kept on the seo branch) |

## 6. CI deploy path (current prod, master)

- **master has NO `detect_worker` auto-deploy.** The `deploy_worker` job in master's
  `.gitlab-ci.yml` fires **only** when the commit title matches `[deploy-worker]`
  (`only.variables: $CI_COMMIT_TITLE =~ /\[deploy-worker\]/`). A normal merge to master updates GCF
  but **not** the worker box.
- The fail-safe `detect_worker` auto-detection (`scripts/detect-worker-affected.js` → `DEPLOY_WORKER`)
  described in the branch docs lives **only on the branch**, not on master. It reaches prod when the
  branch merges.
- To ship a worker fix to prod **today**: push a commit to master with `[deploy-worker]` in the title
  (an empty marker commit works). That renders `deploy_worker` → SSH via `gcp-gw` (ProxyJump,
  WireGuard) → `deploy-to-worker.sh seo-worker-box` (rsync master source + `docker compose build/up`).
  Example seen 2026-08-05: SDK-bump commits carried the marker and redeployed the worker (§1).
- Master is protected (push/merge = Maintainer/40). Querying pipelines needs `GLAB_TOKEN` from
  `speed-up-report/apps/functions/.env`, loaded into `GITLAB_TOKEN`.

## 6a. Job routing & Pub/Sub fallback (`dispatchWork.js`)

The branch keeps the **rich** `dispatchWork` (`helpers/worker/dispatchWork.js`, 139 lines) — master's
is a stripped 63-line version with only two gates and **no fallback**. When this branch lands, the
rich version wins. It routes to the fleet only past three gates, and **falls back to Pub/Sub (GCF)
at every failure point** so a dispatch is never lost to a dead queue:

1. **Gate 1** — topic ∈ `MIGRATED_TOPICS` (code-level handler exists), else Pub/Sub.
2. **Gate 2** — shop opted in via `workerJobs[]` (per-shop Firestore toggle), else Pub/Sub.
3. **Gate 3 — fleet health** (`isFleetHealthy()`): Redis down / no live worker / saturated → Pub/Sub.
4. **Gate B — load spill** (only when `SPILL_ENABLED`): tier saturated → Pub/Sub, else assign priority.
5. **Enqueue try/catch**: if `dispatchJob` throws (Redis dropped after the cached health check) →
   Pub/Sub. This is the "once routed, still not lost" guarantee.

So the fallback is **already present** — the earlier worry ("routed jobs propagate a throw with no
Pub/Sub fallback") was reading the **root `CLAUDE.md`**, which the 2026-08-06 merge repopulated with
master's description of the _stripped_ `dispatchWork` (two gates, no catch). **That doc now
contradicts the branch code — fix `CLAUDE.md` to describe the 3-gate + spill + fallback version, or
it will mislead the next reader.** The dispatch path only protects **enqueue**; a job that enqueues
fine then dies mid-run on a worker is BullMQ's retry/stalled-job concern, not `dispatchWork`'s.

## 7. Gotchas (learned the hard way)

- **Worktrees get pruned.** `seo/.claude/worktrees/*` is wiped by the nightly clean (all cleared
  2026-08-03). Anything durable goes in the main checkout or `second-brain/jobs/`, never there.
- **Shallow clone.** A fresh checkout may be shallow → `git merge-base` returns empty and divergence
  looks like "0 commits". Run `git fetch --unshallow origin` before trusting any history/diff.
- **Path relative to cwd.** `git diff --stat … -- packages/functions/src` from inside
  `packages/functions/` silently scopes to the wrong path and reports 0 changes. Run from repo root
  or use `git -C <root>`.
- **Redis DB.** Prod = **db0** (`REDIS_DB` unset); staging4 = db4. `join-worker.sh` requires
  `--redis-db`; db0 is production and is never defaulted. Never flush db0 — live queue data.
- **Secrets stay out of argv.** `join-worker.sh` / `install.sh` take secrets from env
  (`TAILSCALE_KEY`, `REGISTRY_TOKEN`, `SUDO_PASS`, …), never flags — argv is world-readable via `ps`.
  Do not `curl … | bash` the install script.
- **Image arch.** Worker boxes are amd64. Build/push `linux/amd64` even from an Apple-silicon Mac.
- **Two runtimes.** `firebase deploy` (GCF) does not update the worker box, and `[deploy-worker]`
  does not update GCF. Keep both in mind for any fix that touches a job handler.

## 8. Credentials (pointers only — never inlined)

- Box SSH creds: `projects/Falcon/ssh.md` (gitignored). Staging boxes user `avada`; central
  `100.113.50.9` via SSH key; `.50` / `.184` via ProxyJump through central, SSHPASS on the final hop.
- Prod box: reached by CI only, over `gcp-gw` with `WORKER_DEPLOY_SSH_KEY` (a CI/CD variable, base64
  SSH key — CI-only, not on any laptop). **This is the access blocker for step 1.**
- `GLAB_TOKEN`: `speed-up-report/apps/functions/.env` (regenerated 2026-08-06 after a revoke; scope
  `read_api`).
- Never put a credential on a command line; load into an env var and use `-f file` / `-e`.

## 9. Immediate next action

Either (a) get a shell on the prod box and run the §4 Tailscale commands, or (b) hand over a
reachable path so step 1 can proceed. In parallel, the §2 master reconcile can start on a fresh
unshallow checkout — a pure git/merge task that doesn't touch prod.
