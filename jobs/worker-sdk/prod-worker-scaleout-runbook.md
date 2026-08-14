# Runbook Scale-Out Worker Prod — thêm box1 + box2 làm follower

> **✅ ĐÃ CHẠY XONG 2026-08-07 (Strategy A).** Fleet prod = 4 worker (cloud leader+worker1 + box1 + box2
> follower), 4 heartbeat sống, cả 2 follower ăn job prod db0, RestartCount 0. Doc giữ làm reference +
> rollback + tái lập. Đi kèm `prod-worker-migration-handoff.md`. Repo `seo`, nhánh
> `feat/worker-pubsub-migration`, project prod `avada-seo`.
>
> Canonical: `second-brain/jobs/prod-worker-scaleout-runbook.md`. Mirror đồng bộ trên nhánh seo tại
> `docs/prod-worker-scaleout-runbook.md` — sửa canonical rồi re-sync, đừng để lệch.

## Đây là gì (và KHÔNG phải gì)

Đây là **scale-out**, không phải cutover. Con cloud cũ giữ nguyên — **central** (redis + leader +
bullboard) **+ worker1** — vẫn serve prod. Chỉ **thêm 2 worker follower** (box1, box2) trỏ vào redis
của con cũ. Dựa trên `WORKER-SDK.vi.md` §13 "Scaling across machines" và các file fleet
(`join-worker.sh`, `compose.worker.yml`).

**Fleet cuối:**

| Box | Vai trò | Redis dùng | CRON_LEADER |
| --- | --- | --- | --- |
| con cloud cũ `seo-worker-box` (10.0.0.2) | central + leader + **worker1** | redis của chính nó, `:6380` | **true** (không đổi) |
| box1 `seo-worker-box1` (100.123.202.84 / 192.168.2.204) | worker2 (follower) | redis con cũ `:6380` qua Tailscale | false |
| box2 `seo-worker-box2` (100.104.18.124 / 192.168.2.184) | worker3 (follower) | redis con cũ `:6380` qua Tailscale | false |

**Vì sao con cũ BẮT BUỘC làm central:** GCF `dispatchWork` enqueue vào redis qua **địa chỉ GCF
reach được** (prod `REDIS_HOST` = `10.62.180.107`, nội bộ GCP). box1/box2 là máy office sau NAT —
GCF không reach được. Chỉ con cloud cũ là **dual-homed** (nội bộ GCP cho GCF + Tailscale cho
follower), nên nó là box duy nhất giữ được queue. Follower nằm đâu trên tailnet cũng được.

## Mô hình an toàn

- **Additive.** Con cũ + queue db0 không đụng tới. Chỉ start thêm container follower ở chỗ khác. Có
  gì bất thường → **stop container box1/box2** → về lại prod single-box hiện tại. Không migrate data,
  không đổi GCF.
- **HA miễn phí.** Có ≥2 worker → BullMQ stalled-job recovery (~30 giây) tự chạy — job đang xử lý của
  worker crash được re-queue tự động (`WORKER-SDK.vi.md` §13).
- **Fallback `dispatchWork`.** Fleet unhealthy → GCF fallback Pub/Sub (§6a handoff), giữa chừng cũng
  không mất job.
- **db 0 = PRODUCTION.** `join-worker.sh` từ chối đoán redis DB; mình truyền `--redis-db 0` tường
  minh. Sai DB = follower vào nhầm queue.

## Điều kiện tiên quyết

- [x] box1, box2 đã lên tailnet `tn221805` — **XONG** (mesh 2–3 ms, key-expiry off).
- [x] Con cloud cũ lên cùng tailnet — **XONG** `seo-worker-central-prod` = `100.87.235.36` (key-expiry off, 2026-08-07).
- [x] Thông số central đã confirm (Bước 2, 2026-08-07): redis `100.87.235.36:6380`, **plain TCP no TLS**, db0, firewall tailnet→6380 OPEN.
- [ ] Image worker đã build + push từ nhánh đã merge (Bước 3).
- [ ] Firebase service-account JSON prod có sẵn ở local để đẩy lên box.
- [ ] Biết password redis central + password dashboard (từ `.env` con cũ: `/home/avada/Projects/seo-worker/.env`, key `REDIS_PASSWORD` + `WORKER_DASHBOARD_PASSWORD`).

---

## Bước 1 — enroll con cloud cũ lên Tailscale — ✅ XONG 2026-08-07

`seo-worker-central-prod` = **`100.87.235.36`**. Key-expiry off. Mesh 4 node (Mac + box1 + box2 +
central). Lệnh đã chạy trên box (user tự chạy vì classifier không cho pipe sudo pass vào prod):

```bash
sudo tailscale up --ssh --hostname seo-worker-central-prod --accept-dns=false
```

## Bước 2 — confirm thông số central con cũ — ✅ XONG 2026-08-07

Đọc từ `docker ps` + `docker-compose.yml` + `.env` con cũ (`/home/avada/Projects/seo-worker/`), test
firewall bằng `nc` từ Mac (tailnet node). Kết quả follower phải khớp:

| Thông số | Giá trị | Nguồn |
|---|---|---|
| `REDIS_HOST` | `100.87.235.36` | tailnet IP central-prod |
| `REDIS_PORT` | `6380` | compose publish `0.0.0.0:6380->6379` |
| `REDIS_TLS` | **false** (plain TCP) | `redis:7-alpine`, `redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}` — không `--tls` |
| firewall tailnet→6380 | **OPEN**, không cần rule | `nc -z 100.87.235.36 6380` từ Mac = succeeded |
| `REDIS_PASSWORD` | `.env` con cũ key `REDIS_PASSWORD` | copy sang `.env.prod` |
| `WORKER_DASHBOARD_PASSWORD` | `.env` con cũ | copy sang `.env.prod` |
| db | `0` — prod, 4477 key, tier `bull:worker-{light,medium,heavy}` | `redis-cli DBSIZE` |
| heartbeat hiện tại | 2: `leader` + `a9bf0cec7c67-1` (worker1) | `KEYS *heartbeat*` |

**Gotcha 1 — Loki bind `127.0.0.1:3100`** (compose loki port `127.0.0.1:3100->3100`): follower KHÔNG
ship log central qua tailnet (`nc` 3100 từ Mac = blocked). Chọn 1:
- **(a)** để `LOKI_URL` trống → follower log ra stdout/docker logs của chính nó (đủ để debug per-box).
- **(b)** muốn log tập trung: rebind loki con cũ `0.0.0.0:3100` (sửa compose central, `docker compose up -d loki`), rồi `LOKI_URL=http://100.87.235.36:3100`. Đây là thay đổi con central → cân nhắc, không bắt buộc cho scale-out.

**Gotcha 2 — con cũ show `unhealthy` là FALSE-POSITIVE.** Healthcheck = `wget localhost:3800/health`;
chỉ `seo-bullboard` serve port 3800, container `seo-worker-leader`/`seo-worker-1` không có route đó →
exit 1 câm. Worker **đang xử lý job thật** (batch optimizeImage 03:31 UTC hôm nay). Đừng restart vì
"unhealthy". Follower mới dùng cùng image sẽ cũng show unhealthy — bình thường; verify bằng heartbeat,
không bằng health status.

> **Strategy A (chốt 2026-08-07): clone image prod đang chạy, KHÔNG registry, KHÔNG join-worker.sh.**
> Lý do: office box (box1/box2) là fleet Gen2 LIVE đang chạy staging (box1 có `local-registry` +
> `functions-seo-worker`/`staging4`/`staging`; box2 pull từ registry box1). Con cloud cũ chạy Gen1
> prod build-local **tách biệt**, image `seo-worker-seo-worker:latest` (`953d3496921c`). join-worker.sh
> giả định Gen2 registry pull → không khớp prod. Clone thẳng image prod = byte-identical, additive,
> không đụng config central, không đụng staging fleet đang chạy trên office box.

## Bước 3 — clone image prod sang box  *(từ Mac, additive)*

`docker save` image prod trên con cũ, gzip, stream qua Mac → `docker load` box1. Không registry.

```bash
# cloud→box1 (Mac relay). gzip -1 cho nhanh; ~1.1GB nén.
ssh -F <gwconfig> seo-worker-box 'docker save seo-worker-seo-worker:latest | gzip -1' \
  | sshpass -e ssh <opts> avada@100.123.202.84 'docker load'
# box1→box2 sau (LAN nhanh, khỏi WAN lần 2): xem Bước 7.
```

- Verify trên box1: `docker images | grep seo-worker-seo-worker` → thấy `:latest 953d3496921c`.
- Office box có sẵn Docker + user `avada` in docker group (không cần sudo cho docker).

## Bước 4 — stage secret + compose lên box  *(secret off-argv)*

Follower cần: `prod.env` (copy nguyên `.env` con cũ — 62 key, mang secret giải mã shop token),
`credentials/firebase.json` (prod SA, project `avada-seo`), `compose.prod-follower.yml`.

```bash
# deploy dir riêng, không đụng staging fleet: ~/seo-worker-prod/
scp compose.prod-follower.yml prod.env  avada@<box>:~/seo-worker-prod/
scp credentials/firebase.json           avada@<box>:~/seo-worker-prod/credentials/
```

`compose.prod-follower.yml` (canonical trong scratchpad session): image `seo-worker-seo-worker:latest`,
`REDIS_HOST=100.87.235.36 REDIS_PORT=6380 REDIS_TLS=false`, `LOKI_URL=""` (Gotcha 1), `CRON_LEADER=false`,
`WORKER_ID=${WORKER_ID}`, `env_file: prod.env`. **`REDIS_PASSWORD`/`WORKER_DASHBOARD_PASSWORD` chỉ lấy
từ `env_file`** — KHÔNG khai lại trong `environment: ${VAR:-}` (shell unset sẽ ghi rỗng đè, gãy auth).

> ⚠️ Spread prod secret ra máy office. Đã duyệt (mày). Xoá staged copy khỏi Mac scratchpad sau khi xong.

## Bước 5 — bring up box1 (CANARY)  *(chạm prod queue — thận trọng)*

Một follower trước, xem nó ăn job sạch rồi mới thêm box2.

```bash
ssh avada@100.123.202.84 'cd ~/seo-worker-prod && WORKER_ID=box1 docker compose -f compose.prod-follower.yml up -d'
```

- Container `seo-worker-prod-box1`, `CRON_LEADER=false` — con cũ giữ leader duy nhất (KHÔNG double cron).
- Ăn ngay job prod db0. Nếu image/secret sai → job fail; BullMQ stalled-recovery (~30s) trả lại queue,
  con cũ vẫn xử lý. Rollback tức thì = `docker compose down` (Bước 9).

## Bước 6 — verify canary box1  *(t làm được)*

```bash
# heartbeat: kỳ vọng 3 (leader + a9bf0cec7c67-1 + box1). Chạy trên con cũ:
docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" seo-redis redis-cli -n 0 KEYS 'worker:heartbeat:*'
# log follower: xử lý job thật, không crash loop
ssh avada@100.123.202.84 'docker logs --tail 40 seo-worker-prod-box1'
```

Pass = heartbeat `worker:heartbeat:box1` xuất hiện + log follower xử lý job có workerId box1, không
restart loop. **Chỉ qua box2 khi box1 xanh.**

## Bước 7 — bring up box2  *(sau khi box1 xanh)*

Clone image box1→box2 qua LAN (nhanh), rồi up tương tự. box2 reach qua **LAN `192.168.2.184`** (né
tailscale-ssh check trên tailnet IP):

```bash
# image box1→box2 (cả 2 office, LAN):
ssh avada@192.168.2.204 'docker save seo-worker-seo-worker:latest | gzip -1' \
  | sshpass -e ssh avada@192.168.2.184 'docker load'
# stage secret + up (WORKER_ID=box2):
ssh avada@192.168.2.184 'cd ~/seo-worker-prod && WORKER_ID=box2 docker compose -f compose.prod-follower.yml up -d'
```

## Bước 8 — verify pool đủ + tier coverage

```bash
# 4 heartbeat: leader + worker1 + box1 + box2
docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" seo-redis redis-cli -n 0 KEYS 'worker:heartbeat:*'
```

`WORKER-SDK.vi.md` §13 — bẫy stall câm: nếu **mọi** worker set `concurrency:0` cho 1 tier, job tier đó
nằm im redis mãi mãi, không error. Image clone giữ config `{heavy:2, medium:5, light:10}` mặc định →
cả 3 tier phủ trên mọi box, an toàn. Chỉ specialize sau.

Pass = 4 heartbeat sống, cả 2 follower show `active` trên các tier, job prod được follower xử lý.

## Bước 9 — rollback

Follower additive. Undo 1 box:

```bash
ssh avada@<box> 'cd ~/seo-worker-prod && docker compose -f compose.prod-follower.yml down'
```

Con cũ (central + leader + worker1) chạy suốt — rollback chỉ bỏ worker thêm. Không đổi db0, không đổi
GCF, không migrate queue. Staging fleet trên office box không bị đụng (deploy dir + container name riêng).

---

## Open items cần confirm trước khi chạy

1. ~~Redis :6380 plain hay TLS?~~ ✅ **plain, REDIS_TLS=false** (Bước 2).
2. ~~Host firewall tailnet→:6380?~~ ✅ **OPEN, không cần rule** (Bước 2).
3. **Đường image:** CI `build_worker_image` (+registry read token trên box) hay rsync cũ. (Bước 3) — CÒN MỞ.
4. **Firebase service-account JSON prod** nằm đâu để đẩy qua `--firebase-json`. Con cũ có `/home/avada/Projects/seo-worker/credentials/` — check file trong đó. (Bước 5–6) — CÒN MỞ.
5. **Đặt tên `WORKER_ID`** cho box1/box2 (label heartbeat) — gợi ý `box1`/`box2`. (Bước 5–6).
6. **Loki centralize?** (Gotcha 1) — mặc định LOKI_URL trống; rebind chỉ khi muốn log tập trung. — QUYẾT ĐỊNH.
