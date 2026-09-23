xem xét tính năng auto pilot trên app Booster SEO này đánh giá và lên plan làm cho SEO Suite app của mình, b có link tới claude code không?

Used Claude in Chrome (11 actions)

Mình không có kết nối tới Claude Code. Phiên này chạy trong Chrome side panel, không liên kết với repo hay máy của bạn, nên mình không đọc được source code của SEO Suite. Nếu bạn muốn Claude Code làm luôn, bạn copy plan bên dưới vào Claude Code đang mở trong repo SEO Suite, hoặc mở task này trong Claude desktop app và chọn liên kết với máy tính.

Mình đã xem trang AutoPilot của Booster SEO và mở thử vài trang của Avada SEO Suite (Search optimization, Meta tags) để so sánh. Mình không bật hay tắt cài đặt nào.

Booster SEO AutoPilot có gì

Mọi thứ nằm trên một trang, mỗi mục có một nút bật hoặc chọn chế độ:

Mục Tuỳ chọn Gói
Image Alt Text Off / AI / Template mặc định / Template tuỳ chỉnh Free
Meta Title, Meta Description Như trên, thêm "Shopify defaults" Free
Protect manually edited fields Mặc định bật; sản phẩm sửa tay có icon khoá ở trang audit Free
Target Keywords Lấy tên sản phẩm làm keyword Trả phí
Broken Links Tự redirect về trang chủ hoặc một đường dẫn tự chọn Trả phí
Image Compression, Image Rename Tự làm khi có ảnh mới Premium
URL Optimization Đổi URL khi tên sản phẩm đổi Premium

Cách chạy: sản phẩm mới hoặc vừa sửa được tối ưu tự động. Sản phẩm có sẵn thì merchant phải bấm "Run Optimizer" ở dashboard.

Đánh giá

Điểm mạnh:

Dễ hiểu: một trang, bật lên là xong.
Mỗi mục có nhiều chế độ (AI, template, Shopify).
Bảo vệ nội dung sửa tay, điểm này tạo được niềm tin.
Chia tính năng theo gói rất rõ, dễ bán gói cao hơn.

Điểm yếu (đây là chỗ mình có thể làm tốt hơn):

Không có xem trước hay chạy thử trước khi áp dụng cho cả cửa hàng.
Mình không thấy lịch sử thay đổi hay nút hoàn tác.
Không giới hạn được phạm vi (theo collection, tag hay vendor). Cũng không rõ có áp dụng cho Collection, Blog, Page hay chỉ cho Product.
Không thấy hỗ trợ nhiều ngôn ngữ, cũng không thấy trước chi phí AI credit.
Đổi URL mà không nói rõ có tạo redirect 301 hay không, nên dễ mất traffic.
Redirect link hỏng về trang chủ là cách xử lý SEO kém.
Người dùng dễ nhầm: sản phẩm mới chạy tự động, còn sản phẩm cũ phải bấm tay.

Avada SEO Suite hiện có: Meta tags có template riêng cho Product, Collection và Blog, có lựa chọn chỉ áp dụng cho sản phẩm còn trống, có custom rules, có AI (5 credits) và chọn được ngôn ngữ. Ngoài ra có Image alt, Broken links, Internal links, Structured data, Indexing và MCP. Nói cách khác, phần lõi đã có sẵn. Cái còn thiếu là một trang AutoPilot gom các module lại và tự chạy khi có sự kiện, ví dụ khi thêm hoặc sửa sản phẩm. Mình chưa kiểm tra được template hiện tại được áp dụng lúc hiển thị trang (render trong theme) hay được ghi thẳng vào dữ liệu Shopify. Điểm này ảnh hưởng đến kiến trúc, bạn cần xác nhận trong code.

Plan AutoPilot cho SEO Suite

Phase 1: MVP, khoảng 2–3 sprint

Trang AutoPilot: mỗi module (Meta title, Meta description, Image alt) có các chế độ Off / AI / Template / Shopify default. Chọn được phạm vi Product / Collection / Blog / Page, và chọn "Chỉ điền chỗ trống" hoặc "Ghi đè".
Chạy tự động theo sự kiện:
Nghe webhook products/create, products/update và collections/*, đưa vào hàng đợi, rồi ghi seo.title, seo.description và alt ảnh.
Tránh vòng lặp: bản cập nhật do chính app ghi cũng sẽ bắn webhook, nên lưu một hash của giá trị app đã ghi vào metafield để bỏ qua.
Bảo vệ nội dung sửa tay: nếu giá trị hiện tại khác hash app đã ghi thì coi là merchant sửa tay, khoá lại và hiện icon khoá ở SEO Audit.
Chạy cho sản phẩm có sẵn: ngay khi bật AutoPilot, hiện "Sẽ cập nhật X sản phẩm, tốn khoảng Y credits" rồi chạy bằng Bulk Operations. Không bắt merchant tự bấm như Booster.

Phase 2: Tạo khác biệt

Xem trước: hiện kết quả mẫu cho khoảng 5–10 sản phẩm trước khi bật.
Nhật ký thay đổi: lưu giá trị trước và sau, có nút hoàn tác từng sản phẩm hoặc cả lượt chạy.
Lọc phạm vi theo collection, tag, vendor hoặc product type.
Giới hạn AI credit theo tháng, gửi cảnh báo khi sắp hết.
Nhiều ngôn ngữ: tự tạo meta cho từng locale qua Translations API, tận dụng bộ chọn ngôn ngữ đã có.

Phase 3: Tính năng nâng cao, dùng để chia gói trả phí

Tự redirect link hỏng một cách thông minh: gợi ý URL gần nhất (cùng handle, cùng collection) thay vì đưa về trang chủ, kết nối với module Broken links sẵn có.
Tự tối ưu URL: đổi handle và luôn tạo urlRedirectCreate 301.
Đổi tên và nén ảnh, gắn với module Performance.
Target keyword kết hợp dữ liệu Search Console.
Báo cáo: email tổng kết hằng tuần kiểu "AutoPilot đã tối ưu N trang", và cho agent bật/tắt hay cấu hình AutoPilot qua MCP.

Rủi ro kỹ thuật cần lưu ý:

Giới hạn tốc độ và chi phí truy vấn GraphQL của Shopify khi cửa hàng có nhiều sản phẩm.
Đảm bảo xử lý mỗi webhook một lần duy nhất (idempotency).
Đổi tên ảnh có thể phải upload lại ảnh, tuỳ phiên bản API.
Cần đồng bộ với custom rules hiện có, và quy định rõ cái nào được ưu tiên.

Bạn có muốn mình viết plan này thành một tài liệu spec (gồm user story và tiêu chí nghiệm thu) để chia sẻ với team hoặc đưa thẳng cho Claude Code không?

---

## Đánh giá vs code — 2026-09-23 (seo master `0547925a9cb`)

**Kết luận:** research đúng về UX, sai về kiến trúc lõi. ~70% tính năng Phase 1–3 đã có trong code.
AutoPilot nên là **control plane gom module có sẵn**, không phải engine mới.

### Research nói vs code thật

| Hạng mục | Code thật | Evidence |
|---|---|---|
| Meta template tự áp cho sp mới | **Có sẵn, render-time Liquid** — không ghi Shopify, không cần webhook, không loop | `helpers/afterInstall/updateAssets.js:310-378` |
| Bảo vệ meta sửa tay | Có: `ovrProductIds/…` từ `global.title_tag` không rỗng | `services/bulkMetaService.js:44-76`, `updateAssets.js:317-346` |
| Bảo vệ alt sửa tay | Một phần: `alt_ovr=MISSING` bỏ qua mọi ảnh đã có alt, không phân biệt app/merchant | `helpers/utils/isAltOptimized.js:49-61` |
| Alt + nén ảnh cho sp mới | Code có, **trigger nghi chết**: subscription `products/create` gỡ ở `6663e0891bf` (2025-03-23), `imageHook.js:8` còn chủ động xoá; code chỉ đăng ký `BULK_OPERATIONS_FINISH`, `APP_SUBSCRIPTIONS_UPDATE` | `webhook/bulkOperationHook.js:132`, `services/shopifyService.js:176,259` |
| products/update, collections/*, articles/* | Không có handler sống | `imageHook.js:8` (chỉ xoá) |
| Preview / lịch sử / undo | Có trong bulk-fix: generate → review → apply → revert, snapshot before/after | `services/bulkAuditFix/applier.js:106-150`, `routes/api.js:488-496` |
| Bulk cho sp có sẵn | Có, **cap 50 sp/job** | `bulkAuditFix/resolver.js:22-47` |
| Ước tính credit | Có (`~{credits}`); low-credit alert: **không** | `bulkAuditFix/estimator.js:1-28` |
| Lọc phạm vi | product_type/vendor/status có; collection/tag cho product: **không**; only-empty cho bulk: **không** | `helpers/graphQLConvert.js:152-174` |
| Đa ngôn ngữ | Có `translationsRegister` | `services/shopifyGraphQlService.js:3701-3732` |
| Đổi URL + 301 | Có khi app đổi handle; merchant tự đổi handle: không bắt | `repositories/analysisRepository.js:1071-1122` |
| Redirect 404 tự động | Có (weekly Pro+, daily Enterprise); target = 1 URL cố định/loại, default `/` | `pubsub/subscribeHandleWeeklyBrokenLinks.js:110,250-348`, `helpers/getTarget.js:7-32` |
| Đổi tên ảnh | Có, qua `fileUpdate` — **không cần re-upload** (rủi ro research nêu không áp dụng) | `services/shopifyGraphQlService.js:1797-1832` |
| Target keyword | Có `focus_keyword` + GSC insights | `repositories/analysisRepository.js:89`, `helpers/gscInsights.js` |
| MCP bật/tắt AutoPilot | 6 write tool, không có tool autopilot. **Sidekick không được thêm write** (luật Shopify) | `services/mcp/writeTools.js`, `modules/sidekick/sidekick.module.js:15-24` |
| Email "đã tối ưu N trang" | Không; chỉ có weekly 404 report | `cron/publicHandleWeeklyBrokenLinksReport.js` |
| Trang AutoPilot | **Không có** — nhưng "Autopilot optimization" đã quảng cáo trong bảng gói | `assets/src/components/PlanFeatures/PlanFeatures.json:137-140` |

### Research sai / thiếu
1. Phase 1 "webhook → ghi `seo.title` + hash metafield chống loop" sai cho template mode — template đã render động. Chỉ AI mode cần ghi từng sp.
2. Trigger `products/create` là của Shopify, self-write của app không bắn lại create → không cần hash chống loop ở v1. Chỉ cần khi thêm `products/update`.
3. Bỏ sót chi phí `products/update`: bắn theo mọi đổi giá/tồn kho. Nếu dùng phải có `filter` / `include_fields` ở webhook declarative.
4. Rủi ro "đổi tên ảnh phải re-upload" không đúng với code hiện tại.
5. "Target keyword = tên sp" kém hơn cái đã có (focus_keyword + GSC) — bỏ.

### Việc chưa verify
- `products/create` có còn tới prod không (webhook declarative sống trong `shopify.app.toml` không commit). `gcloud logging read` fail: auth hết hạn → cần `gcloud auth login`.

### Gói & tần suất auto (verify 2026-09-23)

Pro vs Enterprise (marketing `PlanFeatures.json`): Enterprise = Pro + Rocket speed (vs Turbo), 10.000 credit (vs 1.000), Advanced structured data, 1-1 consult, support 24/7. Không khác biệt tính năng auto nào được quảng cáo; "Autopilot optimization" chỉ ghi ở Pro.

| Auto | Tần suất | Gói | Thực tế |
|---|---|---|---|
| Meta template | realtime (render Liquid) | mọi gói; rules = Pro+ | chạy |
| Alt + nén ảnh sp mới | realtime `products/create` | Free giới hạn `LIMIT_PRODUCT_IMAGES`, Pro+ unlimited | nghi chết (subscription gỡ 2025-03) |
| Re-optimize ảnh định kỳ `autoSchedule.autoOptimize` | week / month | — | **chết**: `handleAutoOptimize` default export không cron nào gọi; UI `SpeedUp/Settings/Settings.js:101` `return null` |
| Redirect 404 | weekly T2 00:00 UTC / daily 00:00 UTC | weekly Pro+, daily Enterprise | **chỉ shop có `permanentlyRedirect.isDevZoneEnabled=true`** — bật từ DevZone nội bộ (`DevZone/containers/404Container.js:123`), default false → merchant không tự bật được |
| Email báo 404 | weekly T2 00:00 UTC | opt-in | chạy |
