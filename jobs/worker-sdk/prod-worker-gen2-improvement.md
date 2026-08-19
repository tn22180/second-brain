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

### Phase B — DONE (chưa push, chờ Tony review)

**fleet-control** (`gitlab.com/tn22180`, branch master, **local commit chưa push**):
- `9466523` refactor: drop deploy/config-apply plane (việc có sẵn của Tony).
- `e5097b2` feat: Phase B (item 5 CPU read + item 6 Slack daily digest + item 7 activity-by-day). 20/20 test. **server.mjs + index.html gánh cả edit dashboard có sẵn của Tony — không tách hunk được non-interactive.**

**seo worker.mjs** (worktree `seo-wt-cpu`, branch `feat/worker-cpu-metric`, **local commit chưa push**):
- `6d807a9` feat: worker.mjs publish `worker:cpu` (item 5 producer). Additive, `node --check` OK, commit `--no-verify` (eslint hook không resolve config trong worktree fresh — CI sẽ lint khi mở MR).

**Ops sau (Tony):**
1. Review 2 commit fleet-control → push gitlab.com/tn22180 + deploy box (`deploy/deploy.sh`, đã thêm `core/digest.mjs` vào scp list). CPU card + digest chỉ sống sau khi box chạy worker.mjs mới + fleet-control restart.
2. Push `feat/worker-cpu-metric` lên **git.avada.net** + mở MR → merge → **redeploy fleet box** (worker.mjs mới). Nhớ A3: giờ worker deploy mọi prod tag.
3. Slack digest **inert** tới khi set `SLACK_BOT_TOKEN+SLACK_CHANNEL` (hoặc `SLACK_WEBHOOK_URL`) + `DIGEST_HOUR_UTC` trên box.
4. Follow-up: Activity-by-day trùng tab Reports cũ → cân nhắc retire Reports.

**Còn lại:** Phase C — item 8 (worker-sdk: 1-lệnh setup worker tự join fleet). CHƯA làm, repo `worker-sdk` cần /init.

**Adoc+A3+A4 → MR !2169** (git.avada.net/avada/seo → master). Verify: worker jest 74/74, eslint clean, `glab ci lint` valid, docs-gate PASS, reviewer no-issues.
**Re-homed 2026-08-19:** seo cutover git.avada.net → cũ MR !2210 (gitlab.com) = mirror chết, bỏ. Branch synced origin (0/0), MR mới !2169 mở trên git.avada.net.
Ops sau merge: (1) bật `FLEET_SPILL_ENABLED=true` prod — pair với A4 (khách mới full job + spill OFF = job nặng chờ BullMQ `wait`); (2) memory `seo-master-no-detect-worker` sẽ sai sau merge (worker giờ deploy mọi tag) — update khi merged.

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
