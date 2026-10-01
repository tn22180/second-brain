# Test S1 — SEO & Schema Audit + AI fix pack (10 store)

2026-10-01 · seo `origin/master` + AEO `origin/main` (code tách bằng `git archive`, không checkout) · artefact: `svc/s1/` (`out/seo.json`, `out/aeo.json`, `out/ai.run1.json`, `out/ai.run2.json`, `run/*.js`)

## Kết luận

- **Engine thật chạy được trên 10/10 store** (babel-register + alias `@functions`, Firestore/`@avada/core` stub, ~20 phút để dựng). Không phải replicate hàm nào. Có 2 điểm can thiệp: (1) `getPageContent` được thay bằng HTML mình tự fetch bằng UA trình duyệt, (2) **input** cho axyseo (`paperAttr`) dựng từ crawl vì không có Shopify Admin → cột axyseo = "engine thật, input replicated".
- Kết quả audit **dùng được để bán với Shopify, chưa bán được với non-Shopify**: 3/5 store non-Shopify cho kết quả schema sai (PASS rỗng), 1 store mất hết schema (Microdata), 1 store bị fetcher gốc chặn 403.
- AI fix pack ổn: 10/10 meta title+desc, 19/20 alt; trung bình **3.7/5**, merchant dán được ở 7/10 store. Lỗi chính là bỏ mất tên brand và độ dài desc lệch rule của chính mình.
- Effort productize: **M**. Chi phí LLM: **3 call/store** trên Ollama Cloud `gemma4:31b`; gói thuê bao flat nên chi phí biên ≈ $0, giới hạn thật là concurrency.

## Bảng đánh giá

| Store | Platform (thực tế) | Engine ran? | # issues | Fix quality 1-5 | Blockers |
|---|---|---|---|---|---|
| sigmabeauty.com | Shopify | real | 5 | 4 | — |
| skullcandy.com | Shopify | real | 10 | 5 | — |
| brooklinen.com | Shopify | real | 8 | 3 | JS-render: Product JSON-LD và H1 đều được JS inject → bản HTML tĩnh không có |
| yogamatters.com | Shopify | real | 8 | 4 | Chỉ có `ProductGroup` → AEO `productSchema` FAIL sai |
| bensgarden.com | Shopify | real | 7 | 4 | Như trên (`ProductGroup`) |
| jococups.com | WooCommerce | real | 9 (+4 PASS rỗng) | 4 | URL `/product/` không được `inferPageType` nhận → 4 check AEO PASS với total=0 |
| thegoodbatch.com | **Squarespace + Shopify** (spec ghi Magento — sai) | real | 9 | 4 | Homepage và shop nằm 2 host khác nhau; Org schema chỉ có ở shop |
| planetbike.com | BigCommerce | real | 10 | 3 | Schema là **Microdata** (`itemtype=schema.org/Product`) → cả 3 engine báo "không có schema" (false negative) |
| weber.com | Salesforce CC | real | 6 (+4 PASS rỗng) | 3 | URL `.html` → AEO PASS rỗng; alt thứ 2 lấy trúng ảnh mega-menu (lỗi bộ chọn ảnh của mình, không phải engine) |
| paulsmith.com | Nuxt headless | real* | 7 (+4 PASS rỗng) | 3 | **Gửi request không có UA → 403** (`getPageContent` không set UA). Grid sản phẩm render bằng JS, phải tìm product qua `/api/sitemaps/*.xml` |

`# issues` = số hạng mục lỗi khác nhau từ `analyzeCrawlPages` (đã bỏ `hasImagesNotParamShopify` vì là rule riêng của Shopify) + các mục non-good của on-page `Runner.audit` + số check AEO FAIL. Không tính axyseo, vì engine này báo 12–18 lỗi/trang, phần lớn là nhiễu do chỉ có text mô tả (chi tiết ở dưới).

## Theo từng store

Điểm on-page = `Runner.audit` (trang product, keyword = tên sản phẩm). **Trần thực tế là 91**, không phải 100: `speedScore` (90/1120 điểm) cần artifact `pageSpeed` mà runner lọc bỏ. Điểm axy = `handleAnalysis`.

### sigmabeauty.com — on-page 79 · axy 58
- Issues: ảnh thiếu alt 20 (home) / 13 (product); meta desc product 147 ký tự (on-page đòi 150–160); 1 URL dài; không có FAQPage
- Schema: Product + AggregateRating + MerchantReturnPolicy + Org + Breadcrumb → 5/6 check AEO PASS
- Fix: title `3DHD™ Blender | Beauty Blender | Sigma Makeup Products` → `3DHD Blender for Precise Application | Sigma Beauty` (51); desc 147 → 149 ký tự (vẫn <150, nên chính rule on-page của mình vẫn báo lỗi); alt `3DHD™ Blender` → `A pink 3DHD Blender makeup sponge shown from a side angle against a white background.`

### skullcandy.com — on-page 72 · axy 36
- Issues: title product **139 ký tự**; meta desc 172 (home) / 167 (product); 2 H1 trên cả 2 trang; 2 link `http://`; ảnh thiếu alt 13/12
- Schema: ProductGroup + Product + FAQPage + rating; thiếu BreadcrumbList và MerchantReturnPolicy
- Fix: title 139 → `Crusher 540 Active | Wireless Workout Headphones` (48); desc 175 → 150; alt `Smoke` → `Dusty rose Crusher 540 Active over-ear headphones on a black background`; alt rỗng → `Person holding Crusher 540 Active headphones with water-resistant and breathable icons.`

### brooklinen.com — on-page 81 · axy 44
- Issues: product **không có H1 trong HTML tĩnh**; 12 link `http://`; 2 H1 ở home; 9 URL dài; ảnh thiếu alt 11/5
- Schema: HTML tĩnh chỉ có BreadcrumbList. Product + MerchantReturnPolicy nằm trong `<script>` JS (`structuredData = {...}`), engine không thấy → báo productSchema FAIL. Google render JS nên đây là **false negative**
- Ghi chú: product chọn lần đầu (`luxe-flat-sheet-last-call`) có `noindex,nofollow` — engine bắt đúng. Đã đổi sang `classic-duvet-cover` cho công bằng
- Fix: title → `Classic Percale Duvet Cover - Crisp Cotton Bedding` (**mất brand "Brooklinen"**); desc 132 ký tự; alt main → `Folded white Classic Percale Duvet Cover on a plain light grey background`; alt rỗng → `OEKO-TEX Standard 100 certification logo for textile safety`

### yogamatters.com — on-page 79 · axy 45
- Issues: meta desc product **320 ký tự**; ảnh thiếu alt 47/36; không có BreadcrumbList; không có MerchantReturnPolicy; không có FAQ
- Schema: chỉ có `ProductGroup`. `runStructuredDataChecks` FAIL vì so `@type === 'Product'` chính xác, còn `extractSchemaData` cùng repo lại báo `hasProductSchema: true` → **2 engine AEO cho kết quả ngược nhau**
- Fix: desc 320 → 152; title thêm "in"; alt → `Woman wearing a Teak Olive Marl cropped tank top and matching joggers.`, `Person unrolling a terracotta-colored yoga mat…`

### bensgarden.com — on-page 81 · axy 41
- Issues: home **0 H1** (seoSpeed không bắt, vì chỉ check >1); title product 68; ảnh thiếu alt 33/2; ProductGroup → productSchema FAIL; thiếu Breadcrumb và ReturnPolicy
- Fix: title 68 → 63 (vẫn >60 mà prompt đặt ra); desc 152 → 150; alt main → `Decoupage glass tray with an inspirational quote surrounded by pink flowers`; ảnh logo → `Ben's Garden logo featuring a stylized wheelbarrow illustration`

### jococups.com (WooCommerce) — on-page 68 · axy 44
- Issues: **product không có meta description**; title home **9 ký tự**; desc home 190; ảnh thiếu alt 25/27; 6 link nofollow
- Schema: Yoast đầy đủ (Product, ItemPage, Breadcrumb, Org). AEO: productSchema, breadcrumbList, merchantReturnPolicy, aggregateRating đều **PASS với total=0**, vì `/product/` ≠ `/products/`
- Fix (giá trị cao nhất trong 10 store): desc rỗng → `The Active Flask 17oz features a wide-mouth glass rim and Utility Lid for controlled hydration…` (142); title → `Active Flask 17oz Durable Glass Bottle | JOCO Cups`; alt rỗng → `Dusty pink 17oz Active Flask with a silicone sleeve and JOCO logo`

### thegoodbatch.com (Squarespace + shop Shopify) — on-page 77 · axy 50
- Issues: home 0 H1; meta desc product 102; passive voice; Org schema không có ở homepage Squarespace; thiếu rating, Breadcrumb, ReturnPolicy
- Fix: desc 102 → 130; title gần như giữ nguyên; alt rỗng → `Two golden-brown savory breakfast scones on a wooden cutting board.`, `Two crumble-topped breakfast muffins in decorative paper liners on a white rectangular plate.`

### planetbike.com (BigCommerce) — on-page 74 · axy 49
- Issues: `googleStructureData` bad; 7 URL dài; ảnh thiếu alt 16 trên product; desc 124; nofollow
- Schema: trang **có** Product/Offer/Breadcrumb dạng Microdata (35 `itemprop`). Không engine nào đọc Microdata → báo "không có schema" là **sai**
- Fix: gần như chỉ đảo chữ (`Commuter Pink 700c x 55mm Bike Fenders` → `Commuter Pink Bike Fenders 700c x 55mm`); desc 124 → 137; alt → `Pair of pink commuter bike fenders for 700c x 55mm wheels with black mudflaps` (tốt)

### weber.com (SFCC) — on-page 79 · axy 48
- Issues: home **10 H1**; ảnh thiếu alt 49/52; desc product 136; thiếu FAQ. axyseo báo `schema` bad dù đã truyền `hasProductSchema=true` (nhiễu chưa rõ nguyên nhân)
- Schema: Product + Breadcrumb + Org + VideoObject. AEO PASS rỗng (URL `.html`)
- Fix: title → `Deluxe Grilling Pan for Gas & Charcoal Grills | Weber` (55); desc 145; alt `Deluxe Grilling Pan view 0` → `Weber Deluxe Grilling Pan in silver stainless steel with a basket-weave pattern` (tốt); alt thứ 2 lấy nhầm ảnh menu

### paulsmith.com (Nuxt) — on-page 88 · axy 47
- Issues: title home 73, desc home 221, desc product 167; home 0 H1; Org schema không có ở home; internal link "improve"
- Blocker: request mặc định của `getPageContent` (node-fetch, không có UA) → **403** ở cả home và product. Chỉ chạy được nhờ HTML mình fetch bằng UA trình duyệt
- Fix: desc 167 → 127; title bỏ "Men's"; chỉ làm được 1 alt vì 18/18 ảnh đã có alt → `Muted Artist Stripe silk tie with multi-colored diagonal stripes on a light grey background`

## Non-Shopify vs Shopify

**Chạy tốt ở mọi platform** (dựa trên HTML tĩnh nên không phụ thuộc platform): meta title/desc length, H1 count, alt rỗng, noindex, nofollow, `http://`, URL dài, on-page `Runner.audit`, `extractSchemaData` với JSON-LD, AI meta và alt (`generateMetaTags`, `getImageAlt` nhận URL ảnh bất kỳ; ảnh bigcommerce, weber, paulsmith, wp-content đều ra alt đúng).

**Hỏng hoặc sai** (cần sửa trước khi bán):
1. `structuredDataChecks.inferPageType` chỉ nhận `/products/` → non-Shopify PASS rỗng 4 check (3/5 store). Đây là kết quả sai nguy hiểm nhất, vì báo xanh cho khách.
2. `hasSchemaType('Product')` khớp chính xác → `ProductGroup` FAIL (3/10 store, cả Shopify), trong khi `extractSchemaData` cùng repo thì chấp nhận.
3. Không đọc Microdata/RDFa → BigCommerce Stencil bị báo thiếu schema.
4. `getPageContent` không gửi UA → 403 ở site có WAF (Paul Smith). Trong `seoSpeed.js` đã có hằng `BROWSER_USER_AGENT` nhưng không dùng tới.
5. Không render JS → Brooklinen (Shopify) mất Product schema và H1. Puppeteer có trong deps nhưng chỉ dùng cho nhánh password.
6. Rule riêng của Shopify: `imagesNotParamShopify` báo ở 10/10 store (non-Shopify thì 100% false positive); `queryIdProduct` dựa `aria-labelledby` + Firestore history; system prompt "audits … **Shopify** pages".
7. Ba ngưỡng meta desc khác nhau trong chính code của mình: seoSpeed 50–160, on-page 150–160 (báo improve ở 8/10 store), prompt AI 120–155. Kết quả: **7/10 desc do AI viết bị chính on-page audit báo lại**.
8. Không check H1 = 0 (3 homepage bensgarden, thegoodbatch, paulsmith + product Brooklinen).
9. axyseo chấm dựa trên body_html của Admin. Không có Admin thì body chỉ là text mô tả, nên media, internal link, subheading, FAQ luôn fail (12–18 bad/trang, kể cả Shopify) → không nên đưa vào báo cáo cho khách nếu chưa có extractor nội dung chính.

**Thiếu phần giao hàng:** non-Shopify không ghi ngược vào store được, nên fix pack phải ở dạng CSV/JSON/HTML snippet cho merchant tự dán.

## Effort productize: M (~2–3 tuần cho 1 dev)

- S: fetcher dùng UA trình duyệt; `inferPageType` nhận URL đầu vào + loại trang; chấp nhận `ProductGroup`; thống nhất 1 ngưỡng meta desc; thêm check H1=0; tắt rule riêng Shopify khi không phải Shopify; bỏ chữ "Shopify" trong system prompt
- M: fallback render JS bằng puppeteer có sẵn khi HTML tĩnh thiếu H1/schema; parser Microdata; tìm product URL qua sitemap; xuất report + fix pack (CSV + JSON-LD snippet)
- L (để sau): crawl nhiều trang, ưu tiên theo traffic (GSC)

## Chi phí / store

- LLM: **3 call/store** (1 `generateMetaTags` + 2 `getImageAlt`), model `gemma4:31b` trên Ollama Cloud (CONTENT_MODAL và mặc định của IMAGE_ALT; fallback OpenRouter `gemma-4-31b/26b` **không lần nào phải dùng**). Median 0.83s cho meta, 1.58s cho alt. Ollama Cloud tính theo gói thuê bao → chi phí biên ≈ **$0**, nút thắt là concurrency (Pro 3 slot). Giá OpenRouter của gemma-4 chưa xác minh trong lần này → chưa ghi số $.
- Fetch: 6–12 request/store (home + product + AEO tự fetch lại 2 trang + 2 ảnh cho model + discovery). Không store nào vượt 30.
- Lần test dùng **41 LLM call** (3 thử + 26 run 1 + 12 chạy lại meta với keyword giữ hoa/thường và Brooklinen sau khi đổi product). **Vượt trần 40 một call** do tính nhầm cap giữa các lần chạy.

## Phương pháp, giới hạn

- Mỗi store audit 2 trang: home + 1 product. Keyword = tên sản phẩm (trên prod, keyword do merchant đặt hoặc AI sinh).
- Run 1 đưa keyword viết thường vào, nên AI chèn nguyên "crusher 540 active" giữa câu. Run 2 giữ nguyên hoa/thường; bảng trên dùng kết quả run 2.
- Không ghi Firestore/Shopify/GCP. Key chỉ đọc từ `seo/packages/functions/.env.local` vào process env, không in ra.
