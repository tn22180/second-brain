# inbox

Jot anything here — brain folds it into the daily note on next sync.

The daily job appends memory-fact **candidates** below (unchecked). Tick `[x]` and
move real ones into `~/.claude` memory yourself; delete the rest.

### promoted → memory (2026-07-21)
Verified against seo@master + written to `~/.claude/.../memory/`. Loaded automatically now.
Lines below keep the ORIGINAL candidate wording so re-emits dedup against them (→ slug = memory file).
- [x] webhookLogs (seo) chỉ để dedup webhook nội bộ, không expose front-end — TTL 30 ngày an toàn → `seo-webhooklogs-ttl`
- [x] Prod không set `APP_IS_LOCAL` (mặc định false) → `seo-app-is-local`
- [x] `shopify.app.*.toml` mỗi dev trỏ 1 dev store riêng → không có canonical pair, đừng chuẩn hoá → `seo-shopify-toml-per-dev`
- [x] Fleet worker test box = 192.168.2.184, join qua Tailscale, staging4 → `seo-fleet-tailscale-staging4`
- [x] Máy .50 và .184 nối qua Tailscale bằng IP, không dùng domain → `seo-fleet-tailscale-staging4`
- [x] Firestore `409 index already exists` khi redeploy index = no-op, không phải lỗi → `firestore-409-index-noop`
- [x] seo image width trong url bắt buộc = 600 → `seo-image-600-defaults` (REFRAME: 600 là default gen, không bắt buộc url)
- [x] `internalGen2` env chỉ set từ CI, không có ở local → `seo-env-avada-seo-local-override` (REFRAME: internalGen2 = function; .env.avada-seo là local-override)

### OPEN — cần Tony quyết (2026-07-21 hold)
- [ ] Worker fleet tự spill sang GCF khi worker unhealthy → khỏi external liveness probe. **Mâu thuẫn open-loop `liveness-53b`.** Chốt: nếu spill đủ thay probe → đóng liveness-53b + promote fact. Chưa chốt → để nguyên. (candidate lặp 07-16/18/19/20) #hold

### TEST read-loop (2026-07-21) — xoá sau khi verify
- [ ] (×2) TEST read-loop hoạt động — nếu session mới thấy dòng này tức hook OK

### memory candidates 2026-07-21
- [ ] (×1) docs_gate phải chỉ chạy trên MR target master — trên staging branch nó deploy prod (bug đã fix, image-optimizer)
- [ ] (×1) /arena AI-token leaderboard (nguyentuan) đã deploy prod nhưng backend chưa feed data → rỗng
- [ ] (×1) seo GSD Card job chạy trong container riêng ở dev_zone để dễ theo dõi; pilot trước khi chốt

### memory candidates 2026-07-22
- [ ] (×1) SEO prod-error alerts giờ route qua shared lib `@avada/prod-error-alert`; bespoke `prodErrorAlertService`/`errorAlertRepository` đã xoá, sink bắt cả `cloud_run_job` → `seo-prod-error-slack-pipeline` (update: root fix đã ship 07-22).
- [ ] (×1) OpenRouter là integration layer cho các app tích hợp AI — cost + token + model + API key đều lấy được từ API của nó; report tách menu riêng sau AI Credit.
- [ ] (×1) isActiveInstall pilot đã rollout toàn bộ ~100k shop (chỉ set status), scan nốt 6,261 shop rồi chuẩn bị purge.

### memory candidates 2026-07-23
- [ ] (×3) Shared prod-error lib publish public npm tên `avada-prod-error-alert` (unscoped, KHÔNG `@avada/prod-error-alert`) — sửa lại ref trong `seo-prod-error-slack-pipeline`
- [ ] (×3) Log sink prod-error đã tạo cho tất cả project prod, không chỉ seo
- [ ] (×3) CI các app dùng immutable install → mọi MR thêm dep phải commit `yarn.lock` kèm, nếu không fail
- [ ] (×3) MR cho repo `blogs` phải base từ `master`

### memory candidates 2026-07-24
- [ ] (×1) Job stuck (self-chaining Pub/Sub fan-out) resume được bằng skill `resume-stuck-job` — CS tự chạy, recipe registry theo app

### memory candidates 2026-07-27
- [ ] (×1) Mọi app Avada gọi OpenRouter phải set `X-Title` + `HTTP-Referer` (referral link), mẫu ở blogs `packages/functions/src/config/openRouter.js` — thiếu thì dashboard OpenRouter hiện `unknown`
- [ ] (×1) OpenRouter prompt caching đã bật cho AI feature ở SEO (auditAgent, meta/FAQ), BLOG (blog gen, genClaude), APC — cache prefix, không phải full prompt
- [ ] (×1) Lỗi `Stream isn't writeable and enableOfflineQueue options is false` = ioredis reconnect window, không phải Redis quá tải; cùng họ với `seo-redis-command-timeout-noise`
- [ ] (×1) Tailscale auth key phải do admin tenant tạo — dev không self-serve được, chặn setup fleet trước live prod
- [ ] (×1) Billing/credit report auto (6h/ngày) im lặng chết khi gcloud auth hết hạn — không có alert, phải login lại + chạy bù thủ công

### memory candidates 2026-07-28
- [ ] (×1) SEO checklist read API cho CS tooling gọi trực tiếp, không qua app proxy — auth bằng token trong env test
- [ ] (×1) Contact us CTA trong checklist chỉ hiện trên store có `avada` (internal dev store) — store dev thường không thấy nút
- [ ] (×1) Lighthouse scan skip được khi mọi issue lighthouse của shop đã nằm trong exclude/`shop.issueFixed` — rẻ hơn nâng timeout `lightHouseService.js`
- [ ] (×1) Permission entry trong settings.json là prefix pattern; entry chứa query/date/path cụ thể là dead weight, phải generalize
- [ ] (×1) Git identity Avada = `tuannv@avada.email`, tách khỏi Claude account `seomduc@gmail.com`

### memory candidates 2026-07-29
- [ ] (×1) Point sprint FAL tính từ cột Waiting to test → Done; DungTT (tester) tính theo points tester, không phải points dev
- [ ] (×1) Board FAL có 2 techlead (t + Lâm) — mỗi task chỉ 1 trong 2 assign, đừng gom cả hai khi lọc "task của mình"
- [ ] (×1) Traffic index avada-seo không break down được theo từng index — chỉ có số tổng
- [ ] (×1) jest ở repo seo phải ignore `.claude/worktrees`, không thì scan test của worktree cũ
- [ ] (×1) E2 (chèn internal reasoning vào product description) thuộc app APC, không phải SEO

### memory candidates 2026-07-30
- [ ] (×1) Docs-first workflow là chuẩn mới cho repo Avada — task mới/fix bug phải đọc CLAUDE.md + feature doc trước khi sửa, update doc trong cùng session; không auto-gen lúc deploy
- [ ] (×1) `docs_gate` chỉ chạy trên MR target master — chạy trên staging branch nó deploy prod (đã fix ở image-optimizer)
- [ ] (×1) SEO không còn ghi Firestore collection `activity` theo lịch — dead code đã xoá, đừng đọc collection đó làm nguồn dữ liệu
- [ ] (×1) prod-error-autofix có second-brain riêng ở `tools/prod-error-autofix/brain/` (incidents + index) — context tách khỏi second-brain chính
- [ ] (×1) Google Sheet point sprint chỉ edit được bằng service account chỉ định; script `tools/jira-point-sync/sync-sheet.mjs`

### memory candidates 2026-07-31
- [ ] (×1) gcloud user login hết hạn hằng ngày → dùng SA `tony-cli@avada-seo.iam.gserviceaccount.com` cho mọi project, env file lưu trong second-brain; cần grant role đọc log riêng từng project
- [ ] (×1) Không tồn tại MCP server chính chủ cho gcloud — mọi thao tác GCP vẫn qua `bq`/`gcloud` CLI
- [ ] (×1) prod-error-autofix report bắn Telegram DM cá nhân (không nhóm/Slack); concurrency cap 2 fix/lượt, history issue đã fix để dedup
- [ ] (×1) Skill `tony-wf` workflow chuẩn: /init → brainstorm → plan → TaskCreate → subagent theo chuyên môn → test loop cap 5 vòng fail thì dừng
- [ ] (×1) Blogs Slack paging phần lớn là expected-error noise (redis ECONNRESET tự lành, 4xx per-shop, revoked token, 404 asset probe) — phân loại trước khi coi là bug

### memory candidates 2026-08-03
- [ ] (×1) `node_modules` bị commit trong `packages/assets` (seo) làm CI deploy fail `YN0001 ENOTDIR` khi Yarn Berry persist cache — check gitignore trước khi đổ lỗi cache CI
- [ ] (×1) `tony-wf` bước `/init` tốn % context đáng kể; workflow chuẩn giờ có planning trước mỗi task + security check trên diff sau mỗi task
- [ ] (×1) `/loop` trong `tony-wf` = theo dõi tiến độ tất cả task, không phải cơ chế retry task

### memory candidates 2026-08-04
- [ ] (×1) Theme app extension script limit 64 KB — `optimize-product-images` 75 KB chặn `shopify app dev`, phải trim/split trước khi dev được
- [ ] (×1) WebMCP enabled state đi qua app metafield → snippet; `settings.webMcp.enabled` ở backend không tự tới theme
- [ ] (×1) SEO Agentic AI = 1 menu gộp (AI Agent Readiness + LLMs page), WebMCP page cũ đã fold vào, không còn card ở landing Performance
- [ ] (×1) prod-error-autofix đã đóng gói để cài sang app khác, quy trình có security check trên diff
- [ ] (×1) OpenClaw ngốn RAM đáng kể → dự tính host máy riêng, không chạy chung máy dev

### memory candidates 2026-08-05
- [ ] (×1) Nhánh feature ở seo có thể có nhiều người cùng làm UI — check ai đang động vào nhánh trước khi push UI work, không thì phải revert
- [ ] (×1) `aggregateAiReferralsScheduler` (llm-ai-search-seo) cần memory cao hơn default — đã nâng 2026-08-05
- [ ] (×1) Setup Claude Code + toàn bộ project trên máy remote qua SSH tràn memory — cần host RAM lớn, không dùng máy dev phụ

### memory candidates 2026-08-06
- [ ] (×1) Shopify article metafield id không bền — resolve bằng namespace+key, đừng lưu id (bug `blogs` 2026-08-06, fix `244772f18`)
- [ ] (×1) Tailscale fleet chạy trên tailnet tài khoản cá nhân (không phải tenant `avadagroup.com`) — dev tự tạo auth key được, ghi đè candidate 07-27 "auth key phải do admin tạo"
- [ ] (×1) Box fleet chỉ nối được qua Tailscale IP `100.x`, SSH LAN `192.168.2.x` fail — dùng tailnet IP cho mọi thao tác box
- [ ] (×1) `dispatchWork` (seo worker migration) route qua 3 gates rồi fallback Pub/Sub — không phải Pub/Sub-first
- [ ] (×1) docs-gate đặt ở step 1 pipeline, fail = chặn toàn bộ deploy step sau

### memory candidates 2026-08-07
- [ ] (×1) Prod worker fleet = 3 box, con cũ giữ central/leader + worker1, box1/box2 là follower — scale-out chứ không cutover
- [ ] (×1) fleet-control dashboard chạy trên leader dưới systemd unit `seo-fleet-control`, port 3900, chỉ truy cập qua Tailscale IP
- [ ] (×1) Slack Enterprise upgrade notification dùng `@channel` (không tag tên), kèm Email + shopifyDomain + Crisp link dạng anchor
- [ ] (×1) Thêm worker prod bằng image-clone (Strategy A) rẻ hơn build từ đầu; Gen2 re-image tách sang phase riêng

### memory candidates 2026-08-10
- [ ] (×1) Skill API cho agent không hard-code nữa — đưa integration key, agent tự fetch docs API mới nhất; skill tách riêng theo app
- [ ] (×1) `docs-gate` có check mới: routes vs OpenAPI spec lệch → fail MR (đã port AEO + APC)
- [ ] (×1) AEO `yarn dev` không truy cập được backend khi `yarn emulators` đang chạy
- [ ] (×1) Clone `avada-seo-react-app-artifacts` qua `gitlab-ci-token` cần access token tạo từ chính project artifacts
- [ ] (×1) Prod worker fleet đã cutover gen1 → gen2; fleet health fail thì fallback cloud-gen2 (canary)

### memory candidates 2026-08-11
- [ ] (×1) Fleet job payload không chứa `accessToken`/`accessTokenHash`/shop email — central strip, worker re-hydrate từ Firestore (seo, commit `df7b7c2dd4`)
- [ ] (×1) Đổi tên Pub/Sub topic ở seo phải update `detect-changed-functions.js`, nếu không CI bỏ sót function cần deploy
- [ ] (×1) Deploy worker phải loop toàn bộ box trong inventory, không hard-code box1/box2
- [ ] (×1) Prod worker fleet đã gỡ Gen1, chỉ còn Gen2 sau 2026-08-11

### memory candidates 2026-08-12
- [ ] (×1) `grantedFeatures[]` trên shop doc = cơ chế CS unlock từng feature (không nâng plan); grant phải lift cả Pro badge + upgrade modal, không chỉ gate backend
- [ ] (×1) Grant feature ở dev_zone chỉ áp cho shop đang truy cập — không có input shopifyDomain/id, cố ý để giảm rủi ro CS grant nhầm store
- [ ] (×1) Shopify BulkOperation COMPLETED ≠ job app done; `shop.doneOptimize` là cờ độc lập phải reconcile tay khi job stuck
- [ ] (×1) Job history fleet từng lưu accessTokenHash + shop email → đã clear, chỉ giữ counter; đừng log lại PII/secret vào history
- [ ] (×1) Skill API cho SEO nay không carry copy docs — agent đọc repo/fetch bằng integration key, cùng pattern AEO + APC (commit `1b3cbb0eee`)

### memory candidates 2026-08-13
- [ ] (×1) Tailscale ACL v2 ssh rule không có field `dst`/`sshUser` — sai schema fail cả policy; dùng `tag:deploy` → `tag:worker-box` + accept rule cho SSH non-interactive
- [ ] (×1) `useFeatureGate(key)` + feature registry (`hasFeature()`, legacy flag) là chuẩn mới cho mọi pro gate ở seo — grant CS đi qua đây, không gate rời rạc
- [ ] (×1) Dev Zone token gate server-side chặn luôn save của chính card cấp token → chicken-and-egg; đã revert, action unrestricted tạm thời
- [ ] (×1) Minify là feature đang sunset ở SEO — banner warning trong card minification chỉ hiện với shop còn bật, doc sunset đã vào `minification.mdx` của docs.avada.io
- [ ] (×1) fleet-control chuyển từ local sang hosting + Google auth + domain Cloudflare để cả team view; bullboard giữ làm shared-infra khi retire old-stack

### memory candidates 2026-08-14
- [ ] (×1) `cloudflared` service ở central đọc config từ `/etc/cloudflared`, không phải `~/.cloudflared` — `service install` fail "Cannot determine default configuration path" nếu để ở home
- [ ] (×1) Cloudflare Access không thay thế basic-auth tầng app — pass Google IdP xong vẫn 401 tới khi xoá `WORKER_DASHBOARD_PASSWORD` khỏi `/etc/seo-fleet-control.env`
- [ ] (×1) Redis fleet nghe port **6380** (container `seo-redis`), không phải 6379 — `redis-cli` mặc định fail "Connection refused"
- [ ] (×1) Banner sunset ở seo phải render trước feature gate, không thì shop free không thấy thông báo retire (bug minify 2026-08-14)
- [ ] (×1) Commit "mất" ở seo hay nằm trên branch của worktree — check `git worktree list` trước khi kết luận master mất code

### memory candidates 2026-08-17
- [ ] (×1) Ollama Cloud không hỗ trợ prompt caching trên bất kỳ model nào và không có Gemini — khác OpenRouter, phải tính lại cost khi so sánh model gen content
- [ ] (×1) Chi phí OpenRouter key SEO = $342.96/tháng (filter 2026-08) — baseline khi cân nhắc đổi provider
- [ ] (×1) seo alt-text default model = `gemma-4-26b` (commit `4c3307365c`), thay model cũ sau eval 30 sản phẩm thật
- [ ] (×1) Worker fleet — shop mới nhận test cohort chứ không nhận toàn bộ migrated jobs; deploy worker gắn với tag (commit `1696228c02`, `7fcacc2c34`)
- [ ] (×1) Migrate repo sang git.avada.net phải migrate kèm repo artifacts (`avada-seo-react-app-artifacts`) và set lại CI variables + runner — không tự đi theo

### memory candidates 2026-08-18
- [ ] (×1) Ollama Cloud breaker phải latch in-process song song Redis — Redis chỉ có ở prod, latch Redis-only là no-op ở stg/local
- [ ] (×1) Gọi Ollama không bound timeout thì fallback OpenRouter không bao giờ chạy; đã bỏ retry khi có fallback (seo `00e57a17f1`, `df00e440fb`)
- [ ] (×1) `gemma4:31b` (Ollama Cloud) chậm hơn `gemini-3-flash` đáng kể — tính latency vào quyết định đổi provider, không chỉ cost
- [ ] (×1) seo cutover xong sang git.avada.net 2026-08-18 kèm repo artifacts; gitlab.com là mirror chết
- [ ] (×1) Quota Ollama Cloud có alert Slack ở ngưỡng 50/75/99% (seo `5253a417ae`) — limit thì job đẩy Redis, check lại sau 5h
