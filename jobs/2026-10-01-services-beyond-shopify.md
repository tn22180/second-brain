# Service bán ra ngoài Shopify — kiểm kê + chạy thử 10 store (2026-10-01, cập nhật 2026-10-07)

## Kết luận

Chọn **4 service trả phí + 1 audit miễn phí làm mồi**. Shopping Feed đứng đầu vì đo được kết quả nhanh nhất (tỷ lệ duyệt, ROAS — số của Google/Meta/OpenAI, khách tự kiểm).

| # | Service | Engine chạy thật | Chất lượng output | Effort ra được non-Shopify | Chi phí biên/store |
|---|---|---|---|---|---|
| 0 | **Shopping Feed — Google + Meta + ChatGPT** (mục 5) | 5/5 store non-Shopify, 1.213 item | feed đạt spec: ChatGPT 90.6% → **99.5%**, Google 19.1% → **85.7%** sau auto-fix | M — app đã có 3 kênh + ChatGPT ~80%; thiếu adapter non-Shopify | ≈$0 (AI chỉ khi sửa lỗi) |
| 1 | **AI Content** — viết lại mô tả SP + meta + bài blog | 10/10 SP, 5/5 bài | 3.1/5 copy; blog score 51–58 | M (2–3 tuần) | ~$0.15/tháng (50 SP + 4 bài) |
| 2 | **SEO + Schema audit & fix pack** | 10/10 | 3.7/5, dán được 7/10 | M (2–3 tuần) | ≈$0 (3 LLM call, Ollama flat) |
| 3 | **AI Search (AEO) — llms.txt có catalog + schema + markdown** | 10/10 (9 sinh được file) | 45/45 link 200 | S làm hộ (3–5 ngày); M kèm WP plugin/edge | ≈$0 (không LLM) |
| 4 | **Speed audit** (miễn phí, mồi bán 1–3) | 10/10 | report đủ; fix cần quyền site | S | ≈$0 |

**SOCIAL** — gộp vào gói SEO, không thành service riêng. `seo` có module Social networks (`/search/social`, `pages/Social/`): social profile → `sameAs` trong Organization schema, OG/Twitter title/description/thumbnail từng trang + Bulk Edit, preview Facebook/Twitter, job `subscribeOverwriteSocialTags`. Tức là tối ưu cách link hiện khi share — không đăng bài, không quản kênh. Joy có social-earn cho loyalty.

Loại: **EMAIL** — chỉ email giao dịch; app Email Marketing cũ còn mỗi asset CDN (commit cuối 2024-03).

Chạy ra ngoài Shopify được vì lõi là prompt + crawl, không phải Shopify API. Phần Shopify chỉ là lớp ghi ngược (metafield, theme file, Files API) → ngoài Shopify thay bằng **file bàn giao (CSV/HTML/llms.txt) + REST của Woo/BigCommerce/WP**.

## Phải sửa trước khi bán — 2 cái đang sai cho khách hiện tại

1. **APC bịa review khách** — `ai-product-copy` `const/templates.js:51` slot `[Testimonial or proof point]`, prompt không cấm bịa. 7/10 mô tả test có "Customers praise…", 1 câu trích dẫn khách giả (Skullcandy). App Shopify đang dùng template này → merchant thật có thể đang đăng review giả lên PDP. Rủi ro FTC fake-review rule. Cần FAL.
2. **AEO làm tròn giá USD** — `llm-ai-search-seo` `helpers/formatCurrency.js` `maximumFractionDigits: 0` cho USD → `$209.99` thành `$210` trong llms.txt mọi shop USD. Sửa 1 dòng.

## Bộ test

| Store | Platform |
|---|---|
| [sigmabeauty.com](https://www.sigmabeauty.com) | Shopify |
| [skullcandy.com](https://www.skullcandy.com) | Shopify |
| [brooklinen.com](https://www.brooklinen.com) | Shopify |
| [yogamatters.com](https://www.yogamatters.com) | Shopify |
| [bensgarden.com](https://www.bensgarden.com) | Shopify |
| [jococups.com](https://jococups.com) | WooCommerce |
| [thegoodbatch.com](https://www.thegoodbatch.com) | **Squarespace** + shop Shopify subdomain (ban đầu nhận nhầm Magento) |
| [planetbike.com](https://www.planetbike.com) | BigCommerce |
| [weber.com](https://www.weber.com) | Salesforce Commerce Cloud |
| [paulsmith.com](https://www.paulsmith.com) | Nuxt headless | Store Magento/enterprise lớn (Helly Hansen, Fred Perry, Byredo, Porter & York) chặn bot từ request đầu → không vào được bộ test; đó cũng là giới hạn thật của service với enterprise.

Code chạy: `git archive` default branch → scratch, babel/esbuild, stub Firestore/Shopify. Không ghi gì vào prod. LLM: ~81 call (S1 41 qua Ollama `gemma4:31b`, S3 40 qua OpenRouter `gpt-4.1-mini` / `gemini-2.5-flash-lite`).

## 1. AI Content

- Lấy được data SP 10/10 (Shopify `.json`; còn lại JSON-LD hoặc DOM).
- Spec đúng 10/10 — không bịa số. Lỗi là **bịa social proof 7/10** (xem trên) và độn chữ khi nguồn ngắn (20–36 từ → 190–245 từ).
- Bug non-Shopify: `downloadImageAsBase64` luôn nối `&width=`, không follow redirect `http://` → 3/5 store non-Shopify mất ảnh, rơi về `gemini-2.5-flash-lite` text-only, output bẩn (lọt label template, markdown `**`, cụm từ prompt đã cấm).
- Blog: engine viết 1000–1500 từ nhưng `blog-score` chỉ pass 600–1000 → 5/5 fail độ dài theo thiết kế; meta 162–180 ký tự; 3/5 bài có ký tự `n` lạc giữa tag (33–55 chỗ) — cần check bài trên prod.
- Giao hàng: Woo/BigCommerce/WP có REST ghi thẳng (S); Magento/SFCC/headless → CSV/HTML.
- Bắt buộc có người duyệt trước khi đăng.

## 2. SEO + Schema audit & fix pack

- Engine thật 10/10. Fix pack (meta title/desc + alt): 10/10 meta, 19/20 alt, chất lượng TB 3.7/5.
- Báo xanh sai ở non-Shopify: `inferPageType` (`structuredDataChecks.js:184`) chỉ nhận `/products/` → jococups/weber/paulsmith PASS 4 check với total=0. `ProductGroup` bị FAIL sai; Microdata (planetbike) và JSON-LD inject bằng JS (brooklinen) bị báo "không có schema".
- 3 ngưỡng meta description lệch nhau trong code (50–160 / 150–160 / 120–155) → 7/10 desc AI viết bị chính audit báo lỗi lại.
- `getPageContent` không gửi User-Agent → Paul Smith 403. Rule `imagesNotParamShopify` báo ở 10/10, false positive với non-Shopify.
- Effort M: fetcher có UA, sửa page type / ProductGroup / Microdata, fallback render JS (puppeteer có sẵn), 1 ngưỡng meta, xuất CSV/JSON.

## 3. AI Search (AEO)

- 9/10 sinh được llms.txt, 45/45 link mẫu 200; paulsmith 403 toàn bộ.
- Shopify đã cho miễn phí `/llms.txt` dạng "Agent Instructions" (4/5 store Shopify test dùng nguyên template) nhưng **không có catalog**. Thứ mình bán là lớp nội dung: catalog có giá/policy, bản markdown, sửa schema, đo AI referral.
- Woo tốt nhất (Store API: 39 SP có giá + mô tả, trong khi sitemap Yoast không có SP). BigCommerce/SFCC đúng link nhưng thiếu giá.
- Bằng chứng nhu cầu: Ben's Garden tự viết tay 23KB llms.txt; bản mình sinh đủ link hơn (1337 vs 67) nhưng thua về câu chuyện thương hiệu → nên ghép header viết bằng AI/người.
- `classifyReferrer` thiếu `claude.ai`.
- Giao: upload file root (Woo/WP plugin), edge worker cho site có CDN riêng.
- Kết hợp số đo hôm qua: 82% shop đang cài app AEO vẫn serve template Shopify (xem `2026-10-01-top10-shopify-brands-seo.md`).

## 4. Speed audit (mồi miễn phí)

| Store | Platform | Perf | LCP | TBT | Tiết kiệm ảnh |
|---|---|---|---|---|---|
| [sigmabeauty](https://www.sigmabeauty.com) | Shopify | 65 | 9.3s | 0ms | 12.7% |
| [skullcandy](https://www.skullcandy.com) | Shopify | 40 | 13.4s | 620ms | 32.9% |
| [brooklinen](https://www.brooklinen.com) | Shopify | 16 | 27.8s | 3,280ms | 20.8% |
| [yogamatters](https://www.yogamatters.com) | Shopify | 58 | 9.8s | 227ms | 14.5% |
| [bensgarden](https://www.bensgarden.com) | Shopify | 57 | 13.2s | 64ms | 11.5% |
| [jococups](https://jococups.com) | Woo | 33 | 15.2s | 122ms | **79.3%** |
| [thegoodbatch](https://www.thegoodbatch.com) | Squarespace | 54 | 23.0s | 126ms | 29.9% |
| [planetbike](https://www.planetbike.com) | BigCommerce | 41 | 18.7s | 208ms | **56.8%** |
| [weber](https://www.weber.com) | SFCC | 52 | 16.1s | 229ms | 2.4% (đã AVIF) |
| [paulsmith](https://www.paulsmith.com) | Nuxt | 59 | 9.1s | 248ms | 2.6% (đã AVIF) |

- Lighthouse 12.8.2 local, mobile, 1 run/store; nén bằng `compressImage` thật của image-optimizer (WebP q83).
- Thủ phạm số 1 ở 8/10 store là JS/third-party, không phải ảnh (Skullcandy 16MB third-party, riêng videowise 12MB).
- Shopify CDN đã tự WebP → nén ảnh chỉ ~18.5%; lỗi thật là ảnh 3840–4679px mà engine mình không resize. Non-Shopify không có image CDN (Woo/BigCommerce) tiết kiệm 57–79%.
- Fix cần quyền site → chỉ bán report; dùng làm cửa vào bán 1–3. Lọc khách bằng 1 request test `Accept: image/avif,image/webp` trước khi pitch.
- AVIF đang bị comment ở `seo` `helpers/optimize/sharp.js:197`; chưa có resize.

## 5. Shopping Feed — Google + Meta + ChatGPT (test 2026-10-01)

**Vì sao:** Avada đã có Product Feed — đọc code `product-feed` `origin/master` 6e17a5b (2026-10-07), chi tiết `jobs/2026-10-01-services/inv-product-feed.md`:
- Kênh: **Google** (Merchant API file-fetch, approval qua Reports API `product_view`), **Meta** (`product_feeds` + override COUNTRY/LANGUAGE, đọc `review_status`), **"Any platform" XML**, và **ChatGPT đã có ~80%** (`openaiAdsController.js`: CSV đủ cột, enum đúng, cờ eligible, variant fields, đẩy SFTP qua OpenAI Ads API). TikTok mới là hằng số; Pinterest/Microsoft chưa có.
- ChatGPT còn thiếu: gzip (S), push chỉ khi publish — chưa đạt "≥ daily" với shop không auto-sync (S), status tự động (M), status từng item (L), validator riêng (S–M). Rủi ro: `sftp_access` và `/feeds/uploads` của OpenAI chưa có tài liệu chính thức.
- Nguồn catalog **chỉ Shopify bulk op**, không có webhook product (trễ tới ~1 ngày). Sau khi chuẩn hoá vào `feedProducts` (~40 field/variant, `productSyncService.js:743-793`) thì rules → validation → `xmlFeedFormatter` → GCS không phụ thuộc Shopify. Adapter Woo/CSV/JSON-LD ghi vào `feedProducts` là dùng lại được: 2 điểm cắt M + 4 điểm S. Auth/tenant và UI embedded là L — bán dạng dịch vụ team tự vận hành thì bỏ qua được.
- 48 rule validation, 4 auto-fix. AI: OpenRouter `qwen/qwen3.7-flash`, chỉ để sửa lỗi feed (title/desc thiếu hoặc dài, category, thuộc tính apparel) — không tối ưu bán hàng, không gọi APC.
- Plan: chưa có billing; trial 10 feed / 100 SKU / không auto-sync, mở khoá do CS bật tay. ChatGPT Ads live 02/2026, self-serve từ 05/05, product feed trong Ads Manager từ 06/2026, $1B run-rate 31/08. OpenAI tự ra app Shopify ngày 16/09 (chỉ US) → với Shopify mình bán **sửa lỗi + tối ưu + đa kênh**; với non-Shopify OpenAI **không có app**, phải tự dựng feed → chỗ trống lớn nhất.

**Spec** (lấy 2026-10-01 từ developers.openai.com + support.google.com/merchants):
- ChatGPT bắt buộc 9 field: `item_id, title (≤150), description (≤5000), url, brand, seller_name, image_url, availability, price`. Giá dạng chuỗi `"79.99 USD"`. Có biến thể → thêm `group_id, listing_has_variations, variant_dict`. Cờ eligibility: `is_eligible_search`, `is_eligible_checkout`, `is_ads_eligible`. Gửi full snapshot qua SFTP ≥1 lần/ngày (parquet / jsonl.gz / csv.gz).
- Google: thêm `brand` + (`gtin` | `mpn` | `identifier_exists=no`); may mặc US cần `color, size, gender, age_group, item_group_id`.

**Cách test:** 5 adapter lấy catalog công khai (không cần quyền admin) → 1 định dạng chung → dựng `chatgpt.jsonl.gz` + Google XML → chấm theo spec. `raw` = xuất thẳng như exporter ngây thơ; `fixed` = sau auto-fix không dùng LLM.

| Store | Platform | Nguồn catalog | Item | ChatGPT raw → fixed | Google raw → fixed | Lỗi còn lại |
|---|---|---|---|---|---|---|
| [jococups.com](https://jococups.com) | WooCommerce | Store API public | 257 | 97.7% → **100%** | 0% → **100%** | — |
| [thegoodbatch.com](https://www.thegoodbatch.com) | Squarespace + Shopify | `?format=json` + `/products.json` | 31 | 6.5% → **100%** | 0% → **100%** | — |
| [planetbike.com](https://www.planetbike.com) | BigCommerce | sitemap + Microdata + `/remote/v1/product-attributes` | 131 | 84.7% → **100%** | 0% → **94.7%** | 7 item thiếu tồn kho (hết quota request) |
| [weber.com](https://www.weber.com) | Salesforce CC | `Product-Variation` JSON public | 120 | 55.8% → **100%** | 100% → **100%** | — |
| [paulsmith.com](https://www.paulsmith.com) | Nuxt + Centra | `__NUXT_DATA__` + JSON-LD | 674 | 99.1% → **99.1%** | 16.6% → **75.4%** | 160 thiếu `gender` (unisex/homeware), 6 thiếu brand |
| **Tổng** | | | **1.213** | **90.6% → 99.5%** | **19.1% → 85.7%** | |

**Lỗi raw hay gặp → auto-fix:**
- Thiếu mã định danh (4/5 store, 0% GTIN trừ Weber/Paul Smith) → Google từ chối 100% → `identifier_exists=no`.
- Biến thể không có `variant_dict` (thegoodbatch, weber, planetbike) → lấy option từ đuôi title; nhóm chỉ 1 biến thể thì bỏ cờ variation.
- URL ảnh có dấu cách (`Pellet bundles/…`, weber) → encode.
- Gift card + item giá $0 (thegoodbatch) → loại khỏi feed (vi phạm chính sách Google/Meta).
- HTML trong description, `preorder` vs `pre_order` giữa 2 kênh → chuẩn hoá.
- Đồ may mặc thiếu `gender`/`age_group` (Paul Smith 556 item) → suy từ URL/category của store, không suy từ tên SP; còn 160 không suy được.

**Việc cho AI (APC) — chưa chạy, đã đếm:** 1.168/1.213 item (96%) title không chứa brand; 117 chỉ có 1 ảnh; 78 không có category. Đây là phần "tối ưu" bán thêm sau khi feed sạch.

**Phát hiện adapter:** mỗi platform đều có 1 nguồn catalog public đủ dùng (Woo Store API, SFCC `Product-Variation`, BigCommerce `/remote/v1`, Nuxt payload, Squarespace `?format=json`) — không cần admin để làm demo/mốc ngày 0. Dữ liệu bẩn thật từ store: giá parent Woo sai (6045 vs 5495), handle `house-dozen-anna-test` đang bán, SKU 2 nguồn lệch (Paul Smith), `variantMsg` SFCC báo hết hàng sai.

**Đo kết quả (proof):** ngày 0 = % item đạt spec + số lỗi theo mã; ngày 7 = tỷ lệ duyệt thật trong Merchant Center / Meta Commerce Manager / ChatGPT Ads; sau đó impressions, clicks, ROAS. App Product Feed đã đọc được approval từ Reports API → làm proof report gần như sẵn.

**Giới hạn:** chấm theo spec, **chưa push thật** lên Merchant Center / ChatGPT nên chưa có tỷ lệ duyệt thật (cần account test). Chưa dựng feed Meta (spec gần Google). Chưa kiểm lệch giá landing page — lỗi #1 của Google — nhưng giá lấy thẳng từ trang live nên lệch = 0 tại thời điểm lấy. Mẫu ≤120 SP/store.

**So với lỗi test tìm ra (10 loại):** app đã sửa trọn 3 (`variant_dict` rỗng, item $0, HTML trong description); một phần 3 (`identifier_exists=no` gần như không bao giờ ghi vì mode Auto tính cả brand mà brand mặc định = Vendor; `pre_order` chỉ map cho ChatGPT; apparel chỉ AI suggest, chỉ Google, 6 nước); **chưa có rule** cho 4 (group 1 biến thể với Google/Meta, dấu cách trong URL ảnh, title thiếu brand, chỉ 1 ảnh).

**Cần làm:**
1. Vá 2 lỗ trước khi bán plan: `PUT /settings` cho merchant tự nâng `renderImageLimit`; `devZoneGuard` tin email shop chưa xác thực có đuôi domain Avada khi `trustShopEmail` bật → shop tự mở khoá, kể cả cờ toàn app. Kiểm env prod: `accessTokenKey` có đang dùng giá trị mặc định trùng `.env.example` không; IAM bucket GCS public-read.
2. Sửa `identifier_exists` + thêm 4 rule còn thiếu — chính là lỗi làm Google từ chối 100% ở 4/5 store test.
3. ChatGPT: gzip + push theo lịch daily + status tự động.
4. Adapter non-Shopify ghi vào `feedProducts` — 5 adapter catalog của test này là bản nháp.

Feed và script: `jobs/2026-10-01-services/feed/` (`out/*.chatgpt.jsonl.gz`, `out/*.google.xml`, `out/grades.json`, `build_feeds.py`, `spec.md`).

## Thứ tự làm

1. Sửa 2 bug đang sai cho khách hiện tại (APC review giả, AEO giá USD) — tuần này.
2. Shopping Feed: vá 2 lỗ plan/devZone, sửa `identifier_exists` + 4 rule thiếu, hoàn thiện ChatGPT (gzip, daily push, status), rồi adapter non-Shopify vào `feedProducts`.
3. AEO làm hộ cho Woo trước (S, 3–5 ngày) — rẻ nhất, không cần LLM.
4. Runner độc lập dùng chung cho Feed + S1 + S3: fetcher có UA + adapter catalog (Shopify `.json` / Woo Store API / BigCommerce `/remote/v1` / SFCC `Product-Variation` / JSON-LD / DOM) + xuất file. Một lớp này mở cả 3 service (M, 2–3 tuần).
5. Speed report đi kèm làm mồi; không đầu tư fix-as-a-service (L).
6. Trước khi bán: khoá `/lighthouse/auditNew` và `/proxy/temp/seo-tool/image` (đang public, không auth, không rate limit), rotate key cross-app lộ trên npm.

## Giới hạn

- 10 store, 1 SP + home mỗi store; Lighthouse 1 run.
- Chất lượng chấm bằng agent, chưa có người làm marketing duyệt.
- Non-Shopify thật chỉ 4 platform (Woo, BigCommerce, SFCC, Squarespace) + 1 headless; Magento chưa test được do bot wall.
- Shopping Feed: chấm theo spec, chưa push thật lên kênh; chưa đọc code Pixel.

Chi tiết: `jobs/2026-10-01-services/` — 5 file kiểm kê (`inv-*.md`) + 4 file chạy thử (`test-s1..s4-*.md`).
