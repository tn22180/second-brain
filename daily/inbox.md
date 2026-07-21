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
