---
name: seo-worker-box-credential-surface
description: 3 worker box giữ key admin prod avada-seo (11 role); avada ∈ docker nên avada ≡ root; sau dọn 2026-09-09 chỉ còn đúng 4 file SA.
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-09T07:27:22.103Z
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

**Sau dọn 2026-09-09: đúng 4 file chứa `private_key` trên cả fleet** (trước đó 18):

| box | path | SA |
|---|---|---|
| central | `Projects/seo-worker/credentials/firebase.json` | bplmq · avada-seo · e2049477 |
| box1 | `seo-worker-prod/credentials/firebase.json` | bplmq · avada-seo · e2049477 |
| box1 | `seo-worker-staging4/firebase.json` | 23wcr · avada-seo-staging-4 · afbb6b82 |
| box2 | `seo-worker-prod/credentials/firebase.json` | bplmq · avada-seo · e2049477 |

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
