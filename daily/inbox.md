# inbox

Jot anything here — brain folds it into the daily note on next sync.

The daily job appends memory-fact **candidates** below (unchecked). Tick `[x]` and
move real ones into `~/.claude` memory yourself; delete the rest.

### memory candidates 2026-07-15
- [ ] Khi agent vào project mới, cần doc onboarding "app làm gì / đọc gì đầu tiên" sẵn trong repo — pattern làm việc muốn áp dụng cho mọi Avada app
- [ ] second-brain repo = `git@github.com:tn22180/second-brain.git`

### memory candidates 2026-07-15
- [ ] Khi agent vào project mới, cần doc onboarding "app làm gì / đọc gì đầu tiên" sẵn trong repo — pattern muốn áp cho mọi Avada app

### memory candidates 2026-07-15
- [ ] seo image width trong url bắt buộc = 600
- [ ] Project ngoài nằm trong `projects/Falcon/` của second-brain, gitignore, chỉ chạy local

### memory candidates 2026-07-16
- [ ] webhookLogs (seo) chỉ để dedup webhook nội bộ, không expose front-end — TTL 30 ngày an toàn
- [ ] `shopify.app.*.toml` mỗi dev trỏ 1 dev store riêng → không có canonical pair, đừng chuẩn hoá
- [ ] Worker fleet tự spill sang GCF khi worker unhealthy → không cần external liveness probe riêng
- [ ] Fleet worker test box = 192.168.2.184, join qua Tailscale, staging4
- [ ] Prod không set `APP_IS_LOCAL` (mặc định false)

### memory candidates 2026-07-17
- [ ] Docs-gate design law — citation anchor về repo root, cấm suffix matching, gate fail closed khi không xác định được branch hoặc scan rỗng
- [ ] Docs/skills gen order — lớp chung trước, per-domain sau (đã đóng thành skill `docs-from-code` + `docs-gate`, port sang blog)
- [ ] Firestore `409 index already exists` khi redeploy index = no-op, không phải lỗi
- [ ] Máy .50 và .184 nối qua Tailscale bằng IP, không dùng domain
- [ ] `internalGen2` env chỉ set từ CI, không có ở local

### memory candidates 2026-07-18
- [ ] Worker fleet tự spill sang GCF khi worker unhealthy → không cần external liveness probe riêng (mâu thuẫn open loop liveness-53b)

### memory candidates 2026-07-19
- [ ] Worker fleet tự spill sang GCF khi worker unhealthy → không cần external liveness probe riêng (mâu thuẫn open loop liveness-53b — cần resolve)
- [ ] Docs-gate design law — citation anchor về repo root, cấm suffix matching, gate fail closed khi branch không xác định hoặc scan rỗng

### memory candidates 2026-07-20
- [ ] liveness-53b mâu thuẫn với "worker fleet tự spill sang GCF khi unhealthy" — candidate lặp 3 ngày (07-16/18/19), cần resolve dứt: nếu spill đủ thì đóng open loop liveness-53b
- [ ] docs-from-code pattern giờ chuẩn hóa qua 3 app (BLOG → APC → AEO): CLAUDE.md common layer trước, per-domain skills sau, + firestore/security generic từ joy, + docs gate
- [ ] firestore.rules + firestore.indexes hợp lệ làm gate anchor roots
