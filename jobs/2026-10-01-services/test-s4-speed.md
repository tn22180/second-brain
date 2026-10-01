# Test S4 — Speed audit + image optimization (10 store, 2026-10-01)

**Kết luận:** Bán được dạng **report** cho mọi nền tảng ngay (Lighthouse + đo ảnh chạy được không cần quyền site). Ảnh: non-Shopify tiết kiệm TB **34%** vs Shopify **18,5%**, nhưng upside thật chỉ ở store **không có CDN negotiate** (planetbike BigCommerce 57%, jococups PNG-lossless qua Jetpack 79%). Store enterprise (weber SFCC, paulsmith Cloudinary) đã AVIF sẵn → ~2%. Đòn bẩy lớn nhất ở cả 10 store **không phải ảnh** mà là JS/3rd-party + LCP — phần đó cần quyền site hoặc dev của khách. Productize: report **S**, fix-as-a-service **L**.

Sửa 1 dòng spec: `thegoodbatch.com` là **Squarespace** (`server: Squarespace`, ảnh `images.squarespace-cdn.com`), không phải Magento. Không có store Magento trong mẫu.

## Engine & cách chạy

| Engine | Code (origin/master) | Chạy | Ghi chú |
|---|---|---|---|
| PSI `getGooglePageSpeedScore` | seo `6747ddccb5e` `helpers/google.js:76` | **Không** | keyless → `429` (đã thử 1 call). Không dùng `PAGESPEED_API_KEY` prod. Fallback local LH. |
| Lighthouse `/lighthouse/auditNew` | `handlers/lightHouseAuditHandler.js:14` → `controllers/lightHouseController.js:164 runAuditNew` → `services/lightHouseService.js auditLightHouse` | **Real lib, local** | `lighthouse@12.8.2` (repo `^12.8.0`), mobile, `onlyCategories:['performance']`, throttling `mobileSlow4G` = 150ms RTT/1,6Mbps/CPU 4x (= default mobile LH), `maxWaitForLoad 60000`. Khác prod: không qua `guardPageRequests`, Chrome local Mac, 1 run/store (không median). |
| `compressImage` image-optimizer | avada-image-optimizer `9f797672` `helpers/optimize/sharp.js:151` (`process` :21) | **Real code** | Hàm copy nguyên văn, chỉ stub import. Settings: `compressType:'auto'` (q92) + `force_webp:true` → WebP q=`round(92*0.9)`=**83**. `sharp 0.30.7` = đúng version prod. |
| `compressImage` seo | seo `helpers/optimize/sharp.js:164` | **Real code** | Default `compress_type:'auto'`, `typeFormat:false` → giữ format (jpeg q74, webp q85). Cột phụ. AVIF bị comment out (:197). |
| `extractCriticalCSS` | seo `services/extractCriticalCssService.js:793` | **Không chạy** | Bản thân hàm platform-agnostic (puppeteer + `critical@7.1.1`, nhận URL); phần cài vào site (`handleGenerateCriticalCSS` :165) ghi theme asset Shopify → không dùng cho non-Shopify. |

Ảnh: candidates = ảnh browser thật tải (LH `network-requests`) ∪ scrape HTML (`img src/data-src/srcset ≤2000w`, `<source>`, `og:image`, CSS `url()`), HEAD lấy Content-Length, top 10, tải bằng UA Chrome + `Accept: image/avif,image/webp,...`, `-m 20`. Savings = `min(orig, webp)` (giống `skippedLarger` của `process`). AVIF q50 = tham khảo, engine không có.

## Bảng chính

| Store | Platform | Perf | LCP | TBT | Img savings % (KB) | Already optimized by CDN? | Fix deliverable without platform access? | Engine ran |
|---|---|---|---|---|---|---|---|---|
| sigmabeauty.com | Shopify | 65 | 9,3s | 0ms | 12,7% (562) | Có — WebP qua Accept (8/8) | Report only; ảnh thật cần resize (3840–4076px trên homepage) → theme | LH real · img real |
| skullcandy.com | Shopify | 40 | 13,4s | 620ms | 32,9% (580) | Có, trừ ảnh CloudFront ngoài Shopify CDN (jpeg cứng) | Report; 3rd-party 16,1MB (videowise 12MB) cần quyền | LH real · img real |
| brooklinen.com | Shopify | **16** | **27,8s** | **3.280ms** | 20,8% (169) | Có — WebP 8/8 | Report; TBT/3p cần quyền | LH real · img real |
| yogamatters.com | Shopify | 58 | 9,8s | 227ms | 14,5% (315) | Có — WebP 7/8 | Report; `lcp-lazy-loaded` = sửa 1 attribute nhưng cần theme | LH real · img real |
| bensgarden.com | Shopify | 57 | 13,2s | 64ms | 11,5% (570) | Có — WebP 8/8 | Report; ảnh 4679px | LH real · img real |
| jococups.com | WooCommerce | 33 | 15,2s | 122ms | **79,3% (1.934)** | Có WebP (Jetpack `i0.wp.com`) nhưng **lossless từ PNG** → 528KB/ảnh | Gửi file ảnh đã nén được; thay ảnh cần WP admin | LH real · img real |
| thegoodbatch.com | **Squarespace** | 54 | 23,0s | 126ms | 29,9% (1.503) | Có — WebP 5/7 | Report; Squarespace đóng, không cài script được | LH real · img real |
| planetbike.com | BigCommerce | 41 | 18,7s | 208ms | **56,8% (2.165)** | **Không** — 5/8 jpeg dù Accept webp/avif (`/product_images/`, `/content/` ngoài CDN) | Gửi file nén; upload lại cần admin | LH real · img real |
| weber.com | Salesforce CC | 52 | 16,1s | 229ms | 2,4% (16) | Có — **AVIF** qua Accept (6/8, DIS `dw-images`) | Không có gì để bán về ảnh | LH real · img real |
| paulsmith.com | Headless Nuxt (Vercel + Cloudinary) | 59 | 9,1s | 248ms | 2,6% (52) | Có — **AVIF** qua URL `f_avif` (8/8) | Không có gì để bán về ảnh | LH real · img real |

TB ảnh: Shopify **18,5%** (TB 439KB/10 ảnh), non-Shopify **34,2%** (TB 1.134KB) — nhưng phân cực: 3 store 30–79%, 2 store ~2%.

## Chi tiết per store

CLS / top 3 opportunity (LH, đã bỏ diagnostic `largest-contentful-paint-element`) / 3rd-party (transfer, blocking) / tổng trang.

| Store | CLS | Top 3 opportunities | 3rd-party | Trang (JS / img) |
|---|---|---|---|---|
| sigmabeauty | 0,000 | redirects 1.021ms (www→apex); cache-insight 450ms; image-delivery 450ms | 410KB, 0ms (bogos.io 129KB, Tolstoy 63KB) | 1,5MB (485KB / 803KB) |
| skullcandy | 0,000 | unused-javascript 1.260ms/1.082KB; cache-insight 900ms; third-party 650ms | **16.116KB**, 650ms (videowise 12.008KB, GTM 680KB) | 19,8MB (3,2MB / 1,9MB) |
| brooklinen | 0,196 | third-party 3.600ms; unused-javascript 3.350ms/1.306KB; cache-insight 2.000ms | 5.998KB, **3.651ms** (GTM 986KB, Attentive 330KB) | 20,3MB (4,6MB / 2,2MB) |
| yogamatters | 0,004 | unused-javascript 1.650ms/705KB; lcp-lazy-loaded 1.450ms; image-delivery 950ms | 3.236KB, 285ms (Freshchat 978KB, Klaviyo 579KB) | 5,9MB (3,0MB / 1,1MB) |
| bensgarden | 0,127 | image-delivery 7.050ms; redirects 950ms; unused-javascript 600ms/448KB | 1.024KB, 12ms | 4,7MB (1,2MB / 2,9MB) |
| jococups | **0,945** | unused-javascript 2.400ms/456KB; prioritize-lcp-image 1.511ms; redirects 1.500ms | 2.320KB, 177ms (WP.com 1.398KB, GTM 592KB) | 6,1MB (1,1MB / 1,5MB) |
| thegoodbatch | 0,000 | unused-javascript 5.900ms/818KB; image-delivery 3.100ms; render-blocking 1.550ms | 3.789KB, 180ms (Squarespace platform) | 4,0MB (2,1MB / 1,2MB) |
| planetbike | 0,253 | prioritize-lcp-image 4.050ms; cache-insight 3.650ms; **modern-image-formats 3.150ms/1.794KB** | 3.777KB, 231ms (GTM 848KB) | 6,4MB (2,5MB / 3,2MB) |
| weber | 0,028 | render-blocking 6.500ms; unused-javascript 3.400ms/716KB; cache-insight 2.200ms | 1.569KB, 408ms (GTM 543KB, Forter 173KB) | 2,7MB (1,5MB / 574KB) |
| paulsmith | 0,000 | unused-javascript 900ms/511KB; preconnect 304ms; uses-responsive-images 795KB | 100KB, 0ms | 3,0MB (1,2MB / 1,2MB) |

Quan sát:
- Opportunity #1 ở **8/10** store là JS (unused-JS / render-blocking / 3rd-party), không phải ảnh. Ảnh chỉ đứng #1 ở bensgarden (image-delivery 7s) và planetbike (prioritize-lcp + modern-formats).
- LH `modern-image-formats` = **0KB ở 4/5 Shopify** — Shopify CDN đã giải quyết format. Lỗi ảnh Shopify còn lại là **kích thước** (`uses-responsive-images` 238–1.074KB; sigma/bens tải ảnh 3840–4679px), engine compress của mình **không resize** nên không bắt được phần này.
- WebP re-encode trên ảnh Shopify đã-là-WebP = nén chồng lossy (generation loss) để lấy 11–33%. Bán như "giảm dung lượng" được nhưng không phải lỗi thật của store.
- jococups: Jetpack Photon serve PNG → WebP **lossless** (528KB banner → 16KB WebP q83, 4KB AVIF). Đây là case thắng rõ nhất: lỗi cấu hình, khách không biết.
- paulsmith/weber: engine WebP làm ảnh Cloudinary `q_auto` **to hơn** (405→584KB) → `skippedLarger`. Đúng hành vi; nhưng nếu report hiện "0%" cho khách enterprise thì nên lọc store này ra từ bước sales.
- AVIF (tham khảo, sharp q50) thắng WebP ở mọi store (TB 65–93%); engine cả 2 repo đều tắt/không có AVIF — gap sản phẩm nếu bán cho non-Shopify.

## Đánh giá service S4

**Giao được dạng report (không cần quyền site) — làm được ngay:**
- Perf/LCP/CLS/TBT + top opportunity: LH local chạy 10 store trong **~6 phút** (11:03→11:10, tuần tự), 0 lỗi, kể cả Akamai (weber) và Vercel. PSI keyless chết → bắt buộc self-host LH (đã có engine).
- Kiểm Accept negotiation + đo ảnh + file ảnh đã nén để khách tự upload: chạy được mọi nền tảng.
- 3rd-party weight theo vendor (GTM, Klaviyo, videowise…) — số cụ thể để khách tự cắt app.

**Cần quyền site:**
- Mọi fix có giá trị lớn nhất: bỏ/defer JS, sửa `loading=lazy` trên LCP, preload LCP, srcset/resize, critical CSS. `extractCriticalCSS` sinh CSS được từ URL bất kỳ, nhưng cài vào site hiện chỉ có đường Shopify theme asset.
- Thay ảnh trong CMS (WooCommerce/BigCommerce/Squarespace admin) — mình chỉ đưa file.

**Non-Shopify có upside hơn Shopify? — Có, nhưng không đồng đều:**
- Có: store SMB tự host/plugin (planetbike 2.165KB, jococups 1.934KB, thegoodbatch 1.503KB tiết kiệm trên 10 ảnh) vs Shopify TB 439KB.
- Không: enterprise headless/SFCC đã AVIF (weber 16KB, paulsmith 52KB). Target nên là **SMB non-Shopify, không có image CDN** — lọc bằng 1 request Accept test trước khi pitch.
- Shopify: upside ảnh thấp (format đã xử lý), upside JS/3rd-party cao (brooklinen TBT 3,3s, skullcandy 16MB 3rd-party) — đó là dịch vụ khác (S-JS audit), không phải image optimization.

**Effort productize:**

| Gói | Effort | Thiếu gì |
|---|---|---|
| Report tự động (LH + Accept test + top-10 ảnh + file nén + 3p breakdown) | **S** (~3–5 ngày) | Bỏ phụ thuộc `shopId`/Shopify trong `fetchLightHouse`/`auditLightHouse` (upload GCS theo `pageSpeed/${shopId}`); median 3 run; render HTML report |
| Thêm AVIF + resize theo kích thước hiển thị | **S–M** | Bật AVIF (đang comment `sharp.js:197`); thêm resize theo `uses-responsive-images` — đây mới là phần ăn tiền ở Shopify |
| Fix-as-a-service non-Shopify (WP plugin / BigCommerce app / script snippet) | **L** | Mỗi platform 1 integration; Squarespace/SFCC gần như không cài được |

Khuyến nghị: bán **report S4 cho SMB non-Shopify không có image CDN**, upsell AVIF/resize; đừng pitch "image optimization" cho Shopify hay enterprise headless.

## Raw data
`s4/lh/<store>.json` (LH full), `s4/img/<store>.json` (per-image bytes), `s4/summary.json`, harness `s4/run/{img,sum,neg}.mjs`, engine copy `s4/run/engine_{imgopt,seo}.mjs` — tất cả trong `/private/tmp/claude-501/-Users-nguyentuan-Documents-second-brain/abea53b9-0765-4c75-aa35-2264a8b7276f/scratchpad/`.

Hạn chế: 1 run LH/store (perf dao động ±5–10), Chrome local Mac không phải môi trường GCF; WebP q83 chưa kiểm SSIM/visual; top-10 theo Content-Length thiên về ảnh lớn nhất trong srcset (có thể không phải ảnh mobile thật tải).
