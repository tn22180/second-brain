---
name: seo-worker-box-credential-surface
description: 3 worker box giữ key admin prod avada-seo; avada ∈ docker nên avada ≡ root; đếm đủ 2026-09-10 là 8 file SA, key prod e2049477 nằm 0644 trên box2 → coi như đã lộ.
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-10T00:00:00.000Z
  originSessionId: d30877df-36aa-441d-a8dc-e686dfc6580b
---

File `firebase.json` mount vào worker là **`firebase-adminsdk-bplmq@avada-seo`**, key id `e2049477`
(USER_MANAGED, cấp 2026-08-25 — là key user-managed *duy nhất* của SA này). Nó giữ 11 role trên prod:
`storage.admin`, `bigquery.admin`, `pubsub.admin`, `run.admin`, `cloudfunctions.admin`,
`artifactregistry.repoAdmin`, `cloudbuild.builds.editor`, `datastore.importExportAdmin`,
`firebase.sdkAdminServiceAgent`, `iam.serviceAccountTokenCreator`, `pubsub.publisher`.

`datastore.importExportAdmin` + `storage.admin` = export sạch Firestore prod và asset merchant.
`cloudfunctions.admin` + `run.admin` + `cloudbuild.builds.editor` = deploy code tuỳ ý vào prod.
`iam.serviceAccountTokenCreator` = mạo danh SA khác, leo ra ngoài 11 role. **Đọc được file đó = chiếm
`avada-seo`.** Đây là lý do 3 cái desktop văn phòng này là tài sản prod, không phải máy phụ.

**`avada` nằm trong group `docker` trên cả 3 box → `avada` ≡ root.** Docker socket cho mount `/`
bất kỳ, nên perm `600 avada:avada` trên file SA và password sudu mạnh đều không chắn được đường này.
Bỏ `avada` khỏi group docker sẽ gãy deploy, nên thực tế phải coi mọi thứ bảo vệ tài khoản `avada`
(key SSH, Tailscale ACL, password console) là lớp bảo vệ *duy nhất* của key prod.

**Đếm đủ 2026-09-10 (SSH cả 3 box, không truncate): 8 file SA thật, không phải 4.** Hai lần đếm
trước sai vì `grep -rl` bị `head` cắt, `-maxdepth 5`, và chỉ khớp `*.json` nên trượt hết `.env*` và
`.bak` không đuôi json.

| box | file | SA · key id | mode |
|---|---|---|---|
| central | `Projects/seo-worker/credentials/firebase.json` | bplmq · avada-seo · e2049477 | 600 MOUNT |
| central | `…/credentials/firebase.json.bak-20260522-090818` | 23wcr · staging-4 · f919cfea | 600 |
| box1 | `seo-worker-prod/credentials/firebase.json` | bplmq · avada-seo · e2049477 | 600 MOUNT |
| box1 | `seo-worker-staging4/firebase.json` | 23wcr · staging-4 · afbb6b82 | 600 MOUNT |
| box2 | `seo-worker-prod/credentials/firebase.json` | bplmq · avada-seo · e2049477 | 600 MOUNT |
| box2 | `Projects/seo/packages/functions/serviceAccount.prod.json` | bplmq · avada-seo · e2049477 | **0644** |
| box2 | `…/serviceAccount.prod.json.bak-20260825` | bplmq · avada-seo · **698452db** | **0644** |
| box2 | `…/serviceAccount.development.json` | jk3ri · avad-seo-staging · 3529e1b4 | **0644** |

**`e2049477` phải coi như đã lộ** — nằm 0644 trên box2 trong cây `Projects/seo` mà mọi user local
đọc được. Rotate, đừng chỉ chmod.

**`e2049477` KHÔNG phải key user-managed duy nhất của SA prod** (ghi trước đó sai): file
`.bak-20260825` giữ `698452db`, key prod cấp trước lần rotate 25/8, trạng thái trên GCP chưa xác
minh (gcloud hết token lúc đo).

Perm world-writable rất lệch giữa các box — box1 sạch, hai box kia không:

| box | thư mục o+w | file o+w | cây dính |
|---|---|---|---|
| central | 200 | 1372 | `Projects/seo-worker/functions` 0777 |
| box1 | **0** | 1 | — |
| box2 | **3061** | 0 | cả cây `Projects/seo`, gồm `.git/hooks` |

`.git/hooks` 0777 + `avada ∈ docker` = ghi hook → code chạy quyền avada ≡ root trên box đang mount
key prod. Đây là đường vào rẻ hơn cả đọc file SA.

`.env` 0644: box1 ~40 file trong 5 thư mục build (`seo-build-j1`, `seo-worker-build`,
`staging4-v14-build`, `staging4-v15-build`, `seo-worker/functions`), mỗi file 39–50 dòng giá trị
thật — box1 có `tunglv` uid 1001 nên 644 ở đây là đọc được thật. File đang mount
(`seo-worker-prod/prod.env`) thì 600. box2 ngược lại: `prod.env` và `prod.env.prerotate-20260826`
đều **0644**.

**`~/.bash_history` là bề mặt thứ ba, không chmod được đường nào** — central 17 dòng, box1 19,
box2 2 dòng khớp `password|secret|token|api_key`. Mode 600 nhưng `avada ≡ root`. Chỉ xoá được.

Quét lại bằng `scratchpad/cred2.sh`: khớp `"private_key":` / `-----BEGIN … PRIVATE KEY`, cộng
`.env*` có ≥16 ký tự giá trị, cộng `find -perm -o+w`. Bỏ qua false positive `.yarn/berry/cache/*.zip`
và `nvim-lint/spec/trivy_secret_spec.lua` (fixture của package).

**Từ Mac không SSH thẳng vào box1/box2 được** — Tailscale SSH đòi browser check
(`failed to fetch next SSH action`). Đường vòng chạy được, không cần re-auth:
`ssh avada@100.87.235.36 'ssh avada@100.123.202.84 "..."'` — ACL central(tag:deploy)→box(tag:worker-box)
vẫn mở sau lần siết 9/9.

File `firebase.json.bak-$(date +%Y%m%d-%H%M%S)` tên literal trên box2 đã biến mất — Tuan xoá rồi.

14 file orphan đã `shred -u`: bản trùng + 4 key staging (`10059b54` ×7, `f919cfea`, `89d4bf91`,
`8a142478`) nằm rải trong thư mục build cũ. **Xoá file ≠ revoke** — 4 key staging đó vẫn sống trong
GCP tới khi xoá bằng `gcloud iam service-accounts keys delete`. Các script dựng staging cũ
(`/home/avada/install-staging.sh` trên box1, `install.sh`/`deploy-to-worker.sh` trong build dir) vẫn
trỏ tới file đã xoá → lần dựng lại phải mint key mới, đừng đi tìm file cũ.

**Đã vá 2026-09-09:** xoá authorized_key `dongnv@avada.email` khỏi box2 (RSA 4096,
`SHA256:YOl2WGqm…`, 0 lần dùng trong auth.log — nhưng log chỉ lùi tới 9/8). Tắt
`PasswordAuthentication` trên **box1 + box2** qua `/etc/ssh/sshd_config.d/99-hardening.conf`.
Bằng chứng an toàn trước khi tắt: box1 login password dừng 13/8 đúng lúc key `macmini-toyn` lắp
xong; box2 chỉ có `192.168.2.204` login password (27 lần, toàn ngày 10/8, chưa từng dùng key) —
người dùng thật là `tunglv` từ `192.168.2.248`, bằng key, mỗi ngày.

Verify việc tắt password phải dùng **3 dấu hiệu**, không tin mỗi cái file config: (1) loopback
`ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no avada@127.0.0.1` phải trả
`Permission denied (publickey)` chứ không phải `(publickey,password)`; (2) `journalctl -u ssh |
grep SIGHUP`; (3) `systemctl show ssh -p StateChangeTimestamp`. **`ActiveEnterTimestamp` KHÔNG đổi
khi reload** — đừng dùng nó để kết luận. Ghi file config mà quên `systemctl reload ssh` thì sshd
vẫn chạy config cũ và im lặng, đúng ca box2 dính.

Central tắt sau cùng, và trước khi tắt phải **lắp key `macmini-toyn` vào central** — nó chỉ có
`minhdevtree_macos` + `gitlab-ci-deploy-worker`, tức Mac của Tuan lâu nay vào central chỉ nhờ
Tailscale SSH hoặc password. Mac không route được tới LAN của central (`192.168.10.x`, khác subnet
với box1/box2 ở `192.168.2.x`) nên không test được sshd thật từ Mac, chỉ qua Tailscale.

**box1 `0.0.0.0:5000` (local-registry) KHÔNG được bind về localhost — sẽ gãy deploy.** Log registry
3/7 → 9/9 cho thấy client thật: `100.113.50.9` (build box) 1548 lần, `192.168.2.50` 162,
`192.168.2.204` 155, `192.168.2.184` (box2) 128. Build box push image, box2 pull. `192.168.2.204` là máy làm việc thật (dùng registry), không phải kẻ lạ.

**ufw trên các box này KHÔNG lọc được `:5000` và `:6379` — đừng sửa bằng ufw.** Đo 2026-09-09 bằng
socket python (KHÔNG dùng `/dev/tcp`, nó cho false positive): từ Mac và từ central đều mở cả
`box1:6379` lẫn `box1:5000`, dù ufw chỉ ghi `6379/tcp ALLOW IN from 192.168.1.0/24`. Hai lý do
chồng nhau: Tailscale ACCEPT traffic tới trên `tailscale0` ở chain `ts-input` **trước** rule ufw, và
Docker chèn chain riêng cho `-p 5000:5000` xuyên qua ufw trên LAN. Lớp duy nhất chi phối được là
**Tailscale ACL**, cộng htpasswd cho registry.

Chuỗi tấn công thật: chiếm 1 trong 9 node tailnet (gồm cả iphone và 2 GCE instance) → push image lên
`box1:5000` (registry:2 không auth) → box2 pull → code lạ chạy trên worker prod đang mount key
`e2049477`. Không cần password, không cần SSH.

**Đã đóng 2026-09-09.** `local-registry` trên box1 là rác từ 20/7 (không client từ xa nào sau ngày
đó; `daemon.json` box1 trỏ `100.113.50.9:5000`, box2 trỏ `192.168.2.204:5000` — **không máy nào pull
từ box1**). Đã `docker stop` + `restart=no`, giữ container và volume `registry-data` để hoàn tác.
Tailscale ACL bỏ catch-all `{"src":["*"],"dst":["*"],"ip":["*"]}` (nó là default của tailnet, chính
nó làm mọi node chạm mọi cổng), thay bằng grant hẹp. Verify sau khi đổi: box2 → `central:6380` và
`central:8090` MO, box2 → `box1:22` và `central:22` **TimeoutError** (ACL drop, khác
ConnectionRefused = tới nơi mà bị từ chối). Beszel vẫn đủ 5 peer báo về `central:8090`.

`0.0.0.0:6379` trên box1 là `redis-server` cài trên host (không phải container), có AUTH, 0 kết nối
ở 2 lần đo — **không worker nào trên box1 dùng nó**: prod trỏ `100.87.235.36:6380` db0, staging4 trỏ
`seoworker.minhdevtree.tech:6380` db4.

`fail2ban` bỏ qua có chủ đích: sau khi tắt password auth thì không còn gì để brute, nó chỉ còn tác
dụng dọn rác log. box1 có user `tunglv` uid 1001 trong group sudo. 4 key staging đã xoá file nhưng
**chưa revoke trên GCP** (Tuan tự làm).
Tailscale SSH `RunSSH=true` cả 3 → đó mới là cửa trước thật, password không chắn được nó.

Liên quan: [[seo-central-box-access]], [[seo-fleet-tailscale-acl-autodeploy]],
[[seo-gen2-follower-fleet-deploy]], [[seo-prod-token-key-committed]].
