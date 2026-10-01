# Test S2 — AI Search (AEO) readiness + llms.txt trên 10 store

2026-10-01 · engine: `llm-ai-search-seo` @ `origin/main` · không ghi Firestore/Shopify/GCP, không deploy, không dùng LLM.

## Kết luận

- **Engine chạy thật trên cả 10 store, kể cả 4 store không phải Shopify.** Mấy engine lõi là hàm thuần nhận dữ liệu trả chuỗi. Phần dính Shopify chỉ ở **nguồn dữ liệu** (`getAllShopifyLinks` = Admin GraphQL) và **cách giao file** (theme file `templates/llms.txt.liquid`). Thay hai phần đó bằng adapter sitemap + API public là ra file dùng được. 9/10 store sinh được llms.txt, link mẫu 45/45 trả 200. Paul Smith bị chặn 403.
- **Có 3 bug engine ảnh hưởng prod AEO hiện tại, không riêng non-Shopify:** (1) giá USD bị làm tròn về số nguyên (`$127.20` → `$127`, `$209.99` → `$210`), dính mọi shop USD đang dùng app. (2) `runStructuredDataChecks` cho PASS dù không có dữ liệu khi URL không chứa `/products/`. (3) `classifyReferrer` thiếu `claude.ai`.
- **Bán cái gì:** gói dịch vụ làm hộ "AEO audit + llms.txt có giá/mô tả/policy + bản markdown + sửa schema". Không bán llms.txt trần cho Shopify: Shopify đã phát miễn phí `/llms.txt` dạng "Agent Instructions" trỏ tới UCP/MCP (4/5 store Shopify đang dùng nguyên template này). Template đó **không có catalog**, và đó là khoảng trống mình lấp.

## Cách chạy

- Code: `git archive origin/main packages/functions/src`, bundle bằng esbuild (alias `@functions` → src, `packages: external`, node_modules symlink từ repo). Chỉ stub 4 module chạm hạ tầng: `helpers/api` (makeGraphQlApi), `repositories/aiReferralRepository`, `config/shopify`, `helpers/logger`. Mất khoảng 5 phút để engine chạy được.
- Engine chạy thật (real): `buildLlmTxtContent` + `capLlmsTxtContent`, `scrapeMarkdown` (UA riêng `AvadaSEO-MarkdownScraper/1.0`), `extractSchemaData`, `runStructuredDataChecks` (overrideUrls = 1 product + 1 collection + 1 page), `classifyReferrer`, `AuditScoreService`.
- **Adapter (đoạn mình viết, không phải engine):**
  - sitemap.xml được map sang `linksByType`. Loại link lấy từ tên file sitemap con (`sitemap_products_*`, `product-sitemap`, `xmlsitemap.php?type=products`, `products-us.xml`), không có thì đoán theo path.
  - Policy lấy từ link footer trang chủ.
  - Làm giàu thêm giá + mô tả: Shopify `/products.json` (ghim market bằng cookie `localization`/`cart_currency`), Woo `/wp-json/wc/store/v1/products`.
  - Đầu vào cho AEO score dựng từ JSON-LD + `<img alt>` của trang public. Prod thì dùng dữ liệu Admin API, nên score ở đây = engine thật + đầu vào đã adapt.
- Lịch sự: UA trình duyệt, `-m 20`, tối đa 40 request/store (dùng 17–40, Weber và 2 store Shopify chạm trần 40).

## Bảng kết quả

AEO = điểm trung bình `AuditScoreService` trên 3 trang product (trang nào lấy nhầm không phải product thì loại). SD = số check `runStructuredDataChecks` pass /6.

| Store | Platform | llms.txt hiện tại | Engine | Sinh ra: #link, KB | 5-link | Q 1-5 | Blocker |
|---|---|---|---|---|---|---|---|
| sigmabeauty.com | Shopify | 200, template Shopify `# Agent Instructions` 4.4KB, 5 link | real | 280 link, 41KB (103/106 product có giá+mô tả) | 5/5 200 | 4 | không có |
| skullcandy.com | Shopify | 200, template Shopify 4.5KB | real | 335, 37KB (50 product có giá, 41 có mô tả) | 5/5 | 4 | sitemap chỉ có 50 product |
| brooklinen.com | Shopify | 200, template Shopify | real (markdown lần 1 lỗi fetch, retry OK) | 682, 120KB (268 product có giá) | 5/5 | 4 | Product JSON-LD được chèn bằng JS → crawler AI không thấy, AEO 3 |
| yogamatters.com | Shopify | 200, template Shopify | real | 2112, 248KB **bị cắt** (gốc 290KB; 1568 product) | 5/5 | 3 | trần 248KB cắt mất 400 link; không có giá (hết budget) |
| bensgarden.com | Shopify | 200, **bản tự viết** 23KB, 67 link, có narrative thương hiệu | real | 1337, 174KB, không có giá | 5/5 | 3 | bản sinh ra chỉ là danh sách link, kém hơn bản họ đang có |
| jococups.com | WooCommerce | 404 | real + Woo Store API | 158, 19KB (39 product có giá AUD + mô tả) | 5/5 (1 redirect) | 4 | product **không có trong sitemap**, bắt buộc dùng Store API |
| thegoodbatch.com | **Squarespace** (brief ghi Magento là sai) | 404 | real, chỉ từ sitemap | 51, 5KB, 0 giá | 5/5 | 2 | sitemap không phân loại → trang thường lọt vào "Products" |
| planetbike.com | BigCommerce | 404 | real, chỉ từ sitemap | 1088, 105KB (411 product, 643 blog), 0 giá | 5/5 | 3 | trang product không có JSON-LD (chỉ microdata) → AEO 7 |
| weber.com | Salesforce CC | 404 | real (190 sitemap con, chọn bản `-us`) | 2153, 248KB **bị cắt** (gốc 1.7MB, trong đó 15,148 trang store-locator) | 6/6 qua 2 lượt | 3 | catalog quá lớn, phải lọc theo loại; 0 giá |
| paulsmith.com | Nuxt headless | **403** | **blocked** | 0 | — | 1 | bot wall: home/llms/sitemap đều 403 với cả curl lẫn node-fetch (riêng robots.txt trả 200) |

Thang Q: 5 = đủ product/collection/policy, có giá + mô tả, tiêu đề sạch. 4 = đủ, còn vài tiêu đề phải sinh từ slug. 3 = thiếu giá/mô tả hoặc bị cắt. 2 = phân loại sai. 1 = không sinh được.

### Hiện trạng readiness

| Store | AI bot trong robots | Schema home | Schema product | AEO | SD |
|---|---|---|---|---|---|
| sigmabeauty | Allow tường minh 9 bot | Organization, WebSite, BreadcrumbList | Product+Brand+AggregateRating+MerchantReturnPolicy+Breadcrumb | 81 | 5/6 (thiếu FAQ) |
| skullcandy | không có rule (mặc định allow) | Organization, WebSite | ProductGroup+AggregateRating+FAQPage | 80 | 4/6 |
| brooklinen | không có rule; robots có nhắc llms/agents | Organization, WebSite | chỉ BreadcrumbList (Product inject qua `<script>` JS) | 3 | 2/6 |
| yogamatters | không có rule; có nhắc llms | Organization, WebSite | ProductGroup+Brand+Offer | 75 | 2/6 |
| bensgarden | Allow 12 bot | Organization, WebSite | Product/ProductGroup+Brand+Offer | 64 | 2/6 |
| jococups | không có rule | Organization, Breadcrumb, WebSite | Product+Offer+Breadcrumb | 59 | 5/6\* |
| thegoodbatch | Allow 8 bot | chỉ WebSite | Product+Offer | 58 (2 product thật) | 4/6\* |
| planetbike | Allow 11 bot | Organization | không có (35 thẻ microdata) | 7 | 5/6\* |
| weber | không có rule | Organization, WebSite | Product+Offer+Breadcrumb+Shipping | 77 | 5/6\* |
| paulsmith | không có rule | — (403) | — | n/a | 4/6\* (fetch fail mà vẫn pass) |

Không store nào chặn bot AI (0/10 `Disallow: /`). \* = có PASS do không có dữ liệu, xem bug 2.

## Bug engine phát hiện

1. **`helpers/formatCurrency.js`, nhánh USD: `maximumFractionDigits: 0`.** llms.txt in ra `$127` thay vì `$127.20`, `$210` thay vì `$209.99`. GBP/AUD giữ đủ số lẻ. Nhánh này dính **mọi shop USD trong app AEO prod**: giá trong llms.txt lệch so với giá thật, AI agent dẫn giá sai. Sửa 1 dòng.
2. **`structuredDataChecks.js:184` `inferPageType` chỉ nhận `/products/`.** URL kiểu `/product/x/` (Woo), `/x.html` (SFCC), slug gốc (BigCommerce) bị gán thành `homepage`. Lúc đó `passesMinHaving(0,0)` trả `true`, nên productSchema / aggregateRating / returnPolicy PASS dù không có dữ liệu. Paul Smith fetch 403 toàn bộ vẫn ra 4/6 PASS. Trên Shopify vô hại, nhưng muốn bán cho non-Shopify thì phải sửa trước, không thì báo cáo nói sai.
3. **`const/aiReferralDomains.js` mới có 10 host, thiếu `claude.ai`.** `classifyReferrer({referrer:'https://claude.ai/'})` trả `null`. chatgpt/perplexity/gemini/copilot đều match đúng.
4. `capLlmsTxtContent` cắt ở 248KB. Đây là giới hạn theme file của Shopify. Với non-Shopify host file tĩnh thì không cần cắt, nhưng nên **ưu tiên product/policy rồi mới tới blog** thay vì cắt đuôi. Weber: 757 product giữ đủ chỉ vì product đứng đầu file.
5. `scrapeMarkdown` (Readability) lấy được 20/20 trang ở 9 store truy cập được, UA riêng không bị chặn. Nhưng trang product mất giá/tồn kho: Readability bỏ khối buy-box, file chỉ 0.6–7.8KB. Bản markdown cho product cần **ghép thêm JSON-LD** (giá, availability, SKU) thì mới đáng để AI đọc.

Lỗi phía adapter (không phải engine): `/products.json` trả giá theo geo của IP gọi. Gọi từ VN thì ra số VND mà adapter gắn nhãn `$` (`$641,000`). Đã sửa bằng cookie market. Muốn productize thì phải ghim market.

## Có chạy được trên non-Shopify không

Có, với điều kiện có adapter nguồn dữ liệu:

- **WooCommerce:** tốt nhất. Store API public cho đủ tên, giá, mô tả. Sitemap Yoast của jococups **không có product**, chỉ dựa sitemap là mất 100% product.
- **BigCommerce / SFCC:** sitemap có phân loại, link đúng. Thiếu giá/mô tả, cần thêm API (BC Storefront GraphQL, SFCC OCAPI) hoặc đọc JSON-LD từng trang (tốn request).
- **Squarespace:** sitemap không phân loại → phân loại sai. Cần heuristic `/store/p/` hoặc đọc JSON-LD.
- **Headless/enterprise có bot wall (Paul Smith):** không crawl được từ ngoài. Phải để merchant cấp feed hoặc allowlist IP.

## Giao file ngoài Shopify

| Cách | Hợp với | Ghi chú |
|---|---|---|
| Upload file tĩnh lên root (FTP/panel) | Woo/Magento self-host | Rẻ nhưng file cũ dần; chỉ hợp với gói one-off |
| WP plugin: rewrite `/llms.txt` + cron sinh lại từ WC data | Woo | Yoast/AIOSEO đã có llms.txt miễn phí, chỉ thắng được bằng giá + policy + markdown + audit |
| Edge worker (Cloudflare Worker / Akamai EdgeWorker / Fastly) proxy `/llms.txt` về file mình host | mọi site có CDN riêng: Weber, Paul Smith, headless | 1 cách dùng cho mọi platform, file luôn mới; merchant phải tự cấu hình DNS/route |
| Route trong code (Nuxt server route, SFCC controller) | headless/enterprise | làm theo dự án |
| BigCommerce WebDAV `/content/` + redirect 301 `/llms.txt` | BigCommerce | chưa verify |
| Squarespace | — | không có cách đặt file ở root (chưa verify) |

## Công sức productize

- **S (khoảng 3–5 ngày):** gói làm hộ một lần. Gồm: script bundle ở test này + sửa 3 bug engine + báo cáo audit (robots / schema / AEO / llms.txt hiện tại) + giao file `llms.txt` và `*.md`. Không cần hạ tầng mới.
- **M (2–3 tuần):** gói định kỳ, có Woo plugin hoặc Cloudflare Worker + hosted regeneration. Thêm adapter Woo / BigCommerce, sửa `inferPageType`, xếp section theo độ ưu tiên thay vì cắt đuôi.
- **L (trên 1 tháng):** connector SFCC/headless, AI-referral tracking bằng JS snippet cho non-Shopify (hiện đi qua App Proxy signature + Firestore), dashboard.

## Bán gì so với thứ Shopify đã cho miễn phí

- **Shopify cho miễn phí:** `/llms.txt` "Agent Instructions" (shop.app SKILL, UCP `/.well-known/ucp`, MCP checkout) + `sitemap_agentic_discovery.xml`. Tức là ống nước cho agent mua hàng, **không có catalog, policy hay thương hiệu**.
- **Mình bán:** lớp nội dung (catalog có giá/mô tả, policy, collection), bản markdown của trang, sửa schema (Brooklinen chèn Product bằng JS, AEO 3; Planet Bike không có JSON-LD, AEO 7), audit có điểm số, đo AI referral.
- **Bằng chứng có nhu cầu:** Ben's Garden đã tự viết tay 23KB llms.txt có narrative. Bản catalog mình sinh ra đầy đủ hơn (1337 link so với 67) nhưng thua về câu chuyện thương hiệu. Gói nên ghép **header narrative do merchant duyệt** + catalog tự sinh. `setting.summary` hiện chỉ có 1 dòng.

**Khuyến nghị:** làm gói S trước, nhắm Woo + store có CDN riêng. Sửa bug 1 (giá USD) ngay cho app AEO prod vì đang sai cho khách hiện tại.

## File

- Output: `<scratch>/s2/out/<domain>-llms.txt` (9 file có nội dung, Paul Smith rỗng) + `<domain>-md-{1,2}.md` (18 file).
- Kết quả thô: `<scratch>/s2/results-{a..e,g,w}.json`, `d-run1` = lượt đầu của yogamatters + weber. Bản llms.txt lượt 1 (giá sai geo) ở `raw/run1/`.
- Runner: `<scratch>/s2/run.js`, `build.mjs`, bundle `code/engines.cjs`.

`<scratch>` = `/private/tmp/claude-501/-Users-nguyentuan-Documents-second-brain/abea53b9-0765-4c75-aa35-2264a8b7276f/scratchpad`
