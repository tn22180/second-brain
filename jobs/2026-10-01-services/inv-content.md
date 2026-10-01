# Inventory engine content — blogs + ai-product-copy (APC)

Pin: `blogs` origin/master `ae18fb047`, `ai-product-copy` origin/master `1744d88` (fetch 2026-10-01). Read-only, mọi file:line đọc qua `git show origin/master:`.
Đường dẫn rút gọn: `B/` = `blogs/packages/functions/src/`, `A/` = `ai-product-copy/packages/functions/src/`.

**Kết luận:** lõi AI của cả 2 app là prompt + OpenRouter, gần như không đụng Shopify. Phần dính Shopify nằm ở 3 chỗ: input (đọc product/article), upload ảnh (Shopify Files) và publish (articleCreate/metafield/translationsRegister). Social media: **0**. Email marketing: **0** (chỉ có SMTP transactional).

## Provider chung

- **blogs:** mọi call text đi qua `getCompletion` (`B/services/openAi.service.js:98`) → OpenRouter. Tên legacy được map qua `LEGACY_MODEL_MAP` (`:28`): `gpt-4.1`/`gpt-4o-mini` → `google/gemini-2.5-flash-lite`, `gpt-5.1`/`claude-3-7-sonnet-latest` → `google/gemini-2.5-flash` (cố ý "dispatch fake"). Ảnh dùng `meta/muse-image` (`B/const/aiModels.js`). Endpoint suggest chạy Ollama cloud, fallback sang OpenRouter (`B/config/ollama.js:26`).
- **APC:** `generateFromPrompt` (`A/services/aiService.gateway.js:115`) đi OpenRouter theo mặc định (`resolveProvider`, `:61-64`). Text-only dùng `google/gemini-2.5-flash-lite`. Có ảnh dùng `openai/gpt-4.1-mini`. Riêng shop có `enableGpt41` dùng `openai/gpt-4.1`. Ảnh sản phẩm được tải về base64 rồi gửi kèm (vision).

## Bảng engine

| Capability | Repo | Entry file:line | Input | AI provider/model | Output | Shopify coupling | Effort non-Shopify |
|---|---|---|---|---|---|---|---|
| Brand Knowledge Base từ URL store (identity, audience, tone, pillars, vocabulary) | blogs | `B/handlers/pubsub/subscribeKnowledgeBase.js:19` (call `:35`); prompt `B/services/knowledgeBase.service.js:2` `getPromptCrawler({url})` | **chỉ cần URL public** | `openAiService.responses.create` + tool `web_search_preview`, model `gpt-4o-mini` (raw, **không** qua `resolveModel`, client OpenRouter) | Markdown 7 mục | LOW: chỉ đọc `shop.shopifyDomain` | **S**. Thay `url` là xong. Rủi ro: model id raw `gpt-4o-mini` + Responses API trên OpenRouter chưa verify chạy được. Test 1 call trước khi bán |
| Gợi ý topic / main + secondary keyword / outline / ý tưởng bài | blogs | `B/controllers/genAIBlogController.js:207` `genSuggested` (cases `:250` topic, `:266` mainSeoKeyword, `:305` suggested-outline, `:335` blog-post-idea-outline); `genIdeas` `:537` | knowledgeBase text + topic/keyword | Ollama route → fallback OpenRouter (`gpt-4.1` → gemini-2.5-flash-lite), zod schema | JSON | LOW: chỉ `getShopInfoByShopId` để lấy locale | **S** |
| Keyword research (volume, competition, trend) | blogs | `B/services/googleAdService.js:30` `getKeyWordsSuggestion({keyword, geo_target_constants, language})` | seed keyword | Google Ads `keywordPlanIdeas.generateKeywordIdeas` (không dùng LLM) | list keyword + metrics (`formatKeywordData` `:75`) | LOW | **S**. Dùng creds Google Ads của Avada. Kiểm quota/ToS nếu resell |
| Viết full bài (prompt → body HTML → metadata → tags) + ảnh trong bài + featured image | blogs | `B/controllers/langGraphController.js:42` `generate` → `B/langgraph/services/LangGraphService.js:24` `streamBlogWithImages`; graph `B/langgraph/workflows/blogWorkflow.js:14` | topic, keywords, outline, knowledgeBase, language | LangGraph + OpenRouter, mặc định `DEFAULT_PRO_TEXT_MODEL` = `google/gemini-2.5-flash`; tags dùng gemini-2.5-flash-lite; ảnh `meta/muse-image` | HTML body + meta title/desc + tags + ảnh | **MED**: ảnh upload Shopify Files trong `B/langgraph/nodes/callModelNode.js:75` và `createFeaturedImageNode.js:23` (`processImageUpload`); publish ở `B/services/genAIBlogService.js:40` `createBlog` | **M**. Thay `processImageUpload` bằng upload GCS, bỏ `saveGeneratedArticle`/`createBlog`, gỡ token gate/credit trong controller. Output là HTML, đem đi đâu cũng dùng được |
| Blog assist (title/desc/outline/intro/conclusion/idea) | blogs | `B/helpers/blog/blogAssist.helper.js` (`header`/`body`/`footer`), route `POST /blog-assist` | topic, keyword, type, language, advanced {tone, audience} | OpenRouter | text variants | LOW | **S** |
| YouTube → bài blog | blogs | `B/controllers/toolsYouTubeController.js:98` `generateContent`; subtitles `B/services/dataYouTubeService.js:357` `getYoutubeSubtitlesV2`; prompt `:391` `getBasePromptTool` | **URL YouTube public** | `useModelAiById` (OpenRouter) | JSON bài | LOW | **S** |
| SEO scoring bài (28 checks, 22 có weight) | blogs | `B/services/seoScore.service.js:41` `scoreArticle({article, shop, skippedChecks})`, lib npm `blog-score@0.1.0` | HTML + meta + keyword | deterministic, không AI | score 0–100 + checks | LOW: `shop` chỉ để lấy domain | **S**. Hạn chế: mọi locale chấm bằng rule tiếng Anh (`docs/features/seo-scoring.md`) |
| AI fix theo issue (meta title/desc, keyword density, độ dài, URL slug) | blogs | `B/services/auditAgent/chains.js:237-333` (`generateMetaDescription`, `generateMetaTags :281`, `generateMetaTitle :296`, `generateDescription :333`), `controlKeywordsDensity :450`, `generateUrl :202`; dispatcher `B/controllers/auditAgentController.js:50` | `pageData` (title, body, meta, keyword) dạng plain | `gpt-5.1` → gemini-2.5-flash | text đã sửa | LOW (`generateUrl` cần thêm domain) | **S** |
| Internal linking (chèn 1 link vào đoạn) | blogs | `B/services/auditAgent/chains.js:635` `fixInternalLinksBlock`; prompt `B/config/auditAgentPrompts/bodyHandlerPrompts.js:387` | block + list `otherArticles` + shopDomain | OpenRouter | HTML block có link | **MED**: list bài lấy từ Shopify | **S-M**. Đưa list URL bài từ sitemap/crawl vào |
| Alt text ảnh (vision, mỗi đợt 10 ảnh) | blogs | `B/services/auditAgent/chains.js:466` `generateImageAltText`; `getVisionCompletion` `B/services/openAi.service.js:230` | URL ảnh public | gemini-2.5-flash vision | alt text | LOW | **S** |
| Sinh ảnh AI | blogs | `B/services/openrouter/image.js:59` `generateOpenRouterImage`; `B/services/imageGeneration.service.js:8` `generateImagesWithAI` | prompt | `meta/muse-image` (~$0.01/ảnh, 2048x1152 WebP, comment trong `aiModels.js`) | buffer/URL ảnh | LOW (riêng upload `:34` thì HIGH) | **S** |
| Nén ảnh | blogs | `B/helpers/optimize/sharp.js:93` `compressImage` | URL ảnh | sharp, không AI | ảnh đã nén | LOW | **S** (APP image-optimizer làm việc này tốt hơn) |
| Dịch bài (chunk HTML 800 ký tự, retry) | blogs | `B/services/translation.service.js:176` `translateContent(content, targetLanguage, contentType)` | text/HTML | `gpt-4.1` → gemini-2.5-flash-lite | HTML đã dịch | LOW: pure function | **S** |
| FAQ cho bài | blogs | `B/controllers/genAIBlogController.js:439` `genFaqsElm` | topic | `GPT_4_1_MINI` | FAQ JSON | LOW-MED (token gate trong controller) | **S** |
| Gợi ý tag bài | blogs | `B/services/tagAi.service.js:33` `suggestArticleTags` | title, content + tag counts của Shopify | `GPT_4_1_MINI` | tags | MED | **S** |
| Scheduling / autopublish | blogs | không có scheduler riêng. Dùng `publishedAt` native của Shopify (`B/helpers/article/isScheduledPublish.js`, `B/mcp/tools/listSchedule.js:14`) | — | — | — | **HIGH** | **L**: phải tự viết cron + publisher |
| Publish bài | blogs | `B/services/genAIBlogService.js:40` `createBlog` | Admin token | — | Shopify article | **HIGH** | **M** cho mỗi target. **0 occurrences** `wordpress\|woocommerce\|magento\|wp-json\|bigcommerce` trong `B/` (hit duy nhất là lib `@wordpress/wordcount` ở FE) |
| Export bài CSV | blogs | `B/handlers/pubsub/subscribeExportAllArticles.js:58` `buildArticlesCsv` | Shopify articles | — | CSV qua email | HIGH ở input | **S** nếu đổi nguồn |
| MCP server (18 tool: draft/outline/optimize/publish/suggest_keywords…) | blogs | `B/mcp/tools/index.js`, `B/mcp/mcp.routes.js` | OAuth theo shop | — | — | **HIGH**: tool nào cũng gắn shop | **L** |
| Mô tả sản phẩm / collection (HTML, có template, special instruction, keyword) | APC | `A/services/aiService.gateway.js:223` `generateContent({data, model, template, language, contentType, pageType, seoKeyword, settings})`; prompt `A/helpers/prompt/getPrompt.js:75` | **product object plain** (title, description, image URL, type, tags, metafields) | OpenRouter `gemini-2.5-flash-lite`, có ảnh thì `gpt-4.1-mini` vision, temp 0.8 | HTML đã sanitize (`sanitizeAIHtml`) | **LOW**: `shopID` chỉ để lấy cờ `enableGpt41`, bỏ trống được (`:134-141`) | **S** |
| Meta description (150–160 ký tự) | APC | `A/helpers/prompt/getPrompt.js:218` (`SEO_DESCRIPTION`) qua `generateContent` | product object | như trên | `<p>` meta | LOW | **S** |
| Template library (7 product + 8 SEO-desc + collection) | APC | `A/const/templates.js:7` trở đi | — | — | template | LOW | **S**: copy được ngay |
| Bulk generate (Pub/Sub tự chain) | APC | `A/handlers/subscribeHandleBulkGenerate.js:37` (gọi AI ở `:319`) | ID product trên Shopify | như trên | metafield staging → publish | **HIGH**: đọc/ghi qua Admin API | **M**: viết lại loop từ CSV/feed, giữ `generateContent` |
| Dịch product copy | APC | prompt `A/helpers/translateUtils.js:12` `getPromptTranslate`; job `A/handlers/subscribeHandleBulkTranslate.js:27` (AI `:102`) | text/HTML | `generateFromPrompt` | HTML đã dịch | prompt LOW / job HIGH (`translationsRegister`) | **S** cho phần prompt |
| Shopify Flow action (auto-gen khi product create) | APC | `A/controllers/flowController.js:14` `generate`, `:72` `generateProductSeoDesc` | webhook Flow | — | — | HIGH | n/a |
| Export mô tả CSV | APC | `A/controllers/generatorController.js:521` `exportDesc`, `:553` `exportAll` | process đã gen | — | CSV | MED | **S** |
| Product title / ad copy / social caption / email copy | APC | **0**. `getPrompt` chỉ có 2 content type là `description` và `seoDescription` (`A/const/type.js:1-2`). `title_tag` chỉ khai báo constant, không có prompt nào sinh title | — | — | — | — | **M**: viết prompt mới trên `generateFromPrompt` |

## Top engine chạy được trên store bất kỳ hôm nay, glue dưới 1 ngày

1. **Product description + meta description (APC)**: gọi `generateContent({data:{title, description, imageUrl, product_type, tags}, contentType:'description'|'seoDescription', pageType:'product', template, language, seoKeyword, settings:{}})` ở `A/services/aiService.gateway.js:223`. Model là `google/gemini-2.5-flash-lite` qua OpenRouter, có ảnh thì `openai/gpt-4.1-mini`. Cần làm: script đọc CSV/feed (Woo/Magento export, hoặc Google Merchant feed) rồi ghi ra CSV. Cần verify `settings` tối thiểu mà `getProductInfoString` (`getPrompt.js:418`) đòi để khỏi throw.
2. **Brand Knowledge Base từ URL (blogs)**: dùng `knowledgeBaseService.getPromptCrawler({url})` (`B/services/knowledgeBase.service.js:2`) kèm `responses.create` + `web_search_preview`. Đây là input cho mọi engine khác (tone, audience). Phải sửa model id raw `gpt-4o-mini` thành `openai/gpt-4o-mini` rồi test 1 call trước.
3. **Keyword → outline → full article HTML (blogs)**: `getKeyWordsSuggestion` (`googleAdService.js:30`) → `genSuggested` case `suggested-outline` (logic nằm ở `genFullBlogService`) → `new LangGraphService(...).streamBlogWithImages(input)` (`LangGraphService.js:24`, gemini-2.5-flash + muse-image). Glue là stub `processImageUpload` sang GCS. Phần này sát mức 1 ngày, các mục còn lại đều gọn trong 1 ngày.
4. **SEO audit + AI fix trên trang bất kỳ**: crawl HTML → `scoreArticle` (`seoScore.service.js:41`, deterministic, npm `blog-score`) → các chain `generateMetaTags`/`generateImageAltText`/`fixInternalLinksBlock` (`chains.js:281/466/635`). Tận dụng được luôn cho landing/product page, không chỉ blog.
5. **Dịch**: `translateContent` (`B/services/translation.service.js:176`) hoặc `getPromptTranslate` (`A/helpers/translateUtils.js:12`). Pure function, giữ nguyên HTML.

Glue chung cho cả 5 engine: bỏ token gate / credit (`isOutOfTokens`, `reduceTokens`, `creditGuardMiddleware`) và env `OPENROUTER_API_KEY`. Không cần Firestore nếu không truyền `shopID`.

## Social media / email marketing: có không?

**Social: KHÔNG CÓ.** Grep `facebook|instagram|pinterest|twitter|tiktok|linkedin` trên `packages/functions/src` của cả 2 repo (đã loại `*.graphql`/`*.json`) chỉ ra:
- blogs `B/const/default.js:57` `openInstagramEmbed: false`: flag embed, không phải post.
- APC `A/helpers/sanitize/htmlPolicy.js:259-264`: whitelist iframe embed tiktok/instagram/facebook.
- FE blogs `PreviewMobile.js:94`/`DesktopLayout..js:81`: icon social trong preview author box.

Không có OAuth, API call hay auto-post nào lên Facebook/Instagram/Pinterest/X. Grep thêm `caption|hashtag|adCopy` cũng không ra prompt nào sinh caption, hashtag hay ad copy.

**Email marketing: KHÔNG CÓ.** Grep `newsletter|klaviyo|mailchimp|sendgrid|omnisend|email marketing|emailCopy` cho **0 occurrences** ở cả 2 repo. `nodemailer` có mặt nhưng chỉ là transactional:
- blogs `B/services/mailService.js:36` `sendExportArticlesEmail` (gửi link export CSV), `B/FeatureReq/onSupportRequestDoneHandler.js:72` (feature request).
- APC `A/services/mailService.js:28` `sendMail` (generic SMTP).

## Hệ quả cho việc đóng gói service

- Bán được ngay: (a) **AI product copy theo feed** (APC engine), (b) **Brand KB + content plan + blog article** (blogs), (c) **SEO content audit + AI fix** (blog-score + auditAgent chains), (d) **dịch**. Cả 4 đều chỉ cần URL hoặc product list. Thứ phải viết là lớp delivery (CSV/HTML/Google Doc), không phải AI.
- Social và email: phải build từ đầu. Prompt dựng trên `generateFromPrompt` mất M. Nếu cần post/gửi thật thì thêm L cho OAuth + scheduler (hiện publish/schedule đều dựa vào Shopify).
- Shopify coupling tập trung ở `processImageUpload` (`B/services/imageGeneration.service.js:34`), `createBlog` và metafield/translationsRegister của APC. Cắt 3 điểm đó là engine chạy độc lập.
