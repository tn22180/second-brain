# Top 10 brand Shopify — audit SEO/AEO (2026-09-30)

## Kết luận

1. **Không brand nào trong 10 dùng app SEO/image bên thứ 3** (0/10; 1 speed app: Yottaa ở Fenty). Brand top tự code SEO trong theme/headless → không phải khách trực tiếp; giá trị là **benchmark default** cho app mình.
2. **Shopify đã tự sinh `/llms.txt` + `/llms-full.txt` + `/agents.md` + `sitemap_agentic_discovery.xml`** cho store Liquid (5/6 store Liquid trả template "# Agent Instructions — <brand>", 0 nội dung catalog). llms.txt 200 ≠ merchant làm AEO. App AEO phải bán "llms.txt có catalog" chứ không bán "có llms.txt" — và cần check app mình có đè/xung đột route Shopify tự sinh không.
3. **Gap lặp lại nhiều nhất = đúng feature app mình:** rating không vào schema (3/10 có review app mà Product JSON-LD thiếu AggregateRating; 9/10 không Review node), collection thiếu ItemList (6/10), H1 lỗi (7/10), meta desc sai độ dài (6/10), alt ảnh PDP trung vị ~60%.
4. **Rủi ro mới cho AI search:** 4/10 render grid/gallery/schema phía client → GPTBot/ClaudeBot (không chạy JS) thấy trang rỗng. Chưa app nào audit "view không-JS" — ý tưởng feature.

## Cách chọn 10 brand

Pool 25 brand DTC lớn, probe header `powered-by: Shopify` / fingerprint `cdn.shopify.com`, xếp theo Tranco top-1M (2026-09-30). **Không phải top toàn thị trường** — muốn thế cần Store Leads. Mỗi brand audit 1 home + 1 collection + 1 PDP (HTML SSR, curl). Chi tiết từng brand (bảng 9 check + evidence URL/giá trị): `jobs/2026-10-01-top10-brands/<domain>.md`.

## Bảng tổng

| # | Brand | Tranco | Stack | Product rating trong schema | Collection ItemList | H1 ok | Alt PDP | llms.txt | AI bot rule | Blog |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | fashionnova.com | 11,691 | Hydrogen | ✅ 4.21/383, ProductGroup 34 variant | ✅ 60 SP | ✅ | 68% | custom (link list), full 404 | none | 24 bài, 09-18 |
| 2 | jbhifi.com.au | 12,923 | Liquid custom | ✅ 4.9/10, gtin, 67 spec | ❌ | ❌ home 0 | n/a (SSR 1 ảnh) | **custom** + template full | none | ~3.7k, 09-30 |
| 3 | gymshark.com | 23,625 | Next.js headless | ✅ 3.8/54 + 2 Review, ProductGroup | ❌ (chỉ FAQPage) | ❌ coll 2 | 71% | 404 | none | 385, 09-30 |
| 4 | aloyoga.com | 24,725 | Liquid custom + Builder.io | ❌ (có Bazaarvoice) | ❌ | ❌ 0 cả 3 trang | 33% SSR; home 0/57 | template | none | 459, 09-02 |
| 5 | skims.com | 29,347 | Hydrogen | ✅ 4.6/208, ProductGroup 9 gtin | ✅ | ✅ | 62% (alt rò "FOCUS: 0.0, 1.0") | 404 | none | 72, dừng 05-07 |
| 6 | wearfigs.com | 32,076 | Next.js App Router | ❌ **0 JSON-LD trên PDP** | ❌ | ❌ | 50% | 404 | none | không có |
| 7 | stevemadden.com | 32,546 | Liquid (Dawn fork) | ✅ 4.8/218, Q&A để sai key `q_and_a` | ✅ 15 SP | ❌ 6–7 H1 | 59% | template | none | 10 bài |
| 8 | fentybeauty.com | 42,347 | Liquid custom + Yottaa | ✅ | ✅ 50 SP | ❌ coll 0 | **89%** | template | **allow 23 AI bot** | 14, 09-28 |
| 9 | glossier.com | 48,445 | Liquid custom | ❌ (có Yotpo) | ❌ 0 JSON-LD | ❌ home+coll 0 | 50% | template | none | 4, dừng 2023 |
| 10 | ohpolly.com | 61,082 | Liquid custom | ⚠️ trùng ProductGroup+Product, group invalid | ❌ | ✅ | 33% | template | none | 0 |

PageSpeed: PSI API trả 429 (hết quota ngày, key chung) cho cả 10 → xem mục Lighthouse.

## Lighthouse (local, mobile, homepage)

Lighthouse 12, simulate throttling, chạy từ Mac ở VN, 1 lần/site. Điểm tuyệt đối thấp hơn PSI/CrUX — chỉ dùng so tương đối.

| Brand | Perf | LCP | CLS | TBT |
|---|---|---|---|---|
| glossier.com | 34 | 9.7 s | 0.046 | 1,910 ms |
| wearfigs.com | 29 | 11.5 s | 0.159 | 2,870 ms |
| jbhifi.com.au | 28 | 50.2 s | 0.036 | 12,480 ms |
| gymshark.com | 28 | 25.0 s | 0.071 | 5,390 ms |
| aloyoga.com | 28 | 15.2 s | 0.113 | 12,210 ms |
| fentybeauty.com | 27 | 13.4 s | 0.005 | 4,410 ms |
| fashionnova.com | 25 | 11.5 s | 0 | 4,050 ms |
| stevemadden.com | 25 | 19.2 s | 0.023 | 23,260 ms |
| skims.com | 21 | 9.1 s | 0.135 | 10,110 ms |
| ohpolly.com | — | — | — | — (`CHROME_INTERSTITIAL_ERROR`, bị bot wall) |

Cả 9 site đo được đều 21–34/100 trên mobile, TBT 1.9–23 s (third-party script: 10–20 vendor/site). Headless (Hydrogen/Next.js) không nhanh hơn Liquid. Brand top chấp nhận perf mobile kém — pitch "tăng điểm PageSpeed" không phải thứ họ ưu tiên; nhưng TBT do app bên thứ 3 là vấn đề chung, kể cả mid-market.

## Đếm theo mảng app

| Mảng | Số liệu 10 brand | App liên quan |
|---|---|---|
| Schema rating | 7/10 có AggregateRating; 3 thiếu dù có review app (Alo/Bazaarvoice, Glossier/Yotpo, FIGS). 9/10 **0 Review node** | seo (schema) |
| Schema variant | 3/10 ProductGroup đúng (đều headless); 1 invalid (Oh Polly); 6 Liquid là Product phẳng | seo |
| Collection | 6/10 thiếu ItemList; 5/10 thiếu BreadcrumbList ở collection | seo |
| H1 | 7/10 lỗi (0 H1 hoặc 2–7 H1) | seo audit |
| Meta desc | 6/10 lỗi: 163–356 ký tự hoặc 8 ký tự/thiếu (Glossier home title+desc = "Glossier") | seo meta AI |
| Alt ảnh PDP | trung vị ~60%; chỉ Fenty ≥85%; lỗi pipeline: alt = metadata CMS (SKIMS), alt = H1 lặp ×7–8 (FIGS, Oh Polly), alt = filename | image-optimizer |
| LCP ảnh | Gymshark lazy-load cả ảnh hero PDP, 0 fetchpriority | image / speed |
| llms.txt | 2 custom, 5 template Shopify, 3 không có (đều headless) → **0/10 có llms.txt chứa catalog/policy** | AEO |
| AI bot robots | 1/10 cấu hình (Fenty allow 23 UA); 0/10 chặn | AEO |
| Render client-side | 4/10 (JB Hi-Fi, Alo, Oh Polly grid; FIGS schema) | AEO / seo |
| Blog | 6/10 ra bài tháng 9; 4/10 chết/không có (SKIMS, Glossier, Oh Polly, FIGS) | blogs |

## Việc đề xuất

Một hướng: **đóng gói "gap của brand top" thành default + audit trong app seo/AEO** — đó là thứ merchant mid-market (khách thật của mình) còn thiếu hơn.

1. **AEO — đã verify 2026-10-01:** app đè được (upsert `templates/llms.txt.liquid` vào main theme, `const/llmsTxt.js:17`), nhưng opt-in. Probe 2000 shop đang cài: trong 1.454 shop live, **82% vẫn serve template Shopify**, chỉ 88 (6%) mang chữ ký output của app. Việc: bật mặc định khi sync xong + phát hiện mất override khi merchant đổi theme.
2. **seo schema:** merge rating + Review từ app review (Yotpo/Okendo/Judge.me/Bazaarvoice) vào Product; ItemList + BreadcrumbList cho collection; ProductGroup/hasVariant cho Liquid.
3. **Audit "AI crawler view":** fetch không-JS, báo trang nào mất grid/ảnh/schema. Chưa thấy đối thủ làm.
4. **image-optimizer:** rule phát hiện alt rác (trùng H1, filename, metadata CMS), không chỉ alt rỗng.

## Giới hạn

- Pool 25 brand tự chọn, xếp Tranco — không đại diện cả thị trường.
- 1 trang/loại, đọc HTML SSR; số alt/H1 có thể khác sau render JS.
- SKIMS geo-redirect IP về `/en-vn` → số liệu bản VN.
- PSI hết quota; Lighthouse chạy local 1 lần/site (máy Mac, mạng VN) — chỉ so tương đối, không so được với CrUX. Oh Polly không đo được.
