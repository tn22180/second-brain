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
