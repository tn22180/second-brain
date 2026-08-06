clone repo này về https://gitlab.com/avada/artifacts/avada-seo-react-app-artifacts.git, đây là repo artifact của app SEO khi deploy lên prod tránh downtime site, tuy nhiên mỗi lần deploy những file cũ được đẩy lên khi xong thì lại không clear file cũ đi làm phình to repo đạt limit không deploy được nữa hãy get về là lên plan xử lý phần này cho tôi
Chú ý: tránh ảnh hưởng version hiện tại và tương lai, tránh downtime site, xử lý an toàn ổn định nhất, có thể là thêm 1 job vào CICD là clear version cũ hơn rồi mới bắt đầu deploy ver mới

---

## Progress

Started: 2026-08-05
Spec: `jobs/artifact-design.md`
Target repo: `projects/Falcon/seo`, branch `feat/artifact-prune` off `origin/master`

Đo được: `static/assets` = 195,468 file / 7.49 GB; 228 chunk name → ~857 bản/chunk; `index-*.js` 56,447 bản.
Retention chọn: `ARTIFACT_RETENTION_DAYS` default **14**.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Branch `feat/artifact-prune` off `origin/master` | inline | ✅ | 0/5 | clean | worktree `seo-wt-artifact-prune` @ a28c174e655e |
| 2 | `scripts/artifact-prune.sh` + rào an toàn + dry-run | general-purpose / sonnet | ✅ | 0/5 | clean | 24/24 case pass |
| 3 | Rewire `push-react-artifacts:production` + rào "no prior manifest" | opus (agent stall) → inline | ✅ | 0/5 | clean | 30/30 script + 14/14 structural |
| 4 | Job `artifact-repo:reset` (`when: manual`) | inline (đổi từ sonnet) | ✅ | 2/5 | clean | 2 bug thật, xem log |
| 5 | `deploy-react:production` → `--depth 1` | inline (đổi từ haiku) | ✅ | 0/5 | clean | 1 dòng, spawn agent tốn hơn tự sửa |
| 6 | Guard chunk-load-error `packages/assets` | general-purpose / sonnet | ✅ | 1/5 | clean | round 1: harness sai, không phải code |

### Log

#### ✅ Task 1: Create branch
- Agent: inline
- Status: ✅ completed
- Test: `git rev-parse --abbrev-ref HEAD` → `feat/artifact-prune`; `git diff origin/master --stat` → 0 dòng
- Rounds used: 0/5
- Security check: clean — không có diff nào để check
- Completed: 2026-08-05

#### 🔄 Task 2: `scripts/artifact-prune.sh`
- Agent: general-purpose (sonnet)
- Status: 🔄 in-progress
- Plan:
  - Goal: chạy script trong bản clone artifact repo → xoá đúng file `static/` không thuộc union manifest trong hạn; abort thay vì xoá khi input đáng ngờ; `ARTIFACT_PRUNE_DRY_RUN=1` chỉ in số liệu
  - Files allowed: `scripts/artifact-prune.sh`, `scripts/__tests__/artifact-prune.test.sh`. Không đụng gì khác
  - Approach: bash thuần + `comm -23` trên hai danh sách đã sort. Loại Node vì job có `before_script: []` → không có `yarn install`, không có `node_modules`
  - Test command: `bash scripts/__tests__/artifact-prune.test.sh` → tất cả case PASS, exit 0
  - Risk: bug ở đây xoá chunk còn dùng trên prod → app vỡ với user đang mở tab. Rào an toàn + dry-run là lớp chặn
  - Rollback: script standalone, chưa được job nào gọi cho tới task 3. Xoá file là xong
- Rounds used: 0/5

#### 🔄 Task 6: Guard chunk-load-error
- Agent: general-purpose (sonnet) — dispatch song song task 2, không giao nhau file nào
- Status: 🔄 in-progress
- Plan:
  - Goal: dynamic-import fail của Vite → auto-reload đúng **một** lần; lần fail thứ hai trong 60s không reload nữa
  - Files allowed: `packages/assets/src/helpers/chunkReloadGuard.js`, `packages/assets/src/helpers/__tests__/chunkReloadGuard.test.js`, và dòng import trong `src/standalone.js` + `src/embed.js`. Không đụng gì khác
  - Approach: hàm nhận dependency qua tham số (`target`, `storage`, `reload`) → test được bằng fake, không cần jsdom. Loại phương án đọc thẳng `window`/`sessionStorage` vì không unit-test nổi
  - Test command: `/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo/node_modules/.bin/jest --rootDir <worktree> packages/assets/src/helpers` → all pass (worktree không có `node_modules`, dùng binary của repo chính; đã probe OK)
  - Risk: guard sai → reload loop, user không dùng được app. Sentinel + cửa sổ 60s là lớp chặn, phải có test cho đúng case đó
  - Rollback: thuần additive, gỡ 2 dòng import
- Rounds used: 0/5

#### ✅ Task 5: `deploy-react:production` → `--depth 1`
- Agent: inline (routing table ghi cavecrew-builder/haiku; đổi vì chỉ sửa 1 dòng trong file đã đọc sẵn — spawn agent đắt hơn)
- Status: ✅ completed
- Plan:
  - Goal: job deploy clone nông, không kéo history GB
  - Files allowed: `.gitlab-ci.yml`, đúng khối `deploy-react:production`
  - Approach: thêm `--depth 1` + comment nêu lý do. Không đổi URL clone (xem finding bên dưới)
  - Test command: pyyaml parse + assert job chỉ có 1 clone, có `--depth 1`, `only: [tags]` giữ nguyên. `glab ci lint` không dùng được vì glab chưa auth
  - Risk: sai cú pháp yaml → hỏng toàn bộ pipeline. Test parse cả file chặn được
  - Rollback: revert 1 hunk
- Test output: `PASS: deploy-react clone is shallow, job structure intact` / `PASS: full file parses, 60 top-level keys`
- Rounds used: 0/5
- Security check: **clean** — `git diff --stat` = 1 file, +3/-1. Không secret literal (`$GIT_ACCESS_TOKEN` là biến, có sẵn), không dep mới, không file cấm ngoài chính file mục tiêu
- Completed: 2026-08-05

#### ✅ Task 2 kết quả
- Test tự chạy lại: `bash scripts/__tests__/artifact-prune.test.sh` → `== 24 passed, 0 failed ==`, EXIT=0
- Rounds used: 0/5
- Security check: **clean** — 2 file mới, không secret, không dep, không đụng file cấm
- Review notes (nit, không chặn):
  - `validate_pipeline_id` dùng `grep -q "$pipeline_id"` khớp chuỗi con trên đường dẫn manifest → về lý thuyết có thể khớp nhầm. ID pipeline GitLab dài 8-10 chữ số nên xác suất thực tế ~0. Khớp chính xác tên file sẽ chặt hơn
  - `trap ... RETURN` không chạy khi `abort` gọi `exit` → tmpdir rớt lại. Vô hại trong container CI
  - Vòng lặp `rm -f` từng file: steady-state mỗi ngày chỉ vài trăm file nên không sao
  - Đã kiểm chứng `sort`+`comm` không lệch collation: cả hai list đều được sort lại tại chỗ trong cùng process, và test với 4000 tên file thật cho ra đúng số truth ở cả `LC_ALL=C`/`en_US.UTF-8`/`POSIX`
- Completed: 2026-08-05

#### ✅ Task 6 kết quả
- **Round 1 fail — do harness, không phải code.** `jest --rootDir <worktree>` chạy từ ngoài worktree báo `SyntaxError: Cannot use import statement outside a module` cho **cả 4 suite có sẵn từ trước**, tức lệnh test tao đưa trong plan sai chứ không phải guard sai. Nguyên nhân: worktree không có `node_modules`, và `packages/assets/.babelrc` không có `@babel/preset-env` nên plugin phải resolve từ `node_modules` cạnh nó
- Fix: symlink `node_modules` của repo chính vào worktree, chạy jest với cwd trong worktree
- Test tự chạy lại: 10/10 case của `chunkReloadGuard.test.js`; full dir **5 suite / 26 test pass**, không regress suite cũ
- Rounds used: 1/5
- Security check: **clean** — `git diff --stat` = 2 file sửa, +14 dòng; 2 file mới. Không secret, không dep mới, không outbound call, không file cấm
- Sửa thêm khi review: comment ở 2 entry hardcode "14 days" → đổi sang trỏ `ARTIFACT_RETENTION_DAYS` để không stale khi đổi biến
- Review notes (nit, không chặn):
  - default `target = typeof window !== 'undefined' ? window : undefined` vô dụng — nếu rơi vào `undefined` thì `target.addEventListener` ném lỗi khó đọc hơn là để nó ném thẳng
  - sentinel có timestamp **tương lai** (đồng hồ máy nhảy lùi / NTP) làm `now() - lastReloadAt` âm → guard tắt cho tới khi thời gian đuổi kịp. Hiếm, không chặn
- Completed: 2026-08-05

#### 🔄 Task 3: Rewire `push-react-artifacts:production`
- Agent: general-purpose (opus)
- Status: 🔄 in-progress
- **Scope tăng so với spec — phát hiện lúc plan, không nuốt im:** spec §4.2 thiếu một rào. Nếu task 3 lên prod mà job reset (task 4) chưa chạy, deploy đầu tiên ghi manifest của chính nó → keep-set chỉ có build hôm nay → prune xoá sạch 195k file cũ trong một lần. Retention thành 0 ngày, đúng thứ cả thiết kế đang tránh. Thêm rào: **không có manifest nào ngoài manifest của pipeline hiện tại → skip prune, exit 0, in lý do**. Ép reset phải chạy trước, và không bao giờ chặn deploy.
- Plan:
  - Goal: mỗi tag deploy ghi manifest → prune theo keep-set → artifact repo còn đúng 1 commit sau khi push, và deploy vẫn chạy bình thường kể cả khi prune skip
  - Files allowed: `.gitlab-ci.yml` (chỉ khối `push-react-artifacts:production`) + thêm rào vào `scripts/artifact-prune.sh` và case test tương ứng
  - Approach: clone `--depth 1` → ghi manifest **trước** khi `cp` → prune → `git checkout --orphan` + `git push --force`. Orphan+force vì commit xoá file **không** giảm dung lượng git; `git filter-repo` cho cùng kết quả nhưng phải rewrite 800+ commit trên 7.5GB blob
  - Test command: `bash scripts/__tests__/artifact-prune.test.sh` (phải còn xanh + case mới) và assert cấu trúc job bằng pyyaml: có `resource_group`, manifest ghi trước `cp`, có `--force`, giữ nguyên `only: [tags]` và khối `except`
  - Risk: **cao nhất trong job này**. Sai thứ tự manifest/cp → retention vô nghĩa. Sai force-push → mất artifact repo. Prune quá tay → chunk còn sống bị xoá → tab user vỡ
  - Rollback: revert hunk `.gitlab-ci.yml` → job quay lại hành vi additive cũ. Repo artifact không mất gì vì reset chưa chạy
- Rounds used: 0/5

#### ✅ Task 3 kết quả
- Agent opus **stall** (watchdog 600s) đúng lúc chuyển sang viết test. Nó đã kịp thêm rào `skip_if_no_prior_manifest_history` vào script và viết xong function case 9/10 nhưng **chưa gọi chúng trong runner** → suite vẫn báo 24. Phần job CI chưa làm. Tao làm nốt inline, không dispatch lại
- Test: `bash scripts/__tests__/artifact-prune.test.sh` → `== 30 passed, 0 failed ==`; 14/14 structural check trên YAML
- Rounds used: 0/5 (stall là lỗi hạ tầng, không phải vòng fix)
- Security check: **clean**
- Completed: 2026-08-05

#### ✅ Task 4 kết quả — 2 bug thật, cả hai đều chặn được trước khi ra prod
- **Round 1 — dating bằng `git log` xoá nhầm file đang chạy live.** Kế hoạch gốc (spec §4.4) lấy keep-set từ `git log --since --diff-filter=AM`. Sai: Vite đặt tên chunk theo hash nội dung, nên chunk không đổi thì **tên không đổi**, `cp -rf` ghi đè byte y hệt, và **git không ghi nhận thay đổi nào**. Một chunk ship liên tục 6 tháng không sửa sẽ có lần sửa git cuối cách đây 6 tháng → bị xếp hết hạn → **xoá mất file build production đang import**. Không phải vỡ tab cũ, mà vỡ site ngay.
  - Chứng minh bằng repo git tổng hợp: git-log-only cho ra delete-list chứa `stable-Ab12.js` là chunk đang live.
  - Fix: keep-set = `git log window` **∪ danh sách file build hiện tại của pipeline** (`$CI_PROJECT_DIR/static`). Kéo theo: job đổi sang `only: [tags]` (cần artifact `static/` từ stage deploy), bỏ `GIT_STRATEGY: none`, thêm `resource_group: artifact-push` dùng chung khoá với job push, và thêm rào abort nếu `keep_build.txt` rỗng.
  - Test tách bạch đúng layout CI (artifact repo vs build mới): 3 file hết hạn bị xoá, chunk live không đổi sống, chunk trong window sống.
  - **Prune hằng ngày KHÔNG dính bug này** — manifest của nó là `find static -type f` trên build mới, liệt kê cả file không đổi, nên mỗi deploy đều làm mới hạn cho toàn bộ file của build hiện tại.
- **Round 2 — 4 step YAML bị parse thành mapping thay vì string.** `--pretty=format:` và `echo "size before: ..."` chứa `": "` (colon + space) trong plain scalar → YAML biến cả step thành dict. Job sẽ hỏng trên GitLab. Đã quote lại; `grep -v '^$'` đổi thành `"^$"` để không đụng single-quote lồng nhau.
  - Assert vĩnh viễn: 0 step nào trong **toàn file** được parse ra mapping, đối chiếu baseline `origin/master` cũng 0.
- Rounds used: 2/5
- Security check: **clean** — verify riêng rằng mọi lệnh phá huỷ (`rm -rf`, `xargs rm`, `-delete`, `git push --force`) đều nằm **sau** `cd artifacts` (step 2), và không có step `cd` nào khác trong job
- Completed: 2026-08-05

---

## COMPLETE — 2026-08-05

6/6 task xong. Tổng round dùng: **3/30**. Security verdict toàn nhánh: **clean**.

Nhánh: `feat/artifact-prune` (worktree `seo-wt-artifact-prune`), base `origin/master` @ `a28c174e655e`. **Chưa commit, chưa push.**

Diff: `.gitlab-ci.yml` +116/−6, `embed.js` +8, `standalone.js` +8, cộng 4 file mới
(`scripts/artifact-prune.sh`, `scripts/__tests__/artifact-prune.test.sh`,
`packages/assets/src/helpers/chunkReloadGuard.js` + test).

### Output verify cuối

```
########## 1. prune script suite ##########
== 30 passed, 0 failed ==

########## 2. frontend jest ##########
Test Suites: 4 passed, 4 total
Tests:       25 passed, 25 total

########## 3. eslint ##########
exit 2 — KHÔNG chạy được trong worktree. Cùng lỗi trên file cũ không hề đụng tới
(`normalizePathname.js` cũng exit 2) → hỏng resolve config, không phải lỗi code mới.
Chưa verify được bằng lint.

########## 4. shellcheck ##########
shellcheck clean
```

Structural check trên `.gitlab-ci.yml`: 14/14 pass, cộng assert 0 step nào bị parse thành mapping.

### Chưa được kiểm chứng (phải biết trước khi bấm nút)

1. **Job reset chưa từng chạy thật.** Logic dating đã test trên repo git tổng hợp; chưa test trên repo artifact thật 11 GB. `ARTIFACT_RESET_DRY_RUN=1` là mặc định — lần bấm đầu chỉ in số liệu.
2. **Runner phải chứa nổi full clone ~11 GB.** Job in `df -h` ngay bước đầu nên sẽ chết ở clone chứ không chết giữa chừng khi đang rewrite.
3. **Force-push qua GitLab redirect chưa xác nhận** — xem finding #2.
4. **CI không chạy jest** nên test frontend mới sẽ không tự chạy — xem finding #5.

### Thứ tự triển khai

1. Rotate npm token ở finding #3.
2. Xác nhận URL repo artifact (finding #2).
3. Merge nhánh này. Prune **tự skip** cho tới khi có manifest baseline, nên deploy thường vẫn chạy bình thường và không xoá gì.
4. Tag deploy → bấm `artifact-repo:reset` với dry-run mặc định → đọc số `keep` / `delete` / size.
5. Số hợp lý thì chạy lại với `ARTIFACT_RESET_DRY_RUN=0`.
6. Chờ housekeeping GitLab thu quota. Không tụt trong ~24h → xoá và tạo lại project cùng path.
7. Từ deploy sau, prune chạy tự động mỗi lần push artifact.

### Findings ngoài scope (ghi nhận, KHÔNG sửa)

1. **Token trong URL clone** — cả hai job nhét `$GIT_ACCESS_TOKEN` vào URL. Git lỗi có thể in URL kèm token vào CI log. Có sẵn từ trước, không phải do thay đổi này. Chuẩn hơn: `credential.helper` hoặc `http.extraHeader`.
2. **URL repo lệch nhau** — brief ghi `gitlab.com/avada/artifacts/avada-seo-react-app-artifacts.git`, CI dùng `gitlab.com/avada/avada-seo-react-app-artifacts.git` (thiếu group `artifacts/`). Project nhiều khả năng đã được move vào subgroup và GitLab đang redirect. Deploy hiện vẫn chạy nên redirect đang hoạt động — nhưng **force-push qua redirect là chỗ đáng xác nhận lại** trước khi bật task 3/4.

3. **🔴 npm auth token plaintext trong `.yarnrc.yml`** — *Tuan quyết định gác lại 2026-08-06, không xử trong đợt này.* Quét thêm: **một token dùng chung 6 repo** (`seo`, `joy`, `blogs`, `avada-core`, `avada-image-optimizer`, `llm-ai-search-seo`), `ai-product-copy` dùng token thứ hai; tất cả đều tracked. Fix khi làm: rotate cả hai, rồi chuyển sang `npmAuthToken: "${NPM_TOKEN}"` — biến `NPM_TOKEN` đã có sẵn trong CI (`.gitlab-ci.yml:20`). File tracked trên `origin/master`:
   ```
   npmScopes:
     avada:
       npmRegistryServer: "https://registry.avada.io"
       npmAuthToken: "<token 44 ký tự, đã commit>"
   ```
   Token cho registry npm nội bộ, nằm trong git history → **đã cháy, phải rotate**. Xoá dòng không thu hồi được gì. Không phải do thay đổi này tạo ra; không sửa trong diff này. Cần kiểm tra các repo Avada khác có cùng pattern không — `.yarnrc.yml` hay được copy giữa các app.

4. **`serviceWorker.register()` là dead code** — `packages/assets/src/serviceWorker.js` đăng ký `/sw.js`, nhưng không có `sw.js` nào trong repo, không có plugin PWA trong `vite.config.js`, và git không track file nào tên đó. Request `/sw.js` trúng catch-all rewrite → trả HTML → đăng ký fail mỗi lần load trang. `firebase.json` cũng đang set `Cache-Control` cho một file không tồn tại. Mặt tốt: không có SW nào cache chunk cũ, nên guard task 6 reload là ăn thật.

5. **`packages/assets` không có test nào chạy trong CI** — `.gitlab-ci.yml` không có job jest. 4 suite có sẵn dưới `src/helpers/__tests__/` chưa từng chạy tự động. Test task 6 thêm vào cũng sẽ không chạy trong CI trừ khi thêm job.

