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
- [ ] (×1) Shared prod-error lib publish public npm tên `avada-prod-error-alert` (unscoped, KHÔNG `@avada/prod-error-alert`) — sửa lại ref trong `seo-prod-error-slack-pipeline`
- [ ] (×1) Log sink prod-error đã tạo cho tất cả project prod, không chỉ seo
- [ ] (×1) CI các app dùng immutable install → mọi MR thêm dep phải commit `yarn.lock` kèm, nếu không fail
- [ ] (×1) MR cho repo `blogs` phải base từ `master`
