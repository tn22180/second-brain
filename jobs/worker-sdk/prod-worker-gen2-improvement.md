1. worker các tier như heavy, medium, light đang định nghĩa và phân chia job như thế nào. theo quy định của t là job >=4GB (4Gib, 8Gib) là heavy >=2GB < 4GB là medium (2Gib), còn <2GB là light (là 1Gib và 512Mib, 256Mib), nếu chưa có cần phân rõ như thế
2. phần queue đang chưa có fallback qua GCF, mục tiêu của t là hướng tới chạy song song cùng GCF, tức là nếu worker đang bận cả thì queue bắn qua GCF luôn
3. deploy functions của GCF + deploy worker song song luôn vì dùng cùng nhau không vì mục đích gì nữa
4. tất cả khách mới mới cài app sẽ được bật full worker job
5. worker cần thêm phần CPU đang chạy ở Fleet
6. theo dõi 1 ngày sẽ báo lại fleet-alert (Slack) số job trong 1 ngày, thời điểm nào dùng nhiều nhất + cảnh báo khi worker sắp tràn + cảnh báo worker healthy
7. làm thêm 1 page activity theo ngày + top job
8. cách setup 1 worker nhanh nhất với 1 lệnh chạy kể cả máy khác mạng có thể chạy từ máy đó tự connect lại với fleet để đồng bộ fleet control

---

## Progress

Started: 2026-08-14

**Phân rã theo repo** (8 mục / 3 repo):

- **Phase A — song song GCF** (repo `seo`, không cần /init): mục 1, 2 (đang làm) → 3, 4
- **Phase B — observability** (repo `fleet-control`, cần /init): mục 5, 6, 7
- **Phase C — provisioning** (repo `worker-sdk`, cần /init): mục 8

**Quyết định kiến trúc (chốt với Tony):** spill GCF theo **memory thật** (a1). Data đã có sẵn trong redis — `worker:mem` hash = `reserved:budget`/worker (worker.mjs:229). worker-sdk KHÔNG cần sửa cho Phase A. CPU (mục 5) + activity (mục 6/7) cũng dùng redis-key sẵn (`metrics:jobs:<hour>` TTL 15d).

Worktree cô lập: `../seo-wt-fleet-spill` @ `feat/fleet-memory-spill` (off origin/master 23fee0e530).
Mục 1+2 → **MR !2204** (avada/seo). Bật prod: `FLEET_SPILL_ENABLED=true` sau merge.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| A1 | Mục 1: drift-test tier↔RAM band | inline | ✅ | 0/5 | clean | 23/23 pass, 29 dòng test-only |
| A2 | Mục 2: spill GCF theo memory (`worker:mem`) | inline + cavecrew-reviewer | ✅ | 0/5 | clean | 72/72 pass, reviewer no-issues, isolated. **MR !2204 merged, deploy v1.85.64 prod OK** |
| Adoc | Item a: docs feature-spill (đóng docs_gate gap) | inline | ✅ | 0/5 | clean | `docs/features/worker-fleet-spill.md`, docs-gate PASS |
| A4 | Mục 4: khách mới bật worker job (test cohort) | inline + cavecrew-reviewer | ✅ | 0/5 | clean | `installationService:73` → `NEW_SHOP_WORKER_JOBS` (11 job nhẹ/core, né heavy 4GB — Tony chốt test trước). Drift-guarded, 74/74 pass |
| A3 | Mục 3: deploy functions + worker song song | inline + cavecrew-reviewer | ✅ | 0/5 | accepted | `.gitlab-ci.yml` deploy_worker→ mọi prod tag, `allow_failure:true`. Blast radius: mọi release đụng box (Tony chốt) |
| Binit | fleet-control CLAUDE.md (Tony authorize thay /init) | inline | ✅ | 0/5 | clean | Ground từ server.mjs/fleet.mjs/alerter.mjs. Repo = control plane Bun, origin gitlab.com/tn22180 (KHÔNG migrate) |
| B6 | Mục 6: Slack daily digest (job/ngày + peak + near-overflow + healthy) | general-purpose / sonnet | ✅ | 0/5 | clean | `core/digest.mjs` pure + `digest.test.mjs` 6/6 pass. `alerter.mjs` factor `selectSlackTransport` (giữ nguyên startAlerter), `startDailyDigest` firedOn guard + unref. server.mjs +1 call. Inert nếu chưa set Slack |
| B7 | Mục 7: activity page theo ngày + top job | general-purpose / sonnet | ✅ | 0/5 | clean | `index.html` Activity thêm 2 card: bar chart theo ngày (inline SVG, switch 24h/7d/14d) + Top jobs (fail%). `activity.util.mjs` 4 pure fn + test 9/9. Label YYYYMMDD→MM-DD. Overlap Reports tab (follow-up retire) |
| B5a | Mục 5: worker.mjs publish `worker:cpu` (loadavg+cores) | general-purpose / sonnet | ✅ | 0/5 | clean | worktree `seo-wt-cpu` @ feat/worker-cpu-metric. +19 dòng, `syncCpu` timer 15s, hdel lúc shutdown. `node --check` EXIT=0. Contract: `worker:cpu` field `<load1>:<cores>`. Cần redeploy box |
| B5b | Mục 5: fleet-control đọc `worker:cpu` → card CPU% | general-purpose / sonnet | ✅ | 0/5 | clean | `fleet.mjs` `parseCpu` pure + `hgetall worker:cpu` + box field cpuLoad1/cpuCores/cpuPct. `index.html` card cpu bar (null→"—"). `cpu.parse.test.mjs` 5/5. Full suite 20/20 |

**Phase B** (repo `fleet-control`, origin gitlab.com/tn22180 — không migrate). CLAUDE.md tự viết (Tony authorize). Item 5 chốt: CPU nguồn = worker.mjs bắn `worker:cpu`. B6+B7 chạy trước (fleet-control only, song song); B5 cross-repo sau.
**Git hygiene:** worktree fleet-control có sẵn uncommitted deploy-plane removal (deploy.mjs/metrics.mjs/validateWorkerConfig.mjs xoá + server.mjs gỡ endpoint + README/deploy.sh) TRƯỚC khi Phase B vào. Chốt Tony: **2 commit tách** — (1) deploy-plane removal của Tony, (2) Phase B (digest/activity/cpu-read + CLAUDE.md). B5a ở worktree seo-wt-cpu riêng (sạch).

### Phase B — DONE + PUSHED

**seo worker.mjs** (item 5 producer) → **MR seo !2181 MERGED** vào master (`33c8e8ec39`). `worker:cpu` field `<load1>:<cores>`, timer 15s, hdel lúc shutdown.

**fleet-control** (`gitlab.com/tn22180`) — master rewound về `337d077`, push 2 branch stack, **2 MR mở**:
- **!2** `refactor/drop-deploy-plane` (`9466523`) → master — drop deploy/config-apply plane.
- **!3** `feat/cpu-digest-activity` (`e5097b2`) → refactor/drop-deploy-plane (stacked, diff sạch) — item 5 CPU read + item 6 Slack digest + item 7 activity-by-day. 20/20 test.
  - Merge thứ tự: **!2 trước, rồi !3** (GitLab tự retarget !3 về master sau khi !2 merge).

**Ops sau (Tony):**
1. Merge fleet-control !2 → !3 → deploy box (`deploy/deploy.sh` đã thêm `core/digest.mjs` scp). CPU card + digest sống sau khi box chạy worker.mjs mới + fleet-control restart.
2. **Redeploy fleet box** để worker.mjs mới (worker:cpu) có data. Nhớ A3: worker giờ deploy mọi prod tag.
3. Slack digest **inert** tới khi set `SLACK_BOT_TOKEN+SLACK_CHANNEL` (hoặc `SLACK_WEBHOOK_URL`) + `DIGEST_HOUR_UTC` trên box.
4. Follow-up: Activity-by-day trùng tab Reports cũ → cân nhắc retire Reports.

### Phase C — item 8 self-join (đang build)

Item 8 home = **seo/packages/functions** (KHÔNG worker-sdk — provisioning `install.sh`/`join-worker.sh`/compose ở đây). worker-sdk chỉ là lib, không cần /init.
Đã có sẵn: `install.sh` (box-side: tailscale up + pull + up + enroll) + `join-worker.sh` (Mac push). Thiếu = **self-service từ box khác mạng**.

Design chốt (AskUserQuestion): central serve bundle secret trên **tailnet-only**, gated **single-use provisioning token**. 3 file + doc + test:
| # | File | Role |
|---|------|------|
| C8-a | `provision-server.mjs` (central, Node, bind tailscale0 only) | GET /provision?env= Bearer token single-use (redis GETDEL) → tar.gz {install.sh, compose, firebase.json, app-secrets.env, join.env+RUN_FLAGS}. Audit. |
| C8-b | `self-join.sh` (box, no secret) | tailscale up (handed key) → curl central token → chạy install.sh |
| C8-c | `mint-provision-token.sh` (central) | sinh token, lưu SHA256 hash + TTL vào redis, in raw 1 lần |
| C8-doc | `fleet/self-join.md` | operator flow + Tailscale ACL tag:worker-box + systemd + security model |
| C8-test | `provisionBundle.js` pure + test | bind guard / env allow-list / app-secrets strip |

Worktree `seo-wt-selfjoin` @ feat/fleet-self-join. **DONE + MR seo !2184 MERGED** vào master. Commit `7c5c565302`, 6 file. Verify: jest 14/14, node --check + bash -n OK, ESM→CJS import OK, bind-guard fail-closed live. **§8 clean** (no secret literal/dep, bind tailnet-only, token single-use GETDEL, bearer via 0600 header file, redis-pw via REDISCLI_AUTH, audit hash-prefix). Accept: `tailscale up --authkey` trên argv = khớp precedent install.sh. Minor: typo env cháy token; unpinned token pull mọi env (doc khuyến prod pinned). **Inert tới khi cài systemd + Tailscale ACL tag:worker-box→provision port.**

---

## TỔNG KẾT — COMPLETE (8/8 mục done, tất cả pushed)

Cập nhật 2026-08-20. Phase A (1-4) + Phase B (5-7) + Phase C (8) xong, code lên MR hết. Còn lại = deploy/merge/ACL tay Tony.

### MR ledger

| Repo | MR | Mục | State |
|---|---|---|---|
| seo (git.avada.net) | **!2169** | Adoc + A3 + A4 | mở, chờ Tony merge |
| seo (git.avada.net) | **!2204** | A1 + A2 (spill memory) | MERGED, deploy v1.85.64 prod OK |
| seo (git.avada.net) | **!2181** | B5 worker:cpu producer | MERGED master `33c8e8ec39` |
| seo (git.avada.net) | (ollama) | no-keys degrade → OpenRouter | MERGED master `080155bc58` |
| seo (git.avada.net) | **!2184** | C8 self-join | MERGED master |
| fleet-control (gitlab.com/tn22180) | **!2** | drop deploy-plane | mở |
| fleet-control (gitlab.com/tn22180) | **!3** | B5-read + B6 digest + B7 activity (stacked trên !2) | mở |

**Adoc+A3+A4 → MR !2169** verify: worker jest 74/74, eslint clean, `glab ci lint` valid, docs-gate PASS, reviewer no-issues.
**Re-homed 2026-08-19:** seo cutover git.avada.net → cũ MR !2210 (gitlab.com) = mirror chết, bỏ. MR mới !2169 trên git.avada.net.

### Ops còn tay Tony
1. Merge seo **!2169**; fleet-control **!2 → !3** (đúng thứ tự).
2. Bật `FLEET_SPILL_ENABLED=true` prod — pair với A4 (khách mới full job + spill OFF = job nặng chờ BullMQ `wait`).
3. **Redeploy fleet box** để worker:cpu (!2181) có data; deploy fleet-control box (digest/activity/cpu-read).
4. Item 8 vào prod: cài systemd provision-server (central) + Tailscale ACL `tag:worker-box` → provision port 3990. Mỗi box mới: mint token + ephemeral tailscale key.
5. Slack digest inert tới khi set `SLACK_BOT_TOKEN+SLACK_CHANNEL`/`SLACK_WEBHOOK_URL` + `DIGEST_HOUR_UTC`.
6. Memory `seo-master-no-detect-worker` sai sau khi !2169 merge (A3 → worker deploy mọi prod tag) — update.

### Log

#### ⬜ Task A1: drift-test tier↔RAM band
- Status: ⬜ pending
- Plan:
  - Goal: test assert mỗi job trong worker.config.yml có `tier` khớp band memoryMb (heavy≥4096, medium 2048–4095, light<2048). Xanh với config hiện tại.
  - Files allowed: `packages/functions/src/helpers/worker/__tests__/tierMemoryBand.test.js` (new)
  - Approach: đọc worker.config.yml qua js-yaml, loop jobs, assert band. Rejected: hard-code list (drift ngay).
  - Test command: `npx jest packages/functions/src/helpers/worker/__tests__/tierMemoryBand.test.js` → pass
  - Risk: test-only, không đụng runtime. Zero blast radius.
  - Rollback: xoá file test.
- Rounds used: 0/5
- Security check: -

#### ✅ Task A2: spill GCF theo memory
- Status: ✅ completed (0 round, reviewer no-issues, §8 clean, 72/72)
- Plan:
  - Goal: khi KHÔNG worker nào còn free RAM ≥ job.memoryMb → spill GCF (thay logic count-slot). spillPolicy.test cập nhật semantics memory + xanh.
  - Files allowed: `spillPolicy.js`, `fleetHealth.js`, `dispatchWork.js`, `__tests__/spillPolicy.test.js`, `__tests__/tierMemoryBand.test.js` (thêm JOB_MEM drift). Không đụng file khác.
  - Approach: `JOB_MEM` static map trong spillPolicy (mirror config, drift-test guard, giữ purity no-I/O); `getFleetLoad` đọc `worker:mem` HGETALL → `maxFreeMb` (= max free của worker LIVE; telemetry-gap → Infinity = fail toward fleet, không over-spill GCF); `decideSpill`: `mem > maxFreeMb` → spill. Rejected: đọc yaml trong spillPolicy (phá purity); list per-worker bin-pack (maxFree đủ — job nhét được ⟺ ∃ worker free≥mem = max).
  - Test command: `npx jest packages/functions/src/helpers/worker` → all pass
  - Risk: prod routing path, NHƯNG `FLEET_SPILL_ENABLED` unset ở prod → code ngủ tới khi Tony bật. Telemetry-gap guard chặn over-spill.
  - Rollback: revert commit; hoặc để flag off = no-op.
- Rounds used: 0/5
- Security check: -
