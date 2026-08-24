# Beszel monitoring — SEO worker fleet + GCP VMs

Brief for `/tony-wf`. Created 2026-08-22.

## Goal

Một dashboard resource duy nhất cho toàn bộ máy mà team SEOOn sở hữu: 3 box worker fleet
(Tailscale) + 4 VM GCP. CPU / RAM / disk / net / temp ở mức **host**, và mức **container**
cho từng replica worker. Hub tự host, chỉ vào được qua Tailscale.

## Vì sao Beszel, không phải thứ đang có

| Đang chạy | Cho cái gì | Thiếu cái gì |
|---|---|---|
| `fleet-control` :3900 | queue depth, heartbeat, job state, throughput | zero host metric ngoài hash `worker:host` (TTL 90s, collector không nằm trong repo nào) |
| Loki 3.0 + Grafana 11.2 trên central | log | không có node_exporter / cAdvisor / Prometheus → không có metric tài nguyên |
| GCP ops-agent (chỉ `instance-20260428-095447`) | host metric của đúng 1 VM | không có container metric, không phủ box fleet |

Beszel bù đúng khoảng trống đó. Không thay `fleet-control` (job semantics) và không thay Loki (log).

## Kiến trúc

**Hub và agent đều là binary + systemd. Agent nối hub qua WebSocket outbound.**

Loại bỏ *chạy trong Docker*: thứ giám sát Docker không nên chết cùng Docker daemon.
`fleet-control` cũng đã là host systemd unit — giữ nhất quán.
Loại bỏ *SSH mode* của Beszel: box1 tắt Tailscale-SSH, WS outbound đi được bất kể ACL SSH.

```
                    ┌─ central 100.87.235.36 ─────────────┐
                    │  beszel-hub  :8090  (systemd)       │
                    │  ufw: allow tailscale0 only         │
                    └──────────────▲──────────────────────┘
                       WS outbound │ HUB_URL + TOKEN
        ┌──────────────┬───────────┴────────┬──────────────┐
   central agent   box1 agent          box2 agent     4× GCP VM agent
   (docker.sock)   (docker.sock)       (docker.sock)  (tag:monitored)
```

## Host trong scope

| Host | Địa chỉ | Vai trò | Ghi chú |
|---|---|---|---|
| `seo-worker-central-prod` | 100.87.235.36 | hub + agent | Redis, fleet-control, cloudflared, gen2-central, worker-1/-2, registry :5000, Grafana, Loki |
| `seo-worker-box1` | 100.123.202.84 | agent | gen2-follower ×2. Tailscale-SSH **off** |
| `seo-worker-box2` | 100.104.18.124 | agent | gen2-follower ×2 |
| `blog-cache-vm` | 10.128.0.2 / 34.60.93.33 | agent | avada-blog-app **PROD**, e2-small, tag `blog-redis`, oslogin bật |
| `es-gateway` | 10.148.0.5 / 34.124.198.211 | agent | avada-seo-staging-2, e2-small, tag `es-node` |
| `instance-20260416-091517` | 10.148.0.3 / 34.87.163.45 | agent | avada-seo-staging-2, e2-highcpu-2, không tag không label |
| `instance-20260428-095447` | 10.148.0.4 / 34.143.142.118 | agent | avada-seo-staging-2, e2-small, đã có ops-agent policy |

7 agent, 1 hub.

## Quyết định đã chốt

1. Code ở `seo/packages/functions/fleet/` — cạnh `inventory.ini` và `deploy-*.yml`.
   Control node = **Mac**, inventory riêng `inventory.beszel.ini`. Không đụng `inventory.ini`.
2. Hub **Tailscale-only** :8090. Không Cloudflare Tunnel ở phase này.
3. 4 VM GCP join tailnet bằng **`tag:monitored`** + auth key ephemeral/preauthorized.
   ACL một chiều: `tag:monitored → central:8090`. Không mở SSH, không cho VM thấy phần
   còn lại của tailnet.
4. Token Beszel + Tailscale auth key: ansible-vault hoặc env file `0600` trên box.
   **Không bao giờ vào inventory, repo, hay command line.**

## Chặn / rủi ro đã biết

- **Hai tailnet, không phải một IP stale.** `100.113.50.9` = build box (Linux ở nhà,
  registry :5000, central Gen1). `100.87.235.36` = `seo-worker-central-prod` (box cloud,
  enroll 2026-08-07, redis :6380). `prod-worker-follower-compose-gen2.yml:10` ghi thẳng
  hai box ở tailnet khác nhau. `inventory.ini` **KHÔNG sai và không được sửa** — Beszel
  dùng `inventory.beszel.ini` riêng. Build box ngoài scope (không với tới từ tail71d230).
- **ufw trên central là bước nguy hiểm duy nhất.** Rule sai làm đứt `cloudflared`
  (mất `fleet.tuannv-dev.site`) hoặc `fleet-control` :3900. Rule phải additive,
  verify ngay sau khi apply, có đường lùi.
- Beszel không nằm trong job path. Agent ~0.1% CPU. Không có rủi ro dữ liệu.

## Ngoài scope — báo, không sửa

- `projects/Falcon/ssh.md` chứa mật khẩu SSH plaintext cho box1/box2 (user `avada`).
  Không bị commit (`.gitignore:21 /projects/*`), nhưng mật khẩu yếu trên box prod có SSH.
  Cần đổi + chuyển key-only + xoá file. Quyết định của Tony.
- `avada-seo-staging-2` chạy 3 VM liên tục, con `e2-highcpu-2` sống từ 2026-04-16.
  Đáng review chi phí riêng.
- Cả 4 VM GCP đều có external IP. Bề mặt tấn công, review riêng.
- **Ba box fleet dùng chung hostname OS `avada-System-Product-Name`.** Beszel đặt tên
  system theo hostname → task 4 phải set tên tường minh từng agent, nếu không dashboard đụng tên.
- **41 tham chiếu tới `100.113.50.9`** trong `seo` + `fleet-control` (default của
  `join-worker.sh`, `publish-worker.sh`, `provision-server.mjs`, `external-liveness.mjs`,
  `fleet-control/deploy/deploy.sh`, docs). Nếu build box đã retire thì đây là rác
  load-bearing — cần một đợt dọn riêng, KHÔNG nằm trong task Beszel.

---

## Progress

Started: 2026-08-22

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Tạo `inventory.beszel.ini` (3 fleet + 4 VM), không đụng inventory.ini | inline | ✅ | 0/5 | clean | 7 host, test pass |
| 2 | Tailscale ACL: luật ssh cho ansible | inline (API) | ✅ | 0/5 | clean | grants để nguyên, hẹp 1 login |
| 3 | beszel-hub: systemd unit + play cài trên central | general-purpose / sonnet | ✅ | 1/5 | clean | v0.18.8, HTTP 200, bind tailscale IP |
| 4 | beszel-agent play cho 3 box fleet (docker.sock, WS) | general-purpose / sonnet | ✅ | 5/5 | clean* | cả 3 box connected |
| 5 | ufw central | — | ⏹ descoped | — | — | hub đã bind IP tailscale |
| 6 | Join VM GCP vào tailnet (tag:monitored) | inline | ✅ 3/4 | — | clean | blog-cache-vm hoãn |
| 7 | beszel-agent lên VM GCP | inline | ✅ 3/4 | — | clean | 6 host đang báo cáo |
| 8 | Alert Beszel → Slack | — | ⬜ chờ Tony | 0/5 | — | cấu hình trong hub UI |
| 9 | Runbook + dòng trong fleet README | inline | ✅ | 0/5 | clean | 144 dòng |

### Acceptance toàn cục

```bash
systemctl is-active beszel-hub                          # active
curl -sf http://100.87.235.36:8090/api/health           # 200, từ trong tailnet
ss -tlnp | grep :8090                                   # bind 100.87.235.36 only, KHÔNG 0.0.0.0
sudo ufw status verbose | grep 8090                      # allow in on tailscale0
```
Dashboard: 7 system xanh (central-prod + box1 + box2 + 4 VM GCP). Container metric hiện `seo-worker-prod-gen2-{a,b}` trên box1/box2
và `functions-seo-worker-{1,2}` + `seo-redis` + `seo-grafana` trên central.
`systemctl is-active cloudflared seo-fleet-control` vẫn active sau task 5.

### Log

#### ✅ Task 1: inventory.beszel.ini
- Agent: inline (dữ liệu đã verify bằng `tailscale status --json` + curl, file tĩnh ~30 dòng)
- Status: ✅ completed
- Plan:
  - Goal: `inventory.beszel.ini` liệt kê 1 hub + 7 agent, `ansible-inventory --list` parse sạch, đúng 8 host
  - Files allowed: `seo/packages/functions/fleet/inventory.beszel.ini` (tạo mới). Không file nào khác
  - Approach: file riêng, group `[beszel_hub]` / `[beszel_agents_fleet]` / `[beszel_agents_gcp]`.
    Loại bỏ việc thêm group vào `inventory.ini` — file đó nằm trên đường deploy worker, đụng vào là rủi ro thừa
  - Test command: `ansible-inventory -i inventory.beszel.ini --list` → JSON hợp lệ, 7 host unique
    (`central-prod` ở cả beszel_hub lẫn beszel_agents_fleet — cùng máy, ansible merge var)
  - Risk: không. File mới, chưa playbook nào đọc
  - Rollback: `rm inventory.beszel.ini`
- Rounds used: 0/5 (pass vòng đầu)
- Test output: `ansible-inventory --list` → 6 group, 7 host unique, `beszel_hub_url` kế thừa đủ 7 host
- Security check: **clean**. `git status --porcelain` = đúng 1 file untracked
  (`packages/functions/fleet/inventory.beszel.ini`), 45 dòng, không file nào khác đổi.
  Không secret, không đụng `.env*`/lockfile/CI/`firebase.json`/rules, không thêm dependency repo.
  IP tailnet là CGNAT 100.64/10, vô dụng ngoài tailnet, và `inventory.ini` đã có tiền lệ commit IP.
  Ghi nhận: đã `brew install ansible` (14.3.1) trên Mac — tool local, không phải dep repo, không đụng lockfile.
- Started: 2026-08-22
- Completed: 2026-08-22

#### 🔄 Task 2: Tailscale ACL
- Agent: inline — Tony bấm trên console, tao không có quyền
- Status: 🔄 in-progress
- Plan:
  - Goal: (a) tồn tại `tag:monitored`, (b) `tag:monitored` → `tag:deploy:8090`,
    (c) `tag:worker-box` → `tag:deploy:8090`, (d) ansible từ Mac SSH được box1 **không cần browser check**
  - Files allowed: không có. ACL sống trên Tailscale console, không trong repo
  - Approach: sửa ACL trên console. Loại bỏ cách "chạy playbook từ central-prod để mượn
    rule tag:deploy→tag:worker-box có sẵn" vì Tony đã chốt control node = Mac
  - Test command: `ssh -o BatchMode=yes avada@100.123.202.84 hostname` → ra hostname,
    KHÔNG in URL login. Và `ansible -i inventory.beszel.ini beszel_agents_fleet -m ping`
  - Risk: rule quá rộng cho member ngoài Tony SSH vào worker box. Giữ src hẹp theo user
  - Rollback: revert ACL (Tailscale console giữ lịch sử phiên bản)
- Rounds used: 0/5
- Security check: -
- Started: 2026-08-22
- Completed: -

#### ✅ Task 3: beszel-hub trên central-prod
- Agent: general-purpose (sonnet)
- Status: 🔄 in-progress
- Plan:
  - Goal: `beszel-hub` chạy systemd trên central-prod, bind **đúng** `100.87.235.36:8090`,
    sống qua reboot, `curl http://100.87.235.36:8090/` từ Mac ra 200
  - Files allowed: `fleet/deploy-beszel-hub.yml`, `fleet/systemd/beszel-hub.service` (tạo mới).
    Không đụng `inventory.ini`, `deploy-workers.yml`, `deploy-followers.yml`, `deploy-central.yml`
  - Approach: binary + systemd, cài vào `/opt/beszel`, chạy dưới user hệ thống `beszel`,
    `serve --http "{{ tailscale_ip }}:8090"`. Loại bỏ Docker (thứ giám sát Docker không nên
    chết cùng Docker daemon) và loại bỏ bind `0.0.0.0` (bind IP tailscale khiến hub không bao
    giờ nằm trên interface public — ufw ở task 5 chỉ còn là lớp hai)
  - Test command: `ansible-playbook -i inventory.beszel.ini deploy-beszel-hub.yml` rồi
    `ssh avada@100.87.235.36 'systemctl is-active beszel-hub'` → `active`, và
    `curl -sS -o /dev/null -w '%{http_code}' http://100.87.235.36:8090/` → 200
  - Risk: central-prod chạy Redis prod + fleet-control + cloudflared. Play chỉ được thêm
    unit mới; **không** restart/đụng service nào đang có. Cổng 8090 phải chưa ai dùng
  - Rollback: `systemctl disable --now beszel-hub && rm -rf /opt/beszel /etc/systemd/system/beszel-hub.service`
- Rounds used: 1/5 — review vòng 1 fail, 6 sửa:
  1. `RestrictAddressFamilies` thiếu `AF_UNIX`. Target có `hosts: files mdns4_minimal … dns`
     + `avahi-daemon` chạy → entry nsswitch lạ đẩy Go về cgo/getaddrinfo → nss-mdns nối avahi
     qua unix socket. Thiếu AF_UNIX = chết DNS outbound, task 8 (Slack) sẽ hỏng.
  2. Handler chạy cuối play → trên đường update, `wait_for`+`uri` verify **binary cũ**.
     Thêm `meta: flush_handlers` trước bước verify.
  3. Unit chứa Jinja nhưng đặt tên `.service` → đổi thành `.service.j2`. Sibling
     (`seo-fleet-control.service`) là file tĩnh ship bằng `copy:`, không repo nào dùng `template`.
  4. `releases/latest` cứng → thêm var `beszel_version`, có thể pin tag.
  5. `beszel_hub_url` trong inventory và URL play tự dựng là 2 nguồn sự thật → thêm assert khớp.
  6. Không kiểm tra toàn vẹn binary. Upstream KHÔNG publish checksum (probe 2026-08-22:
     `checksums.txt`/`SHA256SUMS`/`beszel_checksums.txt` đều 404) → thêm `beszel_sha256`
     dạng TOFU: play in sha256 vừa cài, set var thì mọi lần sau bắt buộc khớp.
  Không phải bug (đã đo trên target): `ss -H -ltnp sport = :PORT` chạy đúng ở dạng argv rời.
- Test đã chạy: `--syntax-check` pass, `--list-tasks` 20 task đúng thứ tự, `flush_handlers`
  đứng trước verify. **Đã chạy thật** (Tony chạy với `-K`), và tao verify độc lập chứ không
  tin output dán lại:
  ```
  curl http://100.87.235.36:8090/     -> HTTP 200, 0.286s
  systemctl is-active beszel-hub      -> active
  systemctl is-enabled beszel-hub     -> enabled
  ss -H -ltnp sport = :8090           -> LISTEN 100.87.235.36:8090   (KHÔNG 0.0.0.0)
  ps -o user=,cmd= -C beszel          -> beszel /opt/beszel/beszel serve --http 100.87.235.36:8090
  systemctl is-active cloudflared docker seo-fleet-control -> active active active
  ls /opt/beszel/beszel (user avada)  -> Permission denied  (đúng: 0750 beszel:beszel)
  ```
  Hub version **0.18.8** — trên 0.12.0 nên dùng được universal token cho task 4.
- Security check: **clean**. `git status --porcelain` = đúng 3 file untracked của task này,
  không file nào khác. Không chuỗi hình dạng secret. Host outbound duy nhất mới:
  `https://github.com` (đã khai trong plan). Hub chạy user hệ thống `beszel`, không root;
  binary root-owned 0755 nên service user không tự ghi đè được binary của chính nó.
  Residual risk cần Tony quyết: lần cài đầu chỉ tin TLS vì upstream không có checksum.
- Started: 2026-08-22
- Completed: -

#### Phát hiện chặn task 6 — tailnet grants đang mở hết
`GET /api/v2/tailnet/-/acl` (read-only, 2026-08-22):
```json
tagOwners: {"tag:deploy": ["autogroup:admin"], "tag:worker-box": ["autogroup:admin"]}
grants:    [{"src": ["*"], "dst": ["*"], "ip": ["*"]}]
acls:      []            // tailnet dùng cú pháp grants mới, không phải acls
ssh:       check  member -> autogroup:self        users [nonroot root]
           accept tag:deploy -> tag:worker-box    users [avada root]
           check  member -> tag:worker-box        users [avada nonroot]   // box1 hỏi browser check
           accept member -> tag:deploy            users [avada nonroot]   // central-prod thông sẵn
```
Hệ quả:
1. Không có `tag:monitored`. Phải khai trước task 6.
2. Grant catch-all khiến 8090 thông sẵn — **không cần** sửa gì để Mac xem dashboard.
3. Nhưng join 4 VM GCP vào tailnet lúc này = cấp cho chúng toàn quyền tới mọi node mọi cổng,
   gồm `redis :6380` (bind 0.0.0.0) và `fleet-control :3900`. Ngược hẳn thiết kế một chiều.
   Tailscale grants không có deny → muốn hẹp phải bỏ catch-all và liệt kê tường minh.

#### ✅ Task 2: Tailscale ACL
- Agent: inline qua API (Tony duyệt: chỉ được ghi luật ssh)
- Plan → thực tế: `grants` hoá ra là một luật bắt hết `{"src":["*"],"dst":["*"],"ip":["*"]}`,
  nên cổng 8090 vốn đã thông — phần (b)/(c) của plan ban đầu thừa. Việc thật chỉ còn luật ssh.
- Đã làm: chèn đúng 1 luật vào mảng `ssh`, **trước** luật `check member → tag:worker-box`
  (SSH rule khớp theo thứ tự, first match wins — nối vào cuối thì luật check ăn trước và
  accept không bao giờ áp dụng):
  `{"action":"accept","src":["tn221805@gmail.com"],"dst":["tag:worker-box"],"users":["avada"]}`
- Cách làm: GET raw **HuJSON** (không phải JSON) để giữ nguyên comment của Tony, sửa dạng text,
  `POST /acl/validate` → `{}`, rồi `POST /acl` kèm `If-Match` ETag. PUT trả 405 — endpoint là POST.
  API token đọc từ file trong tiến trình Python, không bao giờ lên argv.
- Test: `ansible -i inventory.beszel.ini beszel_agents_fleet -m ping` → central-prod/box1/box2
  đều SUCCESS, không con nào in URL browser-check.
- Security check: **clean** với một blast radius phải nói rõ: `tn221805@gmail.com` giờ SSH vào
  `tag:worker-box` **không qua browser check** — bước check trước đây đóng vai trò yếu tố thứ hai.
  Đổi lại phạm vi hẹp đúng một login, không phải `autogroup:member`. `grants` và `tagOwners`
  không đụng; xác nhận sau khi ghi: 5 luật ssh (trước 4), catch-all còn nguyên, comment còn nguyên.
- Rounds: 0/5. Completed 2026-08-22.

#### 🔄 Task 4: beszel-agent trên 3 box fleet
- Agent: general-purpose (sonnet). File đã viết + review.
- Rounds: 1/5 — review thêm bước in journal mỗi lần chạy, vì assert chỉ chặn `fatal`
  nên KEY/TOKEN bị từ chối vẫn có thể hiện ra là unit "active".
- **CHẶN**: `.env` dòng 7 hỏng — `BESZEL_ADMIN_KEY=BESZEL_ADMIN_TOKEN=<uuid>`, tức không có
  giá trị KEY nào. Docs xác nhận WS mode vẫn cần `KEY`. `/api/beszel/getkey` trả 401 nên
  không lấy tự động được. Cần Tony copy public key từ Add System trong hub UI.
- Ghi nhận: `/api/beszel/first-run` → `{"firstRun":false}` (admin đã tạo).
  Universal token dạng UUID → 3 agent tự đăng ký rồi đổi tên trong UI, không đổi hostname box.

##### Task 4 — nhật ký vòng lặp
- **Round 1** (review): assert chỉ chặn `fatal` → KEY/TOKEN bị từ chối vẫn hiện ra "active".
  Thêm bước in 15 dòng journal cuối ở **mọi** lần chạy. Chính bước này bắt được lỗi round 3.
- **Round 2** (box2, crash-loop): `Failed to load public keys ... illegal base64 data at input
  byte 68`. Nguyên nhân: `regex_search` của Ansible **có capture group thì trả về list**;
  playbook dùng như scalar nên file env ghi `KEY=['ssh-ed25519 AAAA...']`. Base64 ed25519 dài
  đúng 68 ký tự nên `']` rơi vào byte 68. Đo trên máy: `KEY len=84, TOKEN len=40` (thừa 4 ký tự
  `['` + `']`). Sửa bằng `| first | trim`; siết assert sang kiểm tra **hình dạng**
  (`^ssh-(ed25519|rsa) <base64>$` và UUID) chứ không chỉ kiểm tra khác rỗng.
- **Round 3** (box2, 401): play pass, unit ổn định, nhưng
  `WARN WebSocket connection failed err="unexpected status code: 401"`.
  401 chứng minh đường mạng thông (box2 → hub qua tailnet, hub có trả lời) — chỉ auth hỏng.
  Nguyên nhân là lỗi đã biết của upstream: **universal token tạo bằng tài khoản superuser
  không dùng được** (henrygd/beszel#1277). Hub này mới chỉ có superuser từ first-run.
  Không phải lỗi playbook → cần tạo user thường, lấy universal token bằng user đó.
  `/api/beszel/universal-token` đòi JWT phiên đăng nhập nên không tra được từ ngoài.

Trạng thái box2 sau round 3 (mọi thứ trừ auth đều đúng):
```
beszel-agent 0.18.8, unit active, hết crash-loop
INFO Starting SSH server addr=/run/beszel-agent/beszel-agent.sock network=unix   <- unix socket, 0 cổng TCP
INFO Detected disk nvme0n1p2 mount=/ root=true ; interfaces enp1s0 + tailscale0
/etc/beszel-agent.env  KEY len=80 (ssh-ed25519...), TOKEN len=36 (uuid)  root:beszel-agent 0640
```
central-prod và box1 **chưa cài** — chờ token đúng. box2 có NOPASSWD sudo; central và box1 đòi
password và theo `ssh.md` thì password hai máy khác nhau, nên phải chạy `-K` riêng từng con.
- **Round 4** (token mới): token do superuser tạo được thay bằng token của user thường →
  `INFO WebSocket connected host=100.87.235.36:8090`. Auth xong. Nhưng play vẫn fail ở
  assert socket.
- **Round 5** (sửa chính khâu verify): socket biến mất là ĐÚNG, không phải lỗi — đo được trên
  box2: agent chỉ mở `LISTEN` khi WebSocket **không** lên. Nối được hub thì nó không phục vụ gì
  cục bộ, nên `/run/beszel-agent/` rỗng = **không mở listener nào cả**, kết quả tốt nhất.
  Assert cũ hiểu ngược. Thay bằng:
  * bỏ assert "socket phải tồn tại"; giữ `stat` nhưng đảo nghĩa — socket CÓ mặt nghĩa là đã fallback;
  * assert mới, cứng: journal phải chứa `WebSocket connected`. "Unit active" không chứng minh gì
    — token bị từ chối vẫn để unit active và retry, đúng cách mà lỗi 401 ở round 3 núp sau
    một play màu xanh;
  * fail_msg chỉ thẳng nguyên nhân superuser-token (#1277) cho lần sau.
  Kết quả box2: `ok=22 changed=0 failed=0`.

##### Task 4 — security check (box2)
**clean**, kèm một residual cần Tony chấp nhận rõ ràng.
```
git status --porcelain        -> đúng 5 file untracked của việc này, không file nào khác
grep secret trên 2 file mới   -> chỉ có chuỗi mẫu "KEY=ssh-ed25519 AAAA..." trong fail_msg
no_log: true                  -> phủ cả 4 task chạm credential (lookup, parse, assert, copy)
/etc/beszel-agent.env         -> root:beszel-agent 640
/opt/beszel-agent/beszel-agent-> root:root 755  (service user không tự ghi đè binary của nó)
tiến trình agent Groups       -> 998 999 ; docker:x:999 ; /var/run/docker.sock srw-rw---- root:docker
```
Host outbound mới: `github.com` (đã khai trong plan) + hub trên tailnet. Không đụng
`.env*`/lockfile/CI/`firebase.json`/rules. Không container, docker.service, cloudflared,
redis hay fleet-control nào bị restart.

**Residual — CHƯA được accept:** tiến trình `beszel-agent` mang group `docker`, tương đương
root trên host đó. Là cái giá cố ý để lấy metric per-container, đã ghi rõ trong unit. Cần
Tony nói rõ chấp nhận thì mới đánh dấu accepted.

**Cảnh báo trần vòng lặp:** task 4 đã dùng 5/5. Nếu central-prod hoặc box1 fail khi chạy,
theo quy tắc là dừng cả workflow và bàn giao, không sửa tiếp.

##### Task 4 — verify cuối, cả 3 box (2026-08-22)
```
                central-prod        box1              box2
unit            active/enabled      active/enabled    active/enabled
WebSocket conn  yes                 yes               yes (dòng cuối journal)
401 hiện tại    0                   0                 0  (45 dòng cũ trước khi đổi token)
listener sock   none                none              none      <- nối được hub thì không mở
tcp :45876      không               không             không
group docker    997,999 (gid 999)   983,984 (gid 984) 998,999 (gid 999)
```
central-prod sau khi cài agent: `beszel-hub beszel-agent cloudflared docker seo-fleet-control`
đều active, 6 container nguyên, hub HTTP 200. Không service nào bị restart ngoài beszel-agent.

##### Task 5 — DESCOPED (không phải bỏ qua)
Rủi ro ban đầu của task này sinh từ giả định hub bind `0.0.0.0`. Hub thật bind
`100.87.235.36:8090` nên chưa từng nằm trên interface public, và ufw chỉ còn là lớp hai cho
một cổng vốn đã không phơi ra. Thứ thực sự phơi trên central là `redis :6380` và
`fleet-control :3900` (đều bind 0.0.0.0) — có từ trước, không thuộc phạm vi Beszel.
Siết ufw ở đó đáng làm nhưng là change window riêng: rule sai làm đứt `cloudflared`
(mất `fleet.tuannv-dev.site`). Không đánh đổi trong task này.

##### Task 9 — runbook
`docs/runbooks/beszel.md` (144 dòng) + 3 dòng bảng và 1 link trong `fleet/README.md`.
Nội dung: đối chiếu với fleet-control/Loki/ops-agent, sơ đồ, bảng host, bảng file, cách xử lý
credential, lệnh chạy, cách verify, 4 chế độ hỏng đã gặp thật (401 superuser-token, KEY sai dạng,
unit flapping, trùng hostname), rollback, đánh đổi docker-group, và phần chưa làm.
Security check: **clean** — không secret, README diff `6 insertions, 0 deletions` (thuần thêm),
link tương đối resolve đúng tới `docs/runbooks/beszel.md`.

---

## Verification cuối (2026-08-22)

```
ansible-playbook --syntax-check  deploy-beszel-hub.yml    -> OK
ansible-playbook --syntax-check  deploy-beszel-agent.yml  -> OK
ansible-inventory --list                                  -> 7 host
ansible beszel_agents_fleet -m shell 'systemctl is-active beszel-agent; grep -c "WebSocket connected"'
   box2         -> active, 3
   box1         -> active, 2
   central-prod -> active, 2
curl http://100.87.235.36:8090/                           -> 200
central-prod: beszel-hub beszel-agent cloudflared docker seo-fleet-control -> tất cả active, 6 container nguyên
```

Security check trên **toàn bộ** diff: **clean**. Không secret ở bất kỳ file nào được thêm/sửa.
Host outbound duy nhất: `https://github.com` (đã khai trong plan) và hub trên tailnet.
Không đụng `.env*`, lockfile, `.gitlab-ci.yml`, `firebase.json`, `.firebaserc`, hay rules.

**Residual chưa được accept:** tiến trình agent mang group `docker` (≈ root trên host) để đổi
lấy metric per-container. Chờ Tony xác nhận rõ ràng.

## Trạng thái: 5/9 xong, 1 descoped, 3 còn lại

| # | Task | Kết quả |
|---|---|---|
| 1 | inventory riêng | ✅ |
| 2 | Tailscale ACL (luật ssh) | ✅ |
| 3 | Hub v0.18.8 | ✅ |
| 4 | Agent 3 box | ✅ |
| 5 | ufw central | ⏹ descoped, có lý do |
| 9 | Runbook | ✅ |
| 8 | Alert Slack | ⬜ cần hub UI + webhook |
| 6 | Join 4 VM GCP | ⬜ chặn bởi grants catch-all |
| 7 | Agent trên 4 VM | ⬜ chặn bởi task 6 |

---

## Phát hiện phụ (Beszel chưa bật alert đã lòi ra)

### 1. `deploy-followers.yml` rò rỉ đĩa mỗi lần deploy — box1 sắp đầy
`/tmp/seo-worker-<sha>.tar.gz`, ~1.13GB/file, không bên nào dọn:
```
deploy-followers.yml:29  tarball: "/tmp/seo-worker-{{ image_tag }}.tar.gz"
deploy-followers.yml:53  docker save {{ image }} | gzip -1 > {{ tarball }}     # trên central
deploy-followers.yml:75  scp {{ tarball }} -> box:/tmp/
deploy-followers.yml:78  gunzip -c /tmp/seo-worker-<sha>.tar.gz | docker load  # trên box
```
Không có `state: absent` ở đâu cả.

| Box | Tarball | Size | Disk trước dọn |
|---|---|---|---|
| box1 | 18 | 19G | **94%, còn 6.6G** |
| box2 | 18 | 19G | 37% |
| central-prod | 20 | 22G | 61% |

Tổng 60GB. Đây là nguyên nhân thật của box1 94% — **không phải** do image docker chồng chất:
xoá 16 tag `seo-worker` chỉ thu về ~1GB vì các image dùng chung gần hết layer. Cột
`RECLAIMABLE` của `docker system df` đếm image không gắn container đang chạy, không phải
dung lượng sẽ thu về thật — sau khi xoá nó còn tăng từ 15.03GB lên 18.55GB.

Việc gốc cần làm (ngoài scope brief này): thêm bước xoá tarball sau `docker load`, cả hai phía.

### 2. `seo-worker-staging-seo-worker-1` trên box1 `unhealthy` suốt 8 ngày
Up 8 days (unhealthy). Không ai biết. Đúng loại việc Beszel sinh ra để bắt.

### 3. 4 container trên box1 vẫn trỏ registry đã chết
`seo-worker-staging4-*` → `100.113.50.9:5000/seo-worker:v15`,
`seo-worker-staging-*` → `:v13-j1`, `functions-seo-worker-1/2` → `:v13`.
Chạy được vì image nằm cache cục bộ, nhưng **không thể pull lại**. Một lần
`--force-recreate` hoặc reboot cần pull là chúng chết và không dựng lại được.
Đây là hệ quả cụ thể của 41 tham chiếu `100.113.50.9`, không còn là chuyện tài liệu cũ.

---

## Đã xử lý 3 phát hiện phụ (2026-08-22, Tony duyệt)

### 1. Vá rò rỉ tarball — `deploy-followers.yml` +24 dòng, 0 xoá
- Thêm task xoá `/tmp/seo-worker-<tag>.tar.gz` trên box **ngay sau** `docker load`.
- Thêm play cuối `hosts: localhost` xoá bản trên control node. Đặt **cuối cùng** vì followers
  roll `serial:1` và mọi box đều rsync đúng file đó — xoá sớm là gãy bước ship của box còn xếp hàng.
- `-e keep_tarball=true` để giữ lại khi chạy nhiều lượt `--limit`.
- `--syntax-check` pass. Backup bản gốc ở scratchpad.

Dọn tồn đọng (Tony chạy): box1 **94% → 77%** (25G free), box2 37% → 29%, central 61% → 52%.

### 2 + 3. Dừng container chết / không dùng trên box1
Đo trước khi đụng, vì tên gọi không phản ánh thực tế:

| Container | Redis đích | Thực trạng | Hành động |
|---|---|---|---|
| `prod-gen2-box1-a/-b` | 100.87.235.36:6380 db0, production | healthy | **không đụng** |
| `staging-seo-worker-1` | 100.113.50.9:6379 — **unreachable** | `load-redis connect ETIMEDOUT` 8 ngày | stopped |
| `functions-seo-worker-1/-2` | 172.18.0.1:6379 (redis cục bộ, sống) | log cuối 14/08, idle 8 ngày | stopped |
| `staging4-seo-worker-1/-2` | seoworker.minhdevtree.tech:6380 db4 | **chạy job thật 21/08** | **GIỮ — chờ Tony** |

Dùng `docker stop`, không `rm` → lùi lại bằng `docker start`. Sau khi dừng: prod gen2 vẫn
`Up (healthy)` trên `seo-worker:c4312849`.

`staging-seo-worker-1` unhealthy 8 ngày là vì redis của nó là build box đã chết — cùng một
gốc với phát hiện #3, không phải hai việc riêng.

### Còn tồn, chưa làm
- **`staging4` ×2**: Tony bảo "test xong" nhưng nó xử lý job lúc 2026-08-21. Chờ xác nhận.
- **11 tag image `100.113.50.9:5000/seo-worker:{test,v2,v3,v8,v9,v10,v11,v12,v14,v16,v17}`**
  không container nào dùng. Mức thu hồi thật KHÔNG dự đoán được — bài học từ lần xoá 16 tag
  `seo-worker` chỉ được ~1GB do chia sẻ layer. Đo sau khi xoá, đừng hứa trước.
- **`local-registry` publish `0.0.0.0:5000`**, registry Docker không xác thực, phơi mọi
  interface. Catalog: `{"repositories":["seo-worker"]}`. Không container nào trên box1 pull từ
  nó (tất cả trỏ `100.113.50.9:5000`). Ghi nhận, chưa đụng.

---

## Chuyển repo + commit (2026-08-22)

Tony hỏi lại "để beszel vào repo SEO làm gì?" → đảo khuyến nghị ban đầu và chuyển sang
`fleet-control`. Lý do quyết định số 1 trong brief này (đặt cạnh `inventory.ini`) không đứng
vững: `inventory.beszel.ini` vốn được viết độc lập hoàn toàn, phạm vi giám sát gồm cả VM GCP
của `avada-blog-app` + `avada-seo-staging-2`, và CI theo tag của `seo` không bao giờ chạm tới
mấy playbook chạy tay này.

**Cảnh báo đã xảy ra thật:** giữa phiên, cây làm việc `seo` đổi từ `master` sang
`perf/lazy-heavy-sdk-imports`. Đo lại trước khi commit mới phát hiện. Không commit lên nhánh đó.

| Repo | Nhánh | Commit | Nội dung |
|---|---|---|---|
| `fleet-control` | `feat/beszel-monitoring` | `7122e18` | 8 file, +798. `monitoring/` + README + CLAUDE.md |
| `seo` | `fix/fleet-tarball-cleanup` | `862fcdd310` | 1 file, +24. Vá rò rỉ tarball |

`seo` commit làm trong worktree mới `seo-wt-tarball` tách từ **master**, để checkout
`perf/lazy-heavy-sdk-imports` của Tony không bị kéo đi đâu — cây đó đã trả về sạch hoàn toàn.

Verify sau khi chuyển: syntax-check cả 2 playbook OK từ vị trí mới, inventory 7 host, và
chạy thật `deploy-beszel-agent.yml --limit box2` từ `fleet-control/monitoring/` →
`ok=22 changed=0 failed=0` (idempotent, không gãy vì đổi chỗ).

Security check trên cả 2 diff staged: **clean**. Không secret, không đụng file cấm,
host outbound chỉ `github.com` + hub trên tailnet.

**Chưa push cả hai.** `fleet-control` origin là `gitlab.com/tn22180/falcon-tech-lead-manager`
(remote cá nhân, đúng theo CLAUDE.md của repo đó — không phải mirror chết như seo/AEO/APC).
`seo` origin là `git.avada.net`.

### Dọn đĩa box1, kết quả cuối
`94% → 77%` (xoá tarball tồn đọng) `→ 66%` (xoá 11 tag `100.113.50.9:5000/seo-worker:v*`
không ai dùng, thu **11GB** thật). Lần này chia sẻ layer ít vì đó là dòng build cũ khác hẳn
bộ `seo-worker:<sha>` hiện tại — ngược với lần xoá 16 tag chỉ được ~1GB.
box2 29%, central 52%: mỗi con còn ~19 tag `seo-worker:<sha>` không dùng nhưng cùng loại
chia sẻ layer nặng, không đáng động.

---

# PLAN: đưa 4 VM GCP vào Beszel

Lập 2026-08-22. Thay thế task 6/7 trong bảng Progress.

## Điều kiện thực tế đã đo

| VM | Project | Zone | OS | Máy | OS Login |
|---|---|---|---|---|---|
| `blog-cache-vm` | avada-blog-app **PROD** | us-central1-a | debian-12-bookworm | e2-small | **FALSE** |
| `es-gateway` | avada-seo-staging-2 | asia-southeast1-a | ubuntu-2404-lts | e2-small | – |
| `instance-20260416-091517` | avada-seo-staging-2 | asia-southeast1-a | **ubuntu-minimal-pro-2204** | e2-highcpu-2 | – |
| `instance-20260428-095447` | avada-seo-staging-2 | asia-southeast1-c | debian-12-bookworm | e2-small | – |

Sửa nhận định cũ trong brief: `blog-cache-vm` **không** bật OS Login (metadata có key nhưng
value=FALSE) → SSH bằng metadata key, `gcloud compute ssh` chạy thẳng. Dễ hơn dự tính.

**Không có auth key dùng được.** Tailscale API chỉ liệt kê `kWwEAY4Ujt11CNTRL`
(`worker_access_token`), không có khối `capabilities.devices.create` → đó là API key.
`tskey-auth-…` trong `.env` không nằm trong danh sách ⇒ đã hết hạn hoặc bị thu hồi.

## Phase 0 — ✅ XONG 2026-08-22 (Tony duyệt cho ghi qua API)

1. `tagOwners` += `"tag:monitored": ["autogroup:admin"]`. HuJSON sửa dạng text để giữ comment,
   `POST /acl/validate` → `{}`, `POST /acl` kèm If-Match. Verify sau khi ghi: `grants` còn
   nguyên catch-all, vẫn đúng 5 luật ssh.
2. Auth key `kKBp2q1yg211CNTRL` desc `beszel-monitored`, tags `['tag:monitored']`,
   reusable, **ephemeral=false**, hạn 2026-08-29. Giá trị ghi thẳng từ response ra
   `~/.beszel/ts-authkey` (0600) — không qua clipboard, không qua transcript.

Ephemeral=false vì ephemeral node bị xoá khỏi tailnet khi offline — VM reboot là mất đăng ký.

**Đo được trong lúc làm, đổi Phase 2:**
- `devicesApprovalOn: False` → ô "pre-approved" vô nghĩa trên tailnet này. Bỏ khỏi plan.
- `devicesKeyDurationDays: 180` → **key thiết bị hết hạn sau 180 ngày**. Ba box fleet đều đã
  `keyExpiry=disabled`; VM mới join thì không. Không tắt expiry thì sau 6 tháng chúng lặng lẽ
  rơi khỏi tailnet và giám sát chết không ai hay. → Phase 2 phải tắt key expiry từng VM.
- `TAIL_SCALE_AUTH_KEY` trong `.env` là key chết, API không liệt kê. Nên xoá dòng đó.

## Phase 1 — thu hẹp `grants` (phần rủi ro nhất, change window riêng)

Hiện tại `grants` là một luật bắt hết `{"src":["*"],"dst":["*"],"ip":["*"]}`. Join VM dưới luật
đó là cấp cho chúng đường tới **mọi node, mọi cổng**, gồm `redis :6380` trên central
(đang bind 0.0.0.0) và `local-registry :5000` trên box1 (không xác thực).

**Cảnh báo phương pháp:** không được suy ra danh sách luồng từ `ss` trên host. Đo ngày
2026-08-22 cho thấy central **không có** kết nối nào tới `:6380`, trong khi gen2 worker ở
box1/box2 chắc chắn nối tới đó — socket của chúng nằm trong netns của container, host không
thấy. Suy từ **cấu hình**, rồi xác minh bằng hành vi, không bằng mẫu socket.

Luồng cần giữ (suy từ cấu hình đã đọc):

| Từ | Tới | Cổng | Bằng chứng |
|---|---|---|---|
| `tag:worker-box` (container) | `tag:deploy` | 6380 | `REDIS_HOST=100.87.235.36 REDIS_PORT=6380` trong env gen2 |
| `tag:worker-box` | `tag:deploy` | 8090 | agent Beszel, đã đo established |
| `tag:deploy` | `tag:worker-box` | 22 | luật ssh accept sẵn có, ansible từ central |
| `tn221805@gmail.com` | `tag:deploy` | 22, 3900, 8090 | Mac: ssh, fleet-control, dashboard |
| `tn221805@gmail.com` | `tag:worker-box` | 22 | ansible từ Mac |
| **`tag:monitored`** | `tag:deploy` | **8090 duy nhất** | mục đích của cả việc này |

Cách triển khai an toàn — **thêm trước, bỏ sau**, không sửa một phát:
1. Thêm các luật tường minh ở trên **bên cạnh** catch-all. Không đổi hành vi gì cả (catch-all
   vẫn cho tất) → bước này zero-risk, chỉ để xác nhận cú pháp qua `POST /acl/validate`.
2. Dùng khối `tests` của Tailscale ACL để khẳng định các luồng trên được accept.
3. **Bỏ catch-all.** Ngay sau đó verify: gen2 worker còn nhận job (fleet-control :3900),
   `ansible beszel_agents_fleet -m ping` còn chạy, 3 agent còn `WebSocket connected`.
4. Sai thì revert — Tailscale console giữ lịch sử phiên bản ACL.

Bước 3 là bước duy nhất có thể gây sự cố. Làm lúc rảnh, không làm cuối ngày.

## Phase 2 — join 4 VM vào tailnet

Thứ tự: **3 VM staging trước, `blog-cache-vm` (prod) sau cùng.**

Mỗi VM:
```bash
gcloud compute ssh <vm> --project=<p> --zone=<z> --command '
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up --authkey=file:/path/key --advertise-tags=tag:monitored --ssh=false
  tailscale ip -4'
```
- `--ssh=false`: các VM này không cần Tailscale SSH; bật lên là mở thêm bề mặt vô ích.
- `ubuntu-minimal-pro-2204` thiếu nhiều gói — kiểm tra `curl` và `iproute2` (`ss`) có sẵn
  không **trước**, playbook agent dùng `ss` ở bước kiểm cổng.
- Lấy IP 100.x thật của từng VM, cập nhật `ansible_host` trong `inventory.beszel.ini`
  (hiện đang là tên MagicDNS phỏng đoán, chưa xác minh).

## Phase 3 — cài agent

- Xác định từng VM có Docker không → set `docker_metrics` cho đúng. `blog-cache-vm` gắn tag
  `blog-redis`; nếu redis chạy bare thì `docker_metrics=false` và agent không cần group docker
  → **không phải trả cái giá root-equivalent trên VM prod**.
- `ansible-playbook -i inventory.beszel.ini deploy-beszel-agent.yml --limit beszel_agents_gcp -K`
- Verify: assert `WebSocket connected` đã có sẵn trong playbook.

## Rủi ro

- **`blog-cache-vm` là prod của Blog app.** Cài tailscale thêm một tunnel WireGuard outbound
  trên VM prod. Làm sau cùng, sau khi 3 VM staging đã chứng minh quy trình.
- Cả 4 VM đều có external IP. Tailscale không đụng gì tới điều đó — đây vẫn là việc riêng.
- 4 distro khác nhau; `ubuntu-minimal` là con dễ vấp nhất.
- Nếu org có policy chặn cài phần mềm mạng trên VM, phase 2 gãy — kiểm tra trước với
  1 VM staging.

---

## Phase 2 + 3 — XONG cho 3 VM staging (2026-08-22)

| VM | Tailscale IP | OS | Docker | Agent |
|---|---|---|---|---|
| `es-gateway` | 100.118.60.13 | Ubuntu 24.04 | không | 0.18.8, connected |
| `seo-stg-hicpu` | 100.118.66.25 | Ubuntu 22.04 | không | 0.18.8, connected |
| `seo-stg-ops` | 100.68.62.98 | Debian 12 | không | 0.18.8, connected |

Không con nào có Docker → `docker_metrics=false` → **agent không phải mang group `docker`**
trên mấy VM này, tức không trả cái giá root-equivalent. Auth key đi qua file rồi `shred`.
Node có tag được Tailscale tự tắt key expiry, nên lo ngại "180 ngày rơi khỏi tailnet" trong
plan là thừa — chỉ đúng với node không tag.

`blog-cache-vm` **chưa đụng**: prod của Blog app, và `grants` catch-all vẫn còn.

### Ba lần sửa khâu verify — đây là phần đáng ghi nhất

Assert kết nối sai **ba lần liên tiếp**, mỗi lần sai một kiểu khác:

1. **Chỉ tìm chuỗi `WebSocket connected` trong 50 dòng cuối.** Agent bị hub từ chối in đúng dòng
   đó ở *mỗi* lần retry → cả 3 VM pass xanh trong khi đang vòng lặp và không báo cáo gì.
2. **Sửa thành "cấm mọi `fingerprint mismatch` trong 50 dòng cuối".** Cửa sổ cố định vẫn chứa
   lịch sử *trước* khi thay token → agent đã lành lại bị báo hỏng.
3. **Sửa thành "đọc từ lúc unit khởi động, disconnect ≤ 1".** Bắt được box2 với `conn=18 disc=17`
   — nhưng đọc kỹ thì `reason=` **rỗng**, khoảng cách ~15–20 phút, unit chạy 4h20. Đó là
   reconnect định kỳ bình thường, không phải vòng lặp. Assert đang gộp nhầm churn tích luỹ
   theo giờ với vòng lặp quay theo `RestartSec`.

**Bản cuối:** bằng chứng "đã từng nối" đọc từ lúc unit khởi động; tính vòng lặp đánh giá theo
**tốc độ trong cửa sổ 2 phút** (`disconnect ≤ 1`), cộng điều kiện sự kiện cuối cùng phải là
connect. Kiểm chứng: box2 (churn bình thường) pass, 3 VM pass, tất cả `changed=0`.
Chiều fail **suy luận chứ chưa dựng lại**: vòng lặp quay mỗi ~5s theo `RestartSec` → ~24
disconnect trong 2 phút, vượt ngưỡng.

Bài học: "unit active" và "có dòng connected" đều **không** phải bằng chứng agent đang báo cáo.

### Token: một token một system
Beszel gắn một token với một system record và khoá record đó vào fingerprint máy đầu tiên.
Universal token dùng lại cho máy thứ hai → `fingerprint mismatch`, agent reconnect vô hạn.
Mỗi VM phải Add System riêng trong UI (refresh giữa mỗi lần — henrygd/beszel#1141) để có
token riêng. Token per-system là slug ~30 ký tự, **không** phải UUID như universal token —
regex kiểm tra trong playbook đã nới cho khớp cả hai.

Creds: `~/.beszel/<host>.env` (0600) cho VM, `~/.beszel/agent.env` cho fleet.

### Commit
`fleet-control` `feat/beszel-monitoring` → `78a336b` (2 file, +66/-15).
Trước đó `7122e18` (8 file, +798). Chưa push.