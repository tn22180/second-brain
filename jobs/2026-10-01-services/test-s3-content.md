# S3: AI Content (viết lại product copy + bài blog SEO), test trên 10 store

Ngày 2026-10-01. Engine: `ai-product-copy` origin/master `1744d88`, `blogs` origin/master `ae18fb047`. Output nằm ở `scratchpad/s3/out/`.

## Kết luận
- **Bán được cho store ngoài Shopify, đã kiểm chứng.** 10/10 store lấy được product data, engine thật chạy được 10/10 product và 5/5 bài viết. Engine không bị khoá vào Shopify. Chỗ dính Shopify là I/O (Firestore, `shop`, publish), phần prompt thì không.
- **Chưa bán ngay được vì hallucination.** 7/10 description có social proof bịa ("Users praise…", Skullcandy còn có 1 câu trích dẫn giả của khách). Nguyên nhân là template Problem-Solution có slot `[Testimonial or proof point]` mà prompt không có rule cấm bịa review. Bắt buộc phải có bước người duyệt.
- **Chi phí LLM gần như bằng 0:** khoảng $0.0015/product (desc + meta), khoảng $0.018/bài viết. Cái tốn tiền thật là công QA.
- **Công productize: M**, khoảng 2–3 tuần dev, xem cuối file.

## Cách chạy (đã chạy thật, không phải mô phỏng)
- **APC:** esbuild bundle `src/services/aiService.gateway.js` → `generateContent` thật. Không sửa prompt. `settings=defaultSettings`, template `PRODUCT_TEMPLATE_2` (Problem-Solution) + `PRODUCT_SEO_DESCRIPTION_TEMPLATE_1` (Basic Benefit), tao chọn. Model do code tự resolve: có ảnh → `openai/gpt-4.1-mini`, không có ảnh → `google/gemini-2.5-flash-lite`. Brief ghi "gemini-2.5-flash", nhưng với DEFAULT_MODEL `gpt54Mini` thì code thực tế route như trên.
- **Blog:**
  - KB: `knowledgeBaseService.getPromptCrawler` + `openAiService.responses.create({model:'gpt-4o-mini', tools:[web_search_preview]})`, gọi y như `knowledgeBaseController.get` → OpenRouter `/responses`.
  - Outline: `GenFullBlogService.getPromptOutline` + `getCompletion(..., ollamaRoute: GEN_SUGGESTED)` → Ollama Cloud `gemma4:31b`.
  - Article: `LangGraphService.workflow.invoke` (createPrompt → callModel → format → metadata, model `google/gemini-2.5-flash`).
  - Score: `seoScore.service.scoreArticle` (lib `blog-score`).
- **Lệch so với prod:**
  - Main keyword và secondary keyword tao chọn tay, theo category của store. Không dùng Google Ads. Prod gợi ý secondary keyword bằng LLM.
  - Bỏ hết ảnh: `generateContentImages:false`, không chạy featured-image node.
  - KB lấy từ URL public. Prod dùng `shop.shopifyDomain` trước.
- **Shim để chạy local:**
  - `node_modules` local thiếu `sanitize-html` (master đã thêm), cài vào scratch.
  - Stub `lib/const/shopify`.
  - Viết plugin loader cho `.graphql`.
  - Unset `GOOGLE_APPLICATION_CREDENTIALS`, `GCLOUD_PROJECT=s3-offline-test`, nên không thể ghi vào Firestore.
- **Tổng 40 LLM call** (≤60): 20 APC + 5×4 blog. Không ghi Firestore/Shopify/GCP, không publish.

## Kết quả theo store

| Store | Platform | Lấy được product data? | Engine | Chất lượng copy 1-5 | Article score + chất lượng 1-5 | Token / chi phí |
|---|---|---|---|---|---|---|
| sigmabeauty | Shopify | Có: `.json` + JSON-LD | real, gpt-4.1-mini (ảnh) | 3: đúng 4 tên brush; bịa "Many users have praised"; "control shine" không có trong nguồn; meta 166c | — | 4950 in / 352 out, $0.0025 |
| skullcandy | Shopify | Có | real, gpt-4.1-mini | **2**: trích dẫn khách giả trong ngoặc kép; vendor `Skullcandy US` lọt vào copy; spec đúng (40W/30h/IP67) | **58**, 3: bài chung chung, nhắc Skullcandy 0 lần | 3045/330, $0.0012 + bài ≈$0.019 |
| brooklinen | Shopify | Có (không có JSON-LD Product, dùng `.json`) | real, gpt-4.1-mini | 3: "Customers praise"; "without sacrificing breathability" trái với nguồn ("warmer") | **53**, 4: đúng 480TC/long-staple, nhắc Luxe/Classic | 3406/391, $0.0014 + ≈$0.020 |
| yogamatters | Shopify | Có | real, gpt-4.1-mini | 3: "Users praise" bịa; còn lại đúng | — | 3165/301, $0.0012 |
| bensgarden | Shopify | Có | real, gpt-4.1-mini | 3: "Many customers cherish" bịa; mất chi tiết "signed by Ben/NY studio"; meta 164c | — | 3609/314, $0.0019 |
| jococups | WooCommerce | Có: JSON-LD (269 ký tự) | real, nhưng ảnh fail → gemini-flash-lite | 3: lọt nguyên label template "Key Features & Benefits: Solutions and Results"; mở bằng "Tired of" (prompt đã cấm); 36 từ nguồn → 245 từ, độn chữ | **58**, 3: "lifetime solution… for a lifetime" là claim kiểu bảo hành, không có nguồn | 2938/1831, $0.0010 + ≈$0.019 |
| thegoodbatch | **Squarespace** (brief ghi Magento, sai) | Có: JSON-LD 129 ký tự | real, ảnh fail (http://) → flash-lite | **2**: markdown `**` lọt vào HTML; "Moist, spiced" không có nguồn; 20 từ → 190 từ | — | 2843/1763, $0.0010 |
| planetbike | BigCommerce | Có: không có JSON-LD, scrape `productView-description` | real, gpt-4.1-mini | **4**: spec đúng hết (400lm, 2200mAh, 3.5h, IP66, 145g, 275°); chỉ có "Riders praise" là bịa | **58**, 4: gọn (1106 từ), có số lumen | 6011/588, $0.0027 + ≈$0.015 |
| weber | Salesforce CC | Có: JSON-LD 1047 ký tự | real, gpt-4.1-mini | **4**: đúng PureBlu/Flavorizer/grease tray; "Users appreciate" bịa; "minimizes flare-ups" không có nguồn | **51**, 4: hướng dẫn đúng, nhắc Weber/Flavorizer | 3178/442, $0.0014 + ≈$0.019 |
| paulsmith | headless Nuxt | Có: JSON-LD 167 ký tự | real, ảnh fail → flash-lite | 3: dùng đủ "Tired of/Introducing/Discover/Experience" (đều bị cấm); "exceptional longevity" là phóng đại; fact đúng | — | 2897/1820, $0.0010 |

- **Meta description:** 10/10 đúng fact. 3/10 dài quá 160c (161–166). 10/10 kết bằng "Shop now!" (do template).
- **Article:** score 51–58, trung bình 55.6. Độ dài 1106–2071 từ.
- **Chi phí đo được:**
  - APC: tổng $0.0153 cho 20 call (lấy từ `usage.cost` của OpenRouter).
  - KB: đo được $0.0079/lần, khoảng 90% là phí web_search.
  - Article + metadata: **ước tính** $0.007–0.012. `callModelNode` chỉ trả về output token (2183–3485), không có input.
  - Outline chạy trên subscription Ollama nên chi phí biên bằng 0.

## Hallucination: các claim không có trong nguồn
- **Social proof bịa: 7/10.** Đúng 7 lần chạy gpt-4.1-mini: sigma, skullcandy (có trích dẫn giả `"deep, room-filling audio that suits any setting."`), brooklinen, yogamatters, bensgarden, planetbike, weber. Nguyên nhân: `const/templates.js:51` có `- [Testimonial or proof point]`, còn `getPrompt.js` không có rule "không bịa review". **Nếu bán dịch vụ thì đây là rủi ro pháp lý (FTC fake reviews).**
- **Claim tính năng không có nguồn:**
  - sigma: "control shine", "extending their lifespan"
  - brooklinen: "without sacrificing breathability"
  - weber: "minimizes flare-ups"
  - jococups: "heat-resistant grip", "free from metallic aftertastes"
  - thegoodbatch: "Moist, spiced"
  - paulsmith: "exceptional longevity"
- **Không bịa spec số nào.** Mọi con số (40W, 30h, 480TC, 400lm, 2200mAh, IP66/67, 145g) đều khớp nguồn.
- **KB:** "unknown" không xuất hiện lần nào (0/5), dù prompt bảo ghi "unknown" khi thiếu. Đối chiếu tagline với homepage live:
  - brooklinen "Get the best in bed", joco "perfect sip", planetbike "Better Products. Better World.": khớp.
  - skullcandy "Sound that fits your life" và weber "Born to Barbecue": 0 hit trên homepage, coi như bịa hoặc đã cũ.
  - mission/vision: văn chung chung, không kiểm chứng được.
- **Article:**
  - Giọng "we" của brand đưa ra cam kết, merchant phải duyệt: planetbike "We recommend 800–1500 lumens"; joco "lifetime solution".
  - Không bịa sản phẩm nào: 5/5 bài chỉ nhắc sản phẩm có thật (Classic/Luxe, Flavorizer…).

## Bug engine phát hiện khi chạy (ảnh hưởng cả app Shopify hiện tại)
1. **Ảnh bị mất trên store ngoài Shopify.** `helpers/downloadImageAsBase64.js` luôn nối `'&width=' + width`. URL không có `?` (joco `.png`, paulsmith) thành URL hỏng; URL `http://` (Squarespace) thì `http.get` không follow redirect. Kết quả 3/5 store ngoài Shopify âm thầm rơi về text-only `gemini-2.5-flash-lite`, đổi model mà không ai biết. CDN Shopify có sẵn `?v=` nên không dính.
2. **flash-lite ra text bẩn hơn.** Lọt label template (joco), lọt markdown `**` (goodbatch), dùng hết cụm từ bị cấm (paulsmith). seoDescription 150c mà tốn 710–775 completion token, nghĩa là vẫn có reasoning token dù đã set `reasoning_effort:'minimal'`.
3. **Ký tự `n` lạc trong body bài.** Body có literal `>n<` giữa các tag ở 3/5 bài (skullcandy 45, brooklinen 55, planetbike 33 chỗ), publish nguyên thì hiện chữ "n" trên trang. **Cần check bài prod**: chưa xác định do gemini escape hay do parse.
4. **Engine blog và scorer blog lệch nhau.** Engine nhắm 1000–1500 từ (`lengthStructure` default), còn `blog-score` TextLengthCheck chỉ pass khi 600–1000 từ (`MIN_WORDS=600, MAX_WORDS=1e3`). Kết quả 5/5 bài fail `textLength` ngay từ thiết kế. Thêm nữa: metadata sinh meta description 162–180c → 5/5 fail `metaDescriptionLength`; prompt không chèn link → 5/5 fail internal/external links.
5. Prompt APC hard-code "You are an SEO-focused **Shopify** copywriter". Với store ngoài Shopify thì vô hại, nhưng nên trung tính hoá.

## Publish ngoài Shopify

| Platform | Product desc + meta | Blog |
|---|---|---|
| WooCommerce/WP | REST `PUT /wp-json/wc/v3/products/{id}`; meta qua `meta_data` của Yoast/RankMath | WP REST `/wp-json/wp/v2/posts`, dùng Application Password. **S** |
| BigCommerce | `PUT /v3/catalog/products/{id}` (`description`, `meta_description`, `page_title`) | `/v2/blog/posts`. **S** |
| Magento/Adobe | `PUT /V1/products/{sku}` custom_attributes | Không có blog native → HTML/CSV |
| Squarespace | Có Commerce Products API (chưa verify quyền ghi description) | Không có write API → copy-paste |
| Salesforce CC, headless (Weber, Paul Smith) | Bên đó tự import CSV/XML (enterprise PIM) | Bàn giao HTML |

Mẫu số chung cho mọi platform: CSV (`sku/handle, title, description_html, meta_description`) + Google Sheet duyệt + file HTML bài viết. Nên bắt đầu bằng cái này, push API làm sau cho Woo/BigCommerce.

## Productize: M (~2–3 tuần)
1. Ingest adapter: Shopify `.json`, sau đó JSON-LD Product, sau đó selector DOM theo platform. Đã có 80 dòng chạy được 10/10. 2/10 không có JSON-LD Product.
2. Runner standalone bọc `generateContent` + LangGraph, không đụng Firestore. Lần test này cần 4 shim, nên tách thành package.
3. Vá chất lượng (S mỗi mục):
   - Rule "never invent reviews/testimonials/quotes", hoặc bỏ slot testimonial khỏi template.
   - Vá `&width` / redirect trong downloadImage.
   - Strip markdown.
   - Fix `>n<`.
   - Thống nhất 600–1000 hay 1000–1500 giữa engine và scorer.
   - Ép meta ≤160c.
4. Export CSV/Sheet + push Woo/BigCommerce/WP (M).
5. **Bắt buộc có người duyệt**: tỷ lệ bịa 7/10 hiện nay không cho phép giao thẳng cho khách.

**Chi phí cho mỗi store:** LLM khoảng $0.0015/product + $0.018/bài. Gói 50 product + 4 bài/tháng vào khoảng **$0.15/store/tháng** (ước tính, chưa gồm phí OpenRouter platform). Định giá dịch vụ theo công QA (≈1–2 phút/product, 10–15 phút/bài), không theo token.

## File
- `scratchpad/s3/out/product-copy-before-after.md`: before/after của 10 product
- `scratchpad/s3/out/apc-results.json`: prompt + output + usage
- `scratchpad/s3/out/blog-{skullcandy,brooklinen,jococups,planetbike,weber}.{json,html}`: KB, outline, bài viết, score, các check fail
- `scratchpad/s3/out/input-products.json`, `scratchpad/s3/raw/`: dữ liệu product đã scrape
