# SEO → git.avada.net — trạng thái thật & việc còn lại

Soạn 2026-08-17. Đo qua GitLab API cả hai host, không đoán.

> **Đính chính bản trước.** Bản runbook đầu tiên viết theo giả định "chưa migrate, seo là repo
> đầu tiên". Sai. Migration đã chạy từ **2026-08-09**. 25 project đã nằm trên self-host, gồm
> `seo`, `blogs`, `joy`, `ai-product-copy`, `avada-image-optimizer`, `llm-ai-search-seo`,
> `avada-core`, và cả hai repo artifacts. Việc còn lại là **đồng bộ lại + cutover**, không phải migrate.
>
> **Đính chính thứ hai.** `joy`, `blogs`, `avada-image-optimizer` **đã deploy production thật
> từ self-host trong ngày 2026-08-17** (trace job 31 KB – 354 KB). CI self-host không phải thứ
> chưa được chứng minh — nó đang chạy prod cho 3 app. Chỉ riêng `seo` là chưa cutover.

## Self-host

GitLab **19.1.0**, `enterprise: false` → **Community Edition**.
`avada/seo` = project id **426**, tạo 2026-08-09. Token `macminim4` của mày ở đây là
**Maintainer (40)** trên project, **không phải admin** — `/api/v4/application/settings` và
`/runners/all` đều trả **403**.

## Đã xong

| Hạng mục | Trạng thái |
|---|---|
| Repo `seo` | 18737 commit, **1872 branch, 4295 tag**, 111 MB |
| MR | 2153 (import mang theo) |
| Protected branch | `master` |
| **CI/CD variables** | **119/119 khớp tuyệt đối** — diff key hai host = rỗng cả hai chiều |
| **Runner** | **9 runner online**, đều untagged → hợp với việc 0 job khai `tags:` |
| Group | `avada`, `avada/artifacts`, `avada/falcon`, `avada/falcon/product`, `avada/starlink-team` |
| Repo artifacts | `avada/artifacts/avada-seo-react-app-artifacts` id 391 — đã cắt lịch sử 720 → **19 commit** |
| CI clone URL | đã sửa sang `git.avada.net/avada/artifacts/...` ở commit `91dc5e48` |

Script `jobs/scripts/migrate-ci-vars.sh` giữ lại làm công cụ cho repo sau — repo này không cần nữa.

## Còn lại: 5 việc

### 1. Master phân kỳ hai chiều, không có mirror — **nghiêm trọng nhất, xấu thêm mỗi ngày**

```
merge-base:        e1bf1384  2026-08-07
self-host master:  91dc5e48  2026-08-12   "fix(ci): clone artifacts from git.avada.net instead of gitlab.com"
gitlab.com master: 90034c49  2026-08-17 11:07  "Merge branch 'fix/genMetaTitleBlog'"
```

Kiểm chéo: self-host **không có** `90034c49` (404), gitlab.com **không có** `91dc5e48` (404).
`git ls-remote` push mirror trên gitlab.com: **NONE**. Không có gì giữ đồng bộ.

Team vẫn merge vào gitlab.com bình thường suốt 5 ngày qua. MR: gitlab.com 2211 vs self-host 2153
→ **58 MR sinh sau lúc import**, chưa có ở self-host.

Commit `91dc5e48` chỉ tồn tại ở self-host và **là commit phải giữ** — nó sửa đúng 2 dòng clone
artifacts. Diff đã đọc, chỉ đụng `.gitlab-ci.yml`, không gì khác.

### 2. ~~CI chưa từng chạy thật trên self-host~~ — ĐÃ ĐÓNG

Đúng ở phạm vi project 426: pipeline `2026-08-07` id `143xxx` là metadata import mang theo,
không phải lần chạy thật; sự kiện thật duy nhất là `2026-08-12 master status=skipped id=206754`.

Nhưng kết luận rút ra từ đó thì sai. Cùng ngày 2026-08-17, **`joy`, `blogs` và
`avada-image-optimizer` đều deploy production thật từ self-host** (job `deploy_production`,
`deploy-react:production`, `push-react-artifacts:production` — trace 31 KB – 354 KB).

Nên image pull, `yarn install` qua `registry.avada.io`, auth Firebase/GCP đều đã được chứng
minh ở quy mô fleet. Chỉ riêng project 426 là chưa chạy, vì chưa ai cutover nó.

Chưa có tiền lệ ở app nào khác, vẫn phải tự kiểm khi cutover: **đường SSH `[deploy-worker]`**
(`.gitlab-ci.yml:93-150`, SSH vào central rồi chạy ansible) — không app nào khác có job này.

### 3. ~~Image CI~~ — ĐÃ ĐÓNG, không phải vấn đề

Nghi ban đầu: `.gitlab-ci.yml:1` pull `registry.gitlab.com/anhnt34/avada-docker-image-cicd`
(namespace cá nhân) mà 119 biến CI không có `DOCKER_AUTH_CONFIG`.

**Sai.** Đọc `.gitlab-ci.yml` của 3 app đã cutover trên chính self-host:

| App | dòng 1 |
|---|---|
| `avada/starlink-team/joy` | `registry.gitlab.com/anhnt34/avada-docker-image-cicd:wasm2-node-20-19-5` |
| `avada/blogs` | `registry.gitlab.com/anhnt34/avada-docker-image-cicd:wasm2-node-20-19-5` |
| `avada/avada-image-optimizer` | `registry.gitlab.com/anhnt34/avada-docker-image-cicd:latest` |

Cả ba **đang deploy production thật** từ git.avada.net với đúng image đó. Runner đã có sẵn
credential registry.gitlab.com trong `config.toml`.

→ **Bỏ hẳn phase mirror image và phương án `DOCKER_AUTH_CONFIG`.** `.gitlab-ci.yml:1` của seo
giữ nguyên. Đây là khuôn mẫu chung của cả fleet, không phải ngoại lệ của seo.

### 4. Repo artifacts stale 7 ngày, vẫn 1.6 GB

self-host id 391: 19 commit, **1596 MB**, last activity `2026-08-10`.
gitlab.com: 720 commit, 3.17 GB, last activity `2026-08-17T03:33` (có commit mới hôm nay).

Cắt lịch sử mới đi được nửa đường: 720 → 19 commit nhưng còn 1.6 GB. Cây hiện tại tự nó đã
nặng — `static/assets` tích asset hash cũ không ai xoá. Muốn về vài chục MB thì phải dọn
**nội dung cây**, không chỉ lịch sử.

Repo này nằm trong đường deploy production: `push-react-artifacts:production` ghi vào,
`deploy-react:production` clone ra rồi `firebase deploy --only hosting`. Stale ở đây =
hosting prod deploy nhầm `static/` cũ.

### 5. Local + CE gap

- 3 worktree local (`seo`, `seo-wt-agentic-browsing-score`, `seo-wt-fleet-spill`) dùng chung 1
  `.git`, `origin` vẫn `gitlab.com`. Đổi 1 lần là xong cả 3.
- Self-host là **CE**. Nếu group gitlab.com đang Premium thì mất: MR approval rules, CODEOWNERS,
  protected environments, merge trains. Kiểm rule nào đang thực sự gác `master` trước khi cutover.

---

# Việc cần làm, theo thứ tự

## Bước 0 — ĐÃ XONG 2026-08-17: pull hết về local

Trước khi có thao tác ghi đè nào, kéo đủ cả hai host về `.git` local
(`projects/Falcon/seo`, 3 worktree dùng chung):

```bash
git fetch origin --tags --prune --prune-tags        # gitlab.com
git fetch <self-host> 'refs/heads/*:refs/selfhost/*' --prune
```

Kết quả:

| | gitlab.com | self-host | local giữ |
|---|---|---|---|
| Branch | 1905 | 1872 | cả hai (`refs/remotes/origin/*` + `refs/selfhost/*`) |
| Tag | 4322 | 4295 | 4322 |
| master | `5e226d21` | `91dc5e48` | cả hai |

Self-host thiếu **33 branch + 27 tag** so với gitlab.com — đều sinh sau lúc import 08-09.

**Patch cứu commit self-host-only đã lưu:**
`jobs/patches/0001-fix-ci-clone-artifacts-from-git.avada.net-instead-of.patch`

**Xung đột tag `v1.84.3`** — fetch từ chối ghi đè:
```
local:      c5e0e306e85ce785313cad60cc914a5db0bd8b7e
gitlab.com: 2a4ca3703c7cd0b5e4d2c095dfd25c87203ef9d1
```
Tag đã bị xoá rồi tạo lại trên gitlab.com. Lấy bản gitlab.com làm chuẩn khi cutover:
`git tag -f v1.84.3 2a4ca370`. Không cần xử lý trước, nhưng đừng bỏ qua khi đối soát.

**`master` trên gitlab.com nhảy 2 lần trong 30 phút phiên này** (`90034c49` → `5e226d21`).
Team đang làm việc bình thường. Mọi con số ở đây là ảnh chụp, đối soát lại ngay trước cutover.

## Bước 1 — Bịt chảy máu: bật push mirror gitlab.com → self-host **ngay**

Làm trước mọi thứ khác. Mỗi ngày trôi qua là thêm commit + MR phân kỳ.

Push mirror chỉ đẩy một chiều gitlab.com → self-host, **sẽ đè `master` ở self-host**, tức
**xoá commit `91dc5e48`**. Patch đã cứu ở Bước 0, nên đi tiếp được.

Trên gitlab.com bật mirror: **Settings → Repository → Mirroring repositories**,
direction **Push**, URL `https://git.avada.net/avada/seo.git`, method Password, user + PAT
self-host. Bật **Keep divergent refs = off** để mirror ép đồng bộ.

**Đây là thao tác ghi đè lịch sử ở self-host — xác nhận đã có patch `91dc5e48` trong tay
trước khi bật.**

## Bước 2 — Đưa commit CI fix lên gitlab.com (nơi team đang làm việc)

Commit `91dc5e48` sửa 2 dòng clone. Nó phải sống ở gitlab.com để mirror mang ngược xuống, và
để lúc cutover không phải nhớ.

**ĐÃ XONG 2026-08-17 — MR gitlab.com !2213 (Draft):**
`https://gitlab.com/avada/seo/-/merge_requests/2213`
branch `chore/gitlab-selfhost-cutover`, base `dedff23d09`, 2 commit, 2 file, +11/-3.

Nội dung MR:
1. cherry-pick `91dc5e48` (commit chỉ có ở self-host) → clone artifacts từ
   `git.avada.net/avada/artifacts/avada-seo-react-app-artifacts`. Path đã verify **HTTP 200**.
2. `deploy_production_only_functions` thêm `refs: - master` — job này trước đó **không có ràng
   buộc ref nào**, mọi branch có commit title `[deploy-only] ... functions` đều deploy được vào
   `avada-seo`. Đây cũng là thứ chặn việc protect credential production.
3. `deploy-react:production` clone artifacts với `--depth 1` (job chỉ đọc, repo ~1.6 GB).
   `push-react-artifacts:production` **giữ clone đầy đủ** vì có `git push` ngược.
4. `extensions/package.json` đổi url repo.

Đã lint qua CI lint API của self-host: `valid: true`. `extensions/package.json` parse OK.

**Để Draft có chủ đích. Không merge trước cutover** — cả hai lệnh clone giờ trỏ vào bản artifacts
ở self-host đang stale ~7 ngày. Merge sớm thì pipeline vẫn đang chạy trên gitlab.com sẽ đẩy
`static/` cũ lên hosting production. Merge sau khi reseed artifacts (Bước 5).

## Bước 3 — ~~Chứng minh CI chạy được trên self-host~~ — ĐÃ ĐÓNG

Không cần smoke test riêng nữa. **`joy`, `blogs`, `avada-image-optimizer` đang deploy production
thật từ git.avada.net**, cùng image, cùng kiểu job, trace 31 KB – 354 KB. CI self-host đã được
chứng minh ở quy mô lớn hơn mọi smoke test.

Branch thử `test/selfhost-ci-smoke` đã **xoá** (HTTP 204) cùng worktree tạm. Job `smoke:selfhost`
không đi vào MR nào.

Đã đo được trên đường đi, vẫn còn giá trị:
- **Push branch thường không kích hoạt job nào.** Cả file chỉ có 1 job stage `check` là
  `docs_gate` (`:2195`), và nó chỉ chạy khi `$CI_PIPELINE_SOURCE == "merge_request_event"`.
  Giải thích pipeline `master status=skipped` ngày 08-12. Muốn smoke test thì phải thêm job
  tạm hoặc mở MR.
- **CI lint API của self-host: `valid: true`** với nội dung `.gitlab-ci.yml` đã sửa.
- **Cache chỉ có `.yarn/cache/`.** Lần chạy đầu không cache → `yarn install --immutable` tải
  từ đầu, job chạy >20 phút. Lần sau sẽ nhanh hơn; đừng đọc lần đầu là hiệu năng thật.
- **Runner không stream trace về.** `GET /jobs/:id/trace` trả HTTP 200 nhưng 0 byte suốt lúc
  job chạy. Đọc log phải chờ job kết thúc, hoặc xem qua UI.

Việc còn lại của bước này:
2. Nếu fail ở bước pull image → đúng như mục 3 ở trên. Ba đường:

   **(a) Để TEST: đổi tạm sang `node:20.19.5` public.** Đã truy: image riêng kia không thực sự
   cần thiết cho phần lớn job.
   - `gcloud` **không** nằm trong image — CI tự cài lúc chạy. `.gitlab-ci.yml:2130` ghi rõ:
     *"Install gcloud at runtime (CI image is node:22, no gcloud)"*, và `:2161` là bước cài.
   - `firebase` (53 lần gọi) đến từ `./node_modules/.bin/firebase` hoặc
     `npm install -g firebase-tools@13.35.1`, không từ image.
   - Không repo nào khai dep `wasm` — chữ `wasm2` trong tên image là di sản đặt tên.
   - `ssh` (8 lần gọi) có sẵn trong image `node` bản đầy đủ.

   Nên dùng **`node:20.19.5`**, không phải `node:20`: giữ đúng pin patch-level của image cũ.
   **Không dùng `-slim` hay `-alpine`** — `packages/functions` có `sharp`, alpine (musl) sẽ
   phải build native từ đầu và hỏng.

   ```yaml
   image: node:20.19.5   # tạm, để verify runner self-host chạy được — không dùng cho cutover
   ```

   Đây là image test, **không phải cấu hình cuối**. Nó chứng minh được runner + network +
   vars, nhưng không chứng minh được thứ gì khác đã bake sẵn trong image riêng mà chưa ai truy ra.

   **(b) Cho cutover: mirror image thật** sang registry self-host rồi sửa `.gitlab-ci.yml:1`.
   ```bash
   docker login registry.gitlab.com
   docker pull registry.gitlab.com/anhnt34/avada-docker-image-cicd:wasm2-node-20-19-5
   # xác nhận hostname registry của self-host trước khi tag
   docker tag registry.gitlab.com/anhnt34/avada-docker-image-cicd:wasm2-node-20-19-5 \
              registry.git.avada.net/avada/seo/cicd:wasm2-node-20-19-5
   docker push registry.git.avada.net/avada/seo/cicd:wasm2-node-20-19-5
   ```

   **(c)** hoặc thêm biến CI `DOCKER_AUTH_CONFIG` (type File) chứa credential
   `registry.gitlab.com` — giữ được image thật mà không cần registry self-host, đổi lại vẫn
   còn một sợi dây buộc vào gitlab.com.

   Lưu ý lệch phiên bản có sẵn từ trước, không do migrate: `package.json` khai
   `engines.node: "22"` trong khi image CI là node 20.19.5, và job deploy Shopify extension
   tự override `image: node:22`.
3. Chạy deploy staging (`avad-seo-staging`). **Không deploy prod ở lần đầu.**
4. Verify — pipeline xanh **không** đồng nghĩa revision nhận traffic:
   ```bash
   gcloud run services describe <service> --project avad-seo-staging \
     --format='value(status.traffic[0].revisionName)'
   ```

## Bước 4 — Sửa reference còn sót trong code

`91dc5e48` mới sửa 2 dòng clone. Còn lại:

| File:line | Việc |
|---|---|
| `.gitlab-ci.yml:1` | image → bản đã mirror (Bước 3) |
| `.gitlab-ci.yml` job `deploy-react:production` | thêm `--depth 1` vào clone artifacts (job chỉ đọc) |
| `.gitlab-ci.yml` job `push-react-artifacts:production` | **giữ clone đầy đủ** — có `git push` ngược, shallow hay dính `shallow update not allowed` |
| `extensions/package.json:11` | `https://gitlab.com/avada/seo.git` → `https://git.avada.net/avada/seo.git` |
| `packages/functions/install.sh:18,20` | comment `registry.gitlab.com/<proj>` |
| `packages/functions/compose.worker.yml:13` | comment `registry.gitlab.com/<proj>/seo-worker` |
| `packages/functions/fleet/deploy-workers.yml:29` | comment `registry=registry.gitlab.com/<proj>` |
| `docs/phase-2-fleet-packaging.md:79` | doc `registry.gitlab.com/<proj>/seo-worker` |

Không đổi: `.npmrc` / `.yarnrc.yml` trỏ `registry.avada.io`, không liên quan GitLab.
`packages/functions/docs/seo-worker/WORKER-SDK.vi.md:58,1282` trỏ `worker-sdk` — repo đó
chưa lên self-host, giữ nguyên.

## Bước 5 — Đồng bộ lại repo artifacts

Bản self-host stale 7 ngày. Ngay trước cutover, seed lại từ cây hiện tại của gitlab.com:

```bash
set -a; source /Users/nguyentuan/Documents/second-brain/jobs/.env; set +a

git clone --depth 1 --branch main \
  "https://oauth2:<PAT-gitlab.com>@gitlab.com/avada/artifacts/avada-seo-react-app-artifacts.git" \
  /tmp/seo-artifacts
cd /tmp/seo-artifacts
du -sh .                 # kích thước cây thật

rm -rf .git
git init -b main
git add -A
git commit -m "Reseed from gitlab.com avada/artifacts/avada-seo-react-app-artifacts @ main

Repository is a CI state store for built static/ assets; history carries no value,
so it is truncated at each reseed."
git remote add origin "https://oauth2:$GLAB_SELF_HOST@git.avada.net/avada/artifacts/avada-seo-react-app-artifacts.git"
git push --force -u origin main
```

`--force` ở đây ghi đè `main` của repo artifacts trên self-host. Đúng ý đồ — repo này là state
store, không phải lịch sử cần giữ — nhưng vẫn là ghi đè, chạy có chủ đích.

## Bước 6 — Cutover

1. **Freeze** merge vào `master` ở gitlab.com. Trong cửa sổ này không được có pipeline
   production nào chạy — nếu không `push-react-artifacts` sẽ ghi vào artifacts sai host.
2. Đợi push mirror (Bước 1) đẩy nốt lần cuối, hoặc bấm **Update now**.
3. Kiểm hai HEAD bằng nhau:
   ```bash
   git ls-remote https://gitlab.com/avada/seo.git master
   git ls-remote https://git.avada.net/avada/seo.git master
   ```
4. Reseed artifacts (Bước 5).
5. Merge MR ở Bước 2/4.
6. Đổi remote local — 1 lần cho cả 3 worktree:
   ```bash
   git -C /Users/nguyentuan/Documents/second-brain/projects/Falcon/seo \
     remote set-url origin https://git.avada.net/avada/seo.git
   git -C /Users/nguyentuan/Documents/second-brain/projects/Falcon/seo fetch --all --prune
   ```
7. Thêm host cho `glab`:
   ```bash
   glab auth login --hostname git.avada.net --stdin < <(printf '%s\n' "$GLAB_SELF_HOST")
   ```
8. Tắt push mirror, đặt gitlab.com về **archived** (đừng xoá), sửa description trỏ host mới.
9. Cập nhật `second-brain/CLAUDE.md`: bảng Repo → Firebase project hiện ghi remote gitlab.com
   cho cả 18 repo, đã sai với 25 project đang ở self-host.

---

## Chưa verify được (token thiếu quyền)

Token `macminim4` là Maintainer trên project, không phải admin — thiếu scope `admin_mode`.
Muốn kiểm mấy thứ dưới đây thì tạo PAT mới trên `git.avada.net` có tick **`admin_mode`**:

- `config.toml` của runner có credential `registry.gitlab.com` không (quyết định Bước 3)
- `max_import_size`, `bulk_import_enabled`
- container registry của self-host đã bật chưa, hostname là gì
- runner nào thực sự được gán cho project 426 (endpoint project-level thấy 14 runner, nhưng
  không đọc được cấu hình từng cái)

## Runner 10/13 hỏng — NGOÀI PHẠM VI, đã bàn giao

Truy ra ngày 2026-08-17: runner id **10** và **13** (trùng description
`gitlab-cicd-runner-20260603-20260804-20260804-091322`) nhận job rồi không upload trace,
bị `StuckCiJobsWorker` quét chết mỗi giờ ở phút :15. 10/11 lỗi hạ tầng trên 80 job của 6
project đến từ đúng hai con này; lỗi có từ 2026-08-14. Runner 12 (`...091250`) khác 4 ký tự
cuối và hoàn toàn tốt — đừng nhầm.

Cả 14 runner đều `group_type`, không có role group nào trong tay nên không pause được
(403 ở `/runners/:id` và `/groups/*/runners`). Owner project 426: `sam` (Sam Ng),
`anhnt` (Nguyễn Tuấn Anh).

**Chốt 2026-08-17: không theo tiếp.** Fleet đang phục vụ production cho 3 app, tỉ lệ hỏng chấp
nhận được, và đây là việc của người vận hành GitLab chứ không thuộc phần chuyển seo. Ghi lại ở
đây để khỏi truy lại từ đầu nếu sau này job seo chết không log.

## Rủi ro tồn đọng

- **Repo artifacts sẽ phình lại.** Reseed chỉ reset đồng hồ; mỗi deploy prod lại thêm 1 commit
  dump nguyên `static/`. Sửa gốc: cho `push-react-artifacts` force-push orphan commit thay vì
  commit chồng. Ngoài phạm vi, nên mở task riêng.
- **`GIT_ACCESS_TOKEN` — đã kiểm, ĐÃ đổi đúng.** Không phải bản copy từ gitlab.com: token tên
  `CI CD`, thuộc **git.avada.net**, scopes `read_repository` + `write_repository` + `read_api`,
  Maintainer (40) trên repo artifacts qua group. Test chéo: `git.avada.net` → 200,
  `gitlab.com` → 401. Rủi ro này đóng.
  **Nhưng nó hết hạn `2026-09-12`** — 26 ngày nữa. Cutover xong mà quên gia hạn thì
  `push-react-artifacts` và `deploy-react:production` chết cùng lúc, đúng đường deploy hosting
  production. Đặt lịch xoay token trước ngày đó.
- **CE vs Premium**: kiểm rule đang gác `master` ở gitlab.com có sống trên CE không.

## Security — CI variables (đã siết trên self-host 2026-08-17)

Trạng thái ban đầu: trong 119 biến chỉ **2** biến `protected=true`, và `GCP_SA_KEY_PRODUCTION`
là `protected=false masked=false`. Nghĩa là ai push được branch bất kỳ cũng thêm được job in
khoá service-account production ra log, và GitLab không che.

Tình trạng có sẵn, **không do migrate gây ra** — vars copy nguyên si nên gitlab.com cũng vậy.

**Đã áp trên `git.avada.net` project 426. Chưa áp cho gitlab.com** (chọn self-host trước,
gitlab.com đang là nơi team làm việc thật).

Kết quả đo lại: **119 biến, masked 14 (từ 5), protected 5 (từ 2)**.

| Biến | mask | prot | Ghi chú |
|---|---|---|---|
| `GCP_SA_KEY_PRODUCTION` | ✅ mới | ✅ mới | |
| `PRODUCTION_ENV_FILE` | ✗ | ✅ mới | 9894 ký tự multi-line → GitLab không mask được |
| `PRODUCTION_ASSETS_ENV_FILE` | ✗ | ✅ mới | 687 ký tự multi-line → như trên |
| `GCP_SA_KEY_STAGING`, `_2`, `_3`, `_4`, `_5` | ✅ mới | ✗ | không protect được, xem dưới |
| `FIREBASE_DEPLOY_KEY`, `NPM_TOKEN`, `SHOPIFY_CLI_PARTNERS_TOKEN`, `WORKER_DEPLOY_SSH_KEY` | ✅ mới | ✗ | |
| `GIT_ACCESS_TOKEN`, `RELEASE_API_TOKEN`, `GOOGLE_CLOUD_CREDENTIALS_JSON`, `STAGING_VITE_STREAM_URL` | ✅ sẵn có | | |

**Staging không protect được, về mặt cấu trúc.** Mỗi slot `staging_2..8` hard-pin vào **một tên
branch feature** mà dev sửa khi chiếm slot (`fix/organization-schema`,
`feat/cs-assisted-onboarding`, `improve/checklist-UI`...). Branch đó không thể protected.
`staging_1` và `staging_7` đang bị vô hiệu bằng ref giả `__` / `------`.

**Còn nợ:** `deploy_production_only_functions` (`:1959`) vẫn **không có `refs:`** — chạy được
trên mọi branch chỉ với commit title `[deploy-only] functions`. Giờ nó đã mất
`GCP_SA_KEY_PRODUCTION` + `PRODUCTION_ENV_FILE` trên branch không protected, nên **sẽ hỏng nếu
ai chạy từ branch**. Hôm nay không ảnh hưởng gì vì seo chưa cutover, chưa ai chạy pipeline seo
trên self-host. Bản vá `refs: - master` **phải đi vào MR ở Bước 2/4 trên gitlab.com master**,
không commit thẳng lên self-host — nếu không lại đẻ thêm một commit self-host-only như `91dc5e48`.

## Bug tồn đọng phát hiện khi audit vars (có sẵn, không do migrate)

Đối chiếu biến `.gitlab-ci.yml` tham chiếu với biến thực có:

- **`GCP_SA_KEY_STAGING_6`, `_7`, `_8` không tồn tại** ở cả hai host, nhưng `before_script` có
  nhánh `case` gán chúng. Job deploy staging_6 / staging_8 sẽ nhận `FIREBASE_SA_B64` rỗng và
  hỏng auth. staging_7 đang vô hiệu bằng ref `------` nên không lộ.
- **`STAGING_8_API_URL` thiếu** — staging_8 chỉ có 8 biến, staging_7 có 9, staging_6 có 11.
  Slot staging_8 cấu hình chưa đủ.

`.npmrc` và `.yarnrc.yml` commit plaintext auth token của `registry.avada.io` vào repo, và
lịch sử đó giờ tồn tại trên hai host với hai tập người truy cập. Nên rotate token đó và chuyển
sang biến CI. Quyết định riêng, không nằm trong phạm vi cutover.

`jobs/.env` đang gitignored và chưa tracked — đã kiểm, ổn.
