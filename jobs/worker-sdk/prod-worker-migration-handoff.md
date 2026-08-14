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
| 10  | Tailscale enrol box1 + box2 on `tn221805` tailnet (key-exp off, mesh OK) | ✅ done             |
| 11  | Enrol old cloud box (central) on `tn221805` tailnet (`seo-worker-central-prod` = `100.87.235.36`, key-exp off) | ✅ done 08-07 |
| 12  | Confirm central redis facts: `100.87.235.36:6380`, plain TCP no TLS, db0, firewall→6380 open | ✅ done 08-07 |
| 13  | Clone prod image → box1+box2, up as followers (**Strategy A**, no registry/join-worker.sh) | ✅ done 08-07 |
| 14  | Verify pool: **4 heartbeats** (leader+worker1+box1+box2), both processing prod jobs, RestartCount 0 | ✅ done 08-07 |
| 15  | Deploy fleet-control dashboard on leader (systemd, reboot-safe, :3900) | ✅ done 08-07 |
| 18  | Queue "DOWN": 209 stale failed jobs — investigate + clear | ✅ done 08-07 |
| 19a | Dashboard false-DOWN from cumulative failures — 24h window | ✅ done 08-07 |
| 20  | Redact `accessTokenHash` + `email` from the dashboard job-data Payload view | ✅ done 08-07 |
| 16  | Rich telemetry (mem/version/history) — re-image prod → Gen2 | ✅ done 08-10 |
| 17  | Name workers by machine (`WORKER_LABEL` per box) | ✅ done 08-10 |
| 19b | version/mem/history columns populated | ✅ done 08-10 |
| 21  | Đồng bộ job + worker "nhận"/hiện job | ✅ done 08-10 (Gen2 worker:running) |
| 22  | Completed count cap 1000 → show số thật | ✅ done 08-10 (Reports = metrics counter) |
| 23  | Full cutover Gen1→Gen2 all 4 workers (graceful drain) | ✅ done 08-10 |
| 24  | Gen2 design: 2 worker/máy × 5GB (trừ leader) — scale box1/box2 to 2×5GB | ✅ done 08-10 |
24-note: box1/box2 giờ mỗi máy 2 replica (box{1,2}-a/-b) MEMORY_BUDGET_MB=5000. Central (leader máy) giữ 2 (leader+worker1, ngoại lệ). Fleet = 6 Gen2 worker, cap 102. Compose `~/seo-worker-prod/compose.gen2-follower.yml` (2 service a/b, YAML anchor, WORKER_LABEL chung). ⚠️ box2 chỉ 4GB RAM free (staging fleet ăn 9GB) — 2×5GB budget = trần 10GB, RSS thật ~600MB/worker nên vừa, nhưng nếu 2 job heavy spike RSS thật cùng lúc thì rủi ro OOM; theo dõi, cần thì giảm budget box2.
| 25  | Job id = shopdomain+jobId, tất cả job registered Gen2 | ✅ done (đã có sẵn Gen2: `buildJobId` = `<jobName>-<shopdomain>-<6char>` dispatchWork.js:9; 22 job types registered) |
| 27  | Số jobs count real (vẫn hiện 1000) | ✅ done 08-10 — thêm card "Done 24h" (real từ metrics `getReports.total`), snapshot `done24h` cache 10s, cột Completed nhãn "≤1k". Deployed central, verified 1422. |
| 26  | Deploy tab → bỏ trigger, đổi thành config view | ✅ done 08-10 — gỡ Deploy tab + deploy-trigger UI (doDeploy/rollback); Config giờ read-only: **Machine config** (per-box budget/mem/version/id từ snapshot) + **worker.config.yml** raw+summary, bỏ Apply(drain+roll) → không còn deploy trigger nào trong dashboard. |
| 28  | Pre-deploy prod cho nhánh này | 🔄 pending — deploy manual (Tony chạy) |
| 29  | UI fleet-control polish | ✅ done 08-10 — **master-detail layout**: body grid `minmax(300px,4fr) 8fr`, full-width, 1 window (100vh, mỗi pane scroll riêng); nav trái = menu + fleet/queue summary (click → worker/jobs modal). **dark/light** toggle (persist localStorage, default dark, `:root[data-theme=light]`). env badge `production·db0` dời khỏi brand → header content pane. card `.top` overflow (flex-wrap + name ellipsis) = fix "● processing break". Deployed central, sha khớp, service active. |
| 30  | Menu to quá → về width cũ | ✅ done 08-10 — body grid về `220px 1fr` (nav slim như đầu), content vẫn full-width 1 window + nav fleet/queue summary. Deployed. |
| 31  | Job đã chia memory rồi → bỏ tier heavy/medium/light? | ❎ KHÔNG bỏ (khuyến nghị). "chia memory" = per-worker `MEMORY_BUDGET_MB` + RSS admission gate (dynamic OOM-safety), **không phải per-job** — không có field memory/job trong worker.config.yml. Tier làm việc khác admission: (1) **concurrency-per-class** (heavy 2/medium 5/light 10) — cap số image-job CPU-nặng chạy song song; admission chỉ gate RSS, không gate CPU/count → 10 image job cùng lúc dù đủ RAM vẫn thrash CPU. (2) **queue isolation/fairness** — 3 queue riêng ⇒ backlog heavy 10k không chặn light/quick job; gộp 1 queue = head-of-line blocking. Admission bổ trợ, không thay tier. Muốn gọn hơn: thêm `memoryMb` hint per-job cho admission thông minh hơn (additive, vẫn giữ tier). |
| 32  | box1 2 replica trùng tên → khó phân biệt | ✅ done 08-10 — compose per-service `WORKER_LABEL` `${WORKER_LABEL}.1`/`.2`. Fleet giờ: central-leader · central-worker1 · **box1.1 · box1.2 · box2.1 · box2.2**, all heartbeat live. Recreate từng replica (`up -d --no-deps`) giữ fleet không gián đoạn; box2 deploy qua box1→LAN (SSH_ASKPASS, tailscale-SSH box2 chặn); 0 stale label. |

**⚠ Note (mới, ngoài job):** docker healthcheck của follower container flip `unhealthy` sau ~1min (probe sai, worker thật heartbeat=1 bình thường) — cosmetic, healthcheck cần sửa (HEALTH_PORT 3801 vs port worker thật). Không block.
| 33  | status xuống dưới tên + theme lên header góc phải icon-only | ✅ done 08-10 — fleetCard: `.statusline` riêng dưới name (không cùng hàng name/role). Theme toggle dời nav → header góc phải, icon-only ☀/☾ (bỏ chữ "theme"). Deployed. |
| 34  | Budget đồng nhất 5.19GB cả leader (≥2 job 4+1GB) | ✅ done 08-10 — `MEMORY_BUDGET_MB=5190` toàn bộ 6 worker (central compose 4000→5190, follower 5000→5190). Recreate từng replica, cả 6 live budget=5190. ⚠️ **box2 over-commit**: avail RAM chỉ **4654MB**, 2×5190=10380MB ceiling → nếu 2 heavy job (4GB RSS) spike cùng lúc = OOM. RSS thật ~600MB nên ngày thường OK. Central avail 12.6GB, box1 11.1GB — thoải mái. **Cần quyết box2**: (a) free RAM (staging fleet ăn ~11GB), (b) box2 budget exception ~2000, hay (c) box2 về 1 replica. |
| 35  | Config thêm host info: máy tên gì + OS + RAM(tổng+trống) + SSD(tổng+trống) | 🔄 pending — cần **per-box host agent** (README "Deferred"). Worker trong container không thấy đúng OS/hostname host; nguồn đúng = collector chạy trên host mỗi box ghi `worker:host:<box>` (hostname/OS/RAM/SSD, TTL) → dashboard đọc. 3 collector (central+box1+box2) + systemd timer. Net-new infra trên prod → chờ Tony gật approach. |
| 36  | Bỏ Queue Trends | ✅ done 08-10 — gỡ Trends tab (nav+view+JS lineChart/loadTrends) + server-side: endpoint `/api/metrics/queue-depth` + `startMetricsSampler` + orphan `core/metrics.mjs` (deleted). Deployed, boot log không còn `ctl:metrics`. |

37: phần Payload của từng jog, chỗ json data nên để chữ xanh như những loại json formater khác cho dễ nhìn, cả phần log thì cần màu chữ đẹp đẹp chút cho dễ nhìn
Steps 11–14 were the scale-out — **COMPLETE 2026-08-07**. See `prod-worker-scaleout-runbook.md`.
38: bỏ file accessToken + email trong payload data đi giúp t
## Jobs 15–20 — dashboard sync + Gen2 re-image (2026-08-07)

**Root finding.** Prod runs the **Gen1** worker image (`@minhdevtree/worker-sdk`, image `953d3496921c`) which
only writes a **thin heartbeat** `{workerId,hostname,pid,tiers,startedAt,lastBeat}`. The fleet-control
dashboard reads **rich telemetry** hashes that only **Gen2 `packages/functions/worker.mjs`**
(`@avada-falcon/worker-sdk`) writes: `worker:mem` / `worker:label` / `worker:version` /
`worker:running:<id>` / `worker:history:<id>` / `metrics:jobs|fail:<hour>`. box1/box2 followers are a
**clone of the same Gen1 image**, so they are thin too. Hence blank version/mem/history/reports (jobs 16/19b)
and container-id names instead of machine names (job 17). Fleet is **4 workers** (cloud leader + cloud
worker1 + box1 + box2), not 5 — the "5" was a miscount.

**Done now (Phase A — control-plane only, zero prod-worker risk):**
- **Job 18 — cleared.** The 208 medium + 1 heavy failed were all `recursive` / `count_optimized_images`
  jobs whose Firestore count query timed out (`14 UNAVAILABLE: deadline exceeded`,
  `historyRepository.js:847`). Newest **2026-08-03** (pre-scale-out), oldest April; **zero new failures
  since scale-out**. They accreted because `removeOnFail.count:5000`. Deleted job hashes + `:logs` + the
  `:failed` zsets on prod db0 (medium+heavy) — `wait`/`active`/`completed` untouched (medium active still 2).
  All tiers `failed:0`.
- **Job 19a — dashboard 24h window.** `core/fleet.mjs`: `getQueues` now returns `failedRecent`
  (`zcount :failed (now-FAILED_WINDOW_MS) +inf`, window default 24h, score = finishedOn); `getClusterHealth`
  drives the queue DOWN/degraded status off `totalFailedRecent`, not cumulative. `public/index.html` health
  row shows `failed 24h N (M all-time)`.
- **Job 20 — PII redaction.** Job-data payloads carry the full shop doc incl. `accessTokenHash` + `email`
  (+ other PII). `core/fleet.mjs` now scrubs a denylist of sensitive keys (`accessTokenHash`,
  `accessToken`, `email`, `crispSessionToken`) before returning `data` from `getJobDetail`/`getJobsByState`.
  Deployed to the leader (`~/fleet-control`, respawned via `pkill -f "bun server.mjs"` → systemd
  `Restart=always`, no sudo). Health `status:ok`.

**Doing (Phase B — re-image prod → Gen2, MANUAL DEPLOY, touches live merchant jobs):** see the Phase B
runbook block in `prod-worker-scaleout-runbook.md`. Staged canary: box1 → box2 → leader/worker1 (window).
Gen2 follower compose prepped at `docs/prod-worker-follower-compose-gen2.yml`. Blockers/decisions:
- Image must be a **git-traceable Gen2 build of the current branch** (reconciled with master 08-06) →
  `packages/functions/publish-worker.sh <tag>` from the Mac builds it on the build box `100.113.50.9`
  registry with a GIT_SHA-tagged image. box1/box2 pull from that registry (avada tailnet).
- **Cross-tailnet:** prod central `100.87.235.36` (tn221805) can't reach the build-box registry
  (`100.113.50.9`, avada tailnet) → leader/worker1 re-image needs `docker save | ssh | docker load` like
  the Gen1 clone.
- `publish-worker.sh` POSTs `/api/deploy` (Ansible rolling deploy) = a **deploy trigger** → Tuan runs it.
- Naming (job 17) folds in: set `WORKER_LABEL` per box in the Gen2 compose (box1 / box2 / central-prod).

**Jobs 21 + 22 (added 2026-08-10) — both are Gen1 telemetry-gap symptoms, resolve with Gen2:**
- **Job 22 — completed cap 1000 is NOT a fleet-control bug.** `getQueues` reads `completed` via
  `zcard(bull:worker-<tier>:completed)`; BullMQ `removeOnComplete` keeps only ~1000/tier
  (`dispatchWork.js:12` "keeps ~1000/tier"). Heavy + medium sit at exactly 1000 (retention cap),
  light 16 (real). The zset physically holds ≤1000, so zcard can never exceed it. The **true
  cumulative** processed count lives only in the hourly `metrics:jobs:<hour>` counters that
  **only Gen2 `worker.mjs` writes** — Gen1 prod writes none, so `getReports.total ≈ 0` today.
  Real number ⇒ Gen2. (Optional honest stopgap under Gen1: relabel the Completed column
  tooltip "retained ~1000; lifetime in Reports" — cosmetic, doesn't produce the real total.)
- **Job 21 — leader + worker1 show 0 jobs though processing.** Same Gen1 gap: dashboard reads
  `worker:running:<id>` / `metrics:jobs` which only Gen2 writes. Followers box1/box2 (Gen1 clone)
  identical. Resolves when the fleet is re-imaged Gen2 (Phase B).

## Gen2 cutover — DONE 2026-08-10 (jobs 16/17/19b/21/22/23)

Full fleet re-imaged Gen1→**Gen2** (`seo-worker:prod-gen2-1eed4e1`, built on prod central box).
Graceful-drain, zero-gap (started Gen2 before stopping Gen1). Final fleet = **4 Gen2 workers** on
prod db0, all publishing rich telemetry:

| worker | WORKER_ID | label | box |
|---|---|---|---|
| central-leader | `e8d4953472a2-1` | central-leader | cloud central |
| central-worker1 | `56b0b75765ca-1` | central-worker1 | cloud central |
| box1 | `413bd070befd-1` | box1 | office box1 |
| box2 | `f4f74ca28fed-1` | box2 | office box2 |

- **Central**: `~/seo-worker-gen2-build/compose.gen2-central.yml` (2 services, image + env, external net
  `seo-worker_default`, redis alias `redis:6379`, `REDIS_DB=0`). Gen1 `seo-worker-leader` +
  `seo-worker-seo-worker-1` graceful-stopped (`docker stop -t 40`, `unless-stopped` → won't auto-revive).
- **box1/box2**: `~/seo-worker-prod/compose.gen2-follower.yml` (`WORKER_LABEL=box{1,2} docker compose up`,
  `REDIS_HOST=100.87.235.36:6380` central redis over tailscale, `REDIS_DB=0`). Gen1 `seo-worker-prod-box{1,2}`
  graceful-stopped.
- **Gen2 has no CRON_LEADER** — `worker.mjs:334 registerCron` unconditional, BullMQ repeatable dedupes
  by key. No leader singleton needed.
- **Image ship**: central→box1 via Mac stream over gcp-gw (`docker save|gzip|ssh|docker load`, ~0.8MB/s,
  24min). box1→box2 over office LAN (fast). box2 SSH over tailscale is blocked by **Tailscale-SSH
  "additional check"** → reach box2 only via box1 over LAN (192.168.2.184) with SSH_ASKPASS (no sshpass
  on box1). box1/box2 creds: `projects/Falcon/ssh.md`.
- **Results**: dashboard `worker:version/label/mem/history/running` all populate (16/17/19b/21).
  Reports `/api/reports` total climbs from `metrics:jobs:<hour>` counters — real cumulative, not the
  retention-capped `completed` zcard (22). The 6 hung recursive jobs requeued → Gen2 processes them and
  now enforces the 540s timeout ([[seo-recursive-hang-leaks-active-slots]]).
- **Rollback**: Gen1 containers still exist (stopped) on all boxes; `docker start` them + `docker rm` the
  Gen2 to revert. Canary `seo-worker-prod-gen2-canary` stopped (folded into central-leader/worker1).

**Strategy A note:** `join-worker.sh` (registry pull) was abandoned — office box1/box2 are a live Gen2
staging fleet (box1 hosts `local-registry`), the old cloud box runs Gen1 prod build-local separately,
and no prod registry exists. Instead cloned the running prod image byte-identical:
`docker save seo-worker-seo-worker:latest` (cloud) → gzip → `docker load` (box1), then box1→box2 over
LAN. Followers: `~/seo-worker-prod/compose.prod-follower.yml`, `WORKER_ID=box{1,2}`, `CRON_LEADER=false`,
`REDIS_HOST=100.87.235.36:6380`, `LOKI_URL=""` (central loki bound 127.0.0.1). `redisCache 127.0.0.1:6379
→ disabled` is **pre-existing prod behavior** (identical on cloud leader/worker1), not a regression.

> **Branch:** `feat/worker-pubsub-migration` · **Repo:** `seo` · **Prod project:** `avada-seo`
> **Status (2026-08-07): scale-out LIVE.** Prod fleet = 4 workers on shared queue db0 — cloud central
> (leader + worker1) + box1 + box2 followers over Tailscale. All 4 heartbeats alive, both new followers
> processing prod jobs, RestartCount 0. HA via BullMQ stalled-recovery (~30s). Rollback = `docker compose
> -f ~/seo-worker-prod/compose.prod-follower.yml down` on either follower (central untouched). See
> `prod-worker-scaleout-runbook.md`.
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
  (singleton). Decided 2026-08-07: **the old cloud box stays central** (+ worker1) — it is the only
  box GCF can reach for enqueue (see below). box1/box2 are added as followers.
- **Worker boxes** (`compose.worker.yml`): a `seo-worker` follower pool pointing at the central
  redis over its Tailscale IP. Added with `join-worker.sh` (run from the Mac).
- **Rolling deploy** via Ansible (`fleet/inventory.ini` = Tailscale IPs, `deploy-workers.yml`
  `serial:2` drain/verify, `deploy-central.yml`). CI `build_worker_image` builds `Dockerfile.worker`
  once → `$CI_REGISTRY_IMAGE/seo-worker:<sha>`; boxes pull the image instead of rsync+rebuild.

**Target fleet** (decided 2026-08-07), all on the prod tailnet `tn221805@gmail.com`:

| Box | Tailscale name / IP | LAN | Role |
| --- | --- | --- | --- |
| old cloud box `seo-worker-box` (10.0.0.2 via gcp-gw) | *pending enrol* | — | **central**: redis + leader + bullboard (+ loki/grafana) **+ worker1** (unchanged) |
| box1 | `seo-worker-box1` / `100.123.202.84` | `192.168.2.204` | worker2 (follower) |
| box2 | `seo-worker-box2` / `100.104.18.124` | `192.168.2.184` | worker3 (follower) |

**Why central MUST stay on the old box (a box1-central pivot was considered and rejected):** GCF
`dispatchWork` enqueues to redis over a **GCP-reachable address** — prod `REDIS_HOST` was
`10.62.180.107`, a GCP-internal IP (`.env.local:44`). box1/box2 are office/NAT boxes GCF cannot
reach, and GCF is not on the tailnet. Only the old cloud box is **dual-homed** (GCP-internal for GCF
+ Tailscale for the followers), so it is the only box that can hold the queue. Moving central to
box1 would leave GCF unable to enqueue → every fleet job would fall back to Pub/Sub → the fleet would
receive nothing.

**This makes the migration a scale-out, not a cutover.** The old box + its db0 queue stay exactly as
they are; we only **add box1/box2 as followers** pointing at the old box's redis over Tailscale. No
redis move, no GCF change, no leader migration. Full step-by-step:
`prod-worker-scaleout-runbook.md`.

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

1. **Tailscale on box1 + box2** (§4) — DONE. Both on the `tn221805` tailnet, mesh verified.
2. **Merge fleet infra ↔ master** (§2) — DONE 2026-08-06.
3. **Enrol the old cloud box on the tailnet** (§4) — so followers can reach its redis over the mesh.
   Additive; the old box keeps serving prod. Needs a shell on the box (gcp-gw) — **blocked on sudo**.
4. **Build + push the amd64 worker image** (`build_worker_image`). Boxes are amd64; build `linux/amd64`.
5. **Add box1 + box2 as followers** via `join-worker.sh` from the Mac, each pointing at the OLD box's
   redis (`--redis-db 0`, `CRON_LEADER=false`). The old box keeps the single leader.
6. **Verify the pool** — 3 heartbeats, Bull Board consumers, a test job, tier coverage.

No cutover, no redis move, no GCF change — the old box stays central throughout. Detailed steps:
`prod-worker-scaleout-runbook.md`.

## 4. Step 1 runbook — Tailscale on the prod boxes

Additive networking only. Does **not** touch the running worker containers or the prod Redis (db0)
queue — safe on the live boxes.

**Status (2026-08-07):** account chosen = **`tn221805@gmail.com`** (a dedicated Google account the
owner is admin of → own tailnet `tail71d230.ts.net`; effectively path **B** below since the owner
has no `avadagroup.com` admin). **box1 + box2 enrolled** (`seo-worker-box1` 100.123.202.84 @
192.168.2.204, `seo-worker-box2` 100.104.18.124 @ 192.168.2.184), key-expiry disabled on both, mesh
verified 2–3 ms. The reusable auth-key used to enrol them has been **revoked** (already-joined nodes
keep their own node-key). box1/box2 are **followers**, not central.

**Old cloud box `seo-worker-box` (10.0.0.2 via `gcp-gw` 34.87.163.45, user `avada`) — the central,
enrol PENDING (critical path).** It must join the tailnet so box1/box2 can reach its redis over the
mesh. I have a shell on it via the deploy SSH key (ProxyJump gcp-gw), but `tailscale up` needs
**sudo** and the classifier won't let me pipe a sudo password into a prod box — so the owner runs the
enrol (see the runbook Step 1). Interactive login (no auth-key) works: `sudo tailscale up --ssh
--hostname seo-worker-central-prod --accept-dns=false` → approve the printed URL in a browser logged
into `tn221805@gmail.com`. No `--advertise-routes` (cloud box, not the office LAN).

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
