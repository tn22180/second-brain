# Design — dọn bloat repo `avada-seo-react-app-artifacts`

Date: 2026-08-05
Brief: `jobs/artifact.md`
Repo chịu thay đổi: `projects/Falcon/seo` (CI + `packages/assets`). Repo artifact chỉ là kho, không chứa code.

## 1. Hiện trạng đo được

| Metric | Giá trị |
|---|---|
| `static/assets` tại HEAD | 195,468 file / 7.49 GB |
| Chunk name khác nhau | 228 |
| Bản trung bình mỗi chunk | ~857 |
| `index-*.js` | 56,447 bản × ~1.4 MB |
| `.git` shallow depth=1 | 2.8 GB |
| Rác committed | `node_modules/`, `.idea/`, `.DS_Store`, `all_files.txt`, `changed_files.txt`, `files_to_remove.txt` |

Nguồn: shallow clone 2026-08-05, metadata giữ tại `scratchpad/artifact-facts/assets-sizes.tsv`.

## 2. Cơ chế gây bloat

`seo/.gitlab-ci.yml` (origin/master):

- **L2013-2045 `push-react-artifacts:production`** — `cp -rf static/* avada-seo-react-app-artifacts/static/` rồi commit. Chỉ cộng, không bao giờ xoá. Mỗi tag deploy thêm ~228 chunk mới, chunk cũ ở lại vĩnh viễn.
- **L2047-2075 `deploy-react:production`** — `cp -rf avada-seo-react-app-artifacts/static/* static/` rồi `firebase deploy --only hosting`. Mỗi deploy đẩy lại toàn bộ 195k file lên Hosting.
- `packages/assets/vite.config.js:249` `emptyOutDir: false` — build cũng không tự dọn `static/`.

Lý do lịch sử của thiết kế additive: `firebase.json` rewrite cuối cùng là `** → /standalone.html`. Chunk bị xoá → request trả HTML 200 chứ không phải 404 → Vite ném `Failed to fetch dynamically imported module` → tab đang mở của user vỡ khi navigate. Giữ hết file là cách né vấn đề đó.

## 3. Quyết định

| Vấn đề | Chọn |
|---|---|
| Retention window | Biến CI `ARTIFACT_RETENTION_DAYS`, **default 14** |
| Dating file | Manifest-per-deploy trong chính artifact repo |
| Thu nhỏ repo | Artifact repo luôn đúng **1 orphan commit**, mỗi deploy force-push đè |
| Trigger dọn | Inline trong pipeline deploy, trước bước push |
| Bù rủi ro window ngắn | Guard chunk-load-error ở `packages/assets` |

Không dùng `mtime` (git checkout reset mtime về thời điểm checkout). Không dùng `git log` cho vận hành thường ngày (history sẽ bị reset về 1 commit, và clone `--depth 1` không có history). `git log` chỉ dùng đúng một lần ở job reset §4.4, khi history cũ vẫn còn — đó là nguồn dating duy nhất tồn tại tại thời điểm đó.

## 4. Kiến trúc

### 4.1 Manifest

Mỗi deploy ghi vào artifact repo:

```
manifests/<UTC-YYYY-MM-DD>_<CI_PIPELINE_ID>.txt
```

Nội dung: đường dẫn tương đối gốc repo của **toàn bộ build mới**, mỗi dòng một file, đã sort:

```
static/assets/index-BmPhqust.js
static/standalone.html
static/sw.js
...
```

Keep-set = union các manifest có ngày ≥ `today − ARTIFACT_RETENTION_DAYS`. Manifest của chính lần deploy này luôn nằm trong union → không bao giờ tự xoá file vừa build.

Kích thước: sau lần dọn đầu mỗi manifest ~230 dòng (~10 KB). 14 ngày × vài deploy/ngày = dưới 1 MB. Không đáng kể.

### 4.2 `scripts/artifact-prune.sh`

Chạy bên trong bản clone của artifact repo. Bash thuần, không dependency (job có `before_script: []`, không có `yarn install`).

Thuật toán:

1. `CUTOFF = today_utc − RETENTION_DAYS`
2. Giữ mọi `manifests/<date>_*.txt` có `date >= CUTOFF`; ghi danh sách manifest hết hạn để xoá
3. `cat` các manifest được giữ → `sort -u` → `keep.txt`
4. `find static -type f | sort` → `all.txt`
5. `comm -23 all.txt keep.txt` → `delete.txt`
6. Xoá từng file trong `delete.txt` + các manifest hết hạn

Rào an toàn — **abort trước khi xoá bất cứ thứ gì** nếu:

- `keep.txt` rỗng hoặc dưới 50 dòng
- manifest của `CI_PIPELINE_ID` hiện tại không tồn tại
- bất kỳ dòng nào trong `delete.txt` không bắt đầu bằng `static/`
- `delete.txt` chứa path có `..` hoặc bắt đầu bằng `/`

Dry-run: `ARTIFACT_PRUNE_DRY_RUN=1` → in số file + tổng bytes sẽ xoá, exit 0, không đụng disk.

Output luôn in: số file trước, số giữ, số xoá, bytes thu hồi.

### 4.3 `push-react-artifacts:production` — thứ tự mới

```
1. git clone --depth 1 <artifact repo>          # KHÔNG kéo history GB
2. mkdir -p artifacts/manifests
3. (từ $CI_PROJECT_DIR) find static -type f | sort > artifacts/manifests/<date>_<pipeline>.txt
4. cp -rf static/* artifacts/static/            # merge build mới vào tập cũ
5. bash scripts/artifact-prune.sh artifacts/    # dọn theo keep-set
6. cd artifacts && git checkout --orphan tmp && git add -A && git commit
7. git push --force origin tmp:main
```

Bước 3 phải chạy **trước** bước 4, nếu không manifest sẽ chứa cả file cũ và retention thành vô nghĩa.

Bước 6-7 là điểm mấu chốt: xoá file bằng commit mới **không** giảm dung lượng git (blob cũ vẫn nằm trong pack). Orphan + force-push khiến repo luôn chỉ có đúng một commit → size repo ≡ size working set, vĩnh viễn không phình. Không cần cron, không cần `git filter-repo`.

Thêm `resource_group: artifact-push` để hai pipeline không force-push đè nhau.

Đánh đổi: mất lịch sử commit của artifact repo. Chấp nhận được — repo này không phục vụ traffic, chỉ feed cho job deploy, và mỗi commit vốn chỉ là "CI đã copy file vào".

### 4.4 Job reset một lần

Job `artifact-repo:reset` với `when: manual`, chạy trên runner GitLab (không phải máy local — disk local không đủ 11 GB):

1. `git clone` full artifact repo
2. Keep-set = file được thêm/sửa trong `git log --since="${ARTIFACT_RETENTION_DAYS} days"` `--diff-filter=AM --name-only`
3. Xoá mọi thứ ngoài keep-set, kèm rác: `node_modules/`, `.idea/`, `.DS_Store`, `all_files.txt`, `changed_files.txt`, `files_to_remove.txt`
4. Ghi manifest baseline `manifests/<today>_baseline.txt` chứa đúng keep-set → tập này sống thêm `RETENTION_DAYS` kể từ ngày reset
5. Orphan commit + force push
6. In size trước/sau

Sau force-push, object cũ thành unreachable nhưng gitlab.com chỉ thu hồi dung lượng khi housekeeping (`git gc`) chạy. Nếu quota không tụt trong 24h: fallback là xoá project và tạo lại đúng tên/path — instant và chắc chắn, chỉ cần set lại quyền cho `$GIT_ACCESS_TOKEN`.

### 4.5 Guard chunk-load-error (`packages/assets`)

Một module, import ở entry. Listener global cho `unhandledrejection` + `error`, match message của Vite:

- `Failed to fetch dynamically imported module`
- `error loading dynamically imported module`
- `Importing a module script failed`

Khi match: đặt sentinel `sessionStorage['chunk-reload-at'] = Date.now()` rồi `location.reload()`. Nếu sentinel tồn tại và cách đây dưới 60s thì **không** reload nữa — tránh loop vô hạn khi lỗi không phải do chunk stale.

Đây là thứ khiến window ngắn hơn 30 ngày an toàn: tab cũ nhận một lần auto-reload thay vì màn hình trắng.

### 4.6 `deploy-react:production`

Chỉ đổi `git clone` → `git clone --depth 1`. Logic `cp -rf` giữ nguyên. Sau khi dọn, số file giảm ~90% → deploy Hosting nhanh hơn nhiều.

## 5. Kiểm chứng

| Bước | Cách verify |
|---|---|
| `artifact-prune.sh` | Test bash trên fixture dir: manifest trong hạn / hết hạn / file mồ côi / rào an toàn kích hoạt. Assert đúng tập giữ và tập xoá |
| CI yaml | `glab ci lint` hoặc GitLab CI Lint API |
| Job reset | Chạy `ARTIFACT_PRUNE_DRY_RUN=1` trước, đọc số file + bytes, xác nhận rồi mới chạy thật |
| Guard frontend | Unit test: dispatch `unhandledrejection` giả, assert reload được gọi lần đầu và bị chặn lần hai |
| End-to-end | Sau deploy đầu tiên có prune: mở app, hard-navigate qua các route lazy, kiểm tra Network không có 200-HTML cho `.js` |

## 6. Rủi ro

| Rủi ro | Mức | Xử |
|---|---|---|
| Xoá nhầm chunk còn dùng | Cao | Manifest của build hiện tại luôn trong keep-set + rào abort + dry-run trước |
| Tab user cũ hơn 14 ngày | Trung bình | Guard §4.5 auto-reload |
| Force-push đè nhau khi 2 pipeline song song | Trung bình | `resource_group: artifact-push` |
| GitLab không thu hồi quota sau force-push | Trung bình | Chờ housekeeping 24h; fallback xoá & tạo lại project |
| Reset job xoá nhầm ở lần chạy đầu | Cao | `when: manual` + dry-run bắt buộc + repo cũ vẫn còn nguyên trên GitLab cho tới khi housekeeping prune |

## 7. Rollback

- Prune script hỏng → xoá bước gọi script khỏi job, deploy quay lại hành vi additive cũ.
- Force-push sai → trước khi reset, tag mốc hiện tại (`git tag pre-prune-2026-08-05 && git push --tags`) để object cũ còn reachable, khôi phục được cho tới khi tag bị xoá.

  Lưu ý thứ tự: tag này giữ toàn bộ 7.5 GB ở trạng thái reachable, nên **quota sẽ không tụt chừng nào tag còn tồn tại**. Quy trình: tag → reset → chạy vài deploy trong 2-3 ngày để chắc chắn → `git push --delete origin pre-prune-2026-08-05` → chờ housekeeping. Không xoá tag ngay sau reset, và cũng đừng chờ quota tụt trước khi xoá tag.
- Guard frontend → thuần additive, gỡ import là xong.
