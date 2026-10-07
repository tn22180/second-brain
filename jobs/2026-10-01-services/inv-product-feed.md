# Inventory engine: repo `product-feed` (Avada Product Feed)

- Tree: `origin/master` @ `6e17a5b` (2026-10-07). Không checkout, chỉ đọc qua `git show`/`git grep`.
- Path tương đối `packages/functions/src/` trừ khi ghi rõ.
- Tôi spot-check lại trên master 11 citation then chốt: chatgptCsvFormatter, googleFeedSchema, feedCrossChecks, devZoneGuard, productSyncService, googleChannelAdapter, openRouter, settingsController, shopifyWebhookService. Cả 11 đúng.

**TL;DR**
- **Engine phần lớn đã channel-agnostic.** Google, Meta, ChatGPT đều chạy theo cùng một kiểu: dựng file → host trên GCS → kênh tự fetch hoặc app đẩy qua SFTP.
- **ChatGPT đã có ~80%:** mapping CSV đủ cột, SFTP qua OpenAI Ads API, đọc kết quả upload.
- **Non-Shopify:** backend chỉ cần adapter ghi vào `feedProducts` (M). Chặn thật nằm ở auth/tenant (L) và UI embedded (L).
- **Validation:** bắt được 3/10 lỗi team tìm ra. 4 lỗi không có rule nào: lone-variant, space trong URL, title thiếu brand, chỉ 1 ảnh.
- **Billing chưa có**, và có 2 lỗ cho merchant tự gỡ trần (mục 7).

> CLAUDE.md của repo còn ghi "publish qua Merchant API v1 `productInputs:insert`". Thông tin này **đã lỗi thời**: trong `src` có 0 lần xuất hiện `productInputs`, và direct API đã bị gỡ (`docs/features/remove-direct-api.md:3-5`).

## 1. Channels

| Channel | Build | Delivery | Đọc approval |
|---|---|---|---|
| `google` | `googleChannelAdapter.transform` (`services/channelAdapterRegistry.js:19-23`) | Dùng Merchant API v1 **dataSources + `fileInput.fetchSettings`**, tức file-fetch XML (`services/googleChannelAdapter.js:660-695`). Giới hạn 2 fetch/ngày (`:763`). | Gọi Reports API v1 `reports:search` (`:1205`). Query: `SELECT id, offer_id, title, aggregated_reporting_context_status, item_issues FROM product_view WHERE feed_label = '<feedLabel>'`, có thể thêm `AND offer_id IN (…)` (`:1188-1197`) |
| `facebook` (Meta) | Adapter riêng (`channelAdapterRegistry.js:24-28`) | Graph `POST {catalogId}/product_feeds` với `schedule` là chuỗi JSON (`services/metaProductFeedService.js:253-256`, `:103-105`). Feed override dùng `override_type` COUNTRY/LANGUAGE (`:80-84`, `:242`). Feed supplement dùng `SUPPLEMENTARY_FEED` (`:249-250`). Catalog do `metaCatalogProvisionService.js` provision. | `GET {catalogId}/products` lấy `retailer_id,name,errors,visibility,image_fetch_status,review_status` (`services/facebookChannelAdapter.js:564-570`) |
| `xml` ("Any platform") | Dùng schema Google | Chỉ host file | Không có (`readStatus: null`, `channelAdapterRegistry.js:29-38`) |
| `chatgpt` | `services/chatgptCsvFormatter.js` | SFTP qua OpenAI Ads API, hoặc merchant tự dán URL CSV (xem mục 5) | Chỉ có tổng theo lần upload, bấm tay. Không có status từng item (`readStatus: null`, `channelAdapterRegistry.js:40-44`) |
| `tiktok` | Chỉ có hằng `CHANNEL.tiktok` (`const/feed.js:308`). Gọi `getAdapter` sẽ ném `NonRetryableError` (`channelAdapterRegistry.js:50-60`). | — | — |
| pinterest, microsoft/bing | Không có trong code. Chỉ có một comment ở `services/trackingService.js:379`. | — | — |

Code migrate `dataSourcesByFeedId` vẫn còn để chuyển feed cũ sang (`docs/features/remove-direct-api.md:31-40`).

## 2. Source coupling

**Catalog vào bằng đường nào**
- Chỉ có **một đường duy nhất**: Shopify GraphQL bulk op.
  - Field list: `buildProductFields` (`services/productSyncService.js:126-178`)
  - Query: `buildBulkProductsQuery` (`:242-247`)
  - Gọi bulk: `bulkOperationRunQuery` (`services/shopifyBulkService.js:15`)
  - Parse JSONL: `helpers/bulkJsonl.js:106-119`
- **Không có webhook product.** `TOPIC_PATHS = []` (`services/shopifyWebhookService.js:16-23`), comment ở `productSyncService.js:96-97` ghi "There is no incremental (webhook) sync". Hệ quả: thay đổi catalog trễ tới khoảng 1 ngày.
- Lịch chạy: `handlers/schedule/hourlyCron.js:175` gọi `startProductSync`.
- Markets lấy từ `services/marketsService.js:19`. Giá theo nước lấy qua `contextualPricing` (`productSyncService.js:164`).
- Translations lấy từ `services/translationSyncService.js:253-257`.

**Model sau chuẩn hoá**
- Tạo ở `normalizeGraphqlProduct` (`productSyncService.js:705-802`).
- Ghi qua `batchUpsertFeedProducts` (`repositories/feedProductRepository.js:163-200`) vào collection `feedProducts`.
  - Doc id `{shopId}_{shopifyVariantId}` (`:49-51`).
  - **Mỗi variant một doc**, dùng chung cho mọi feed của shop.
- Trạng thái theo từng feed nằm riêng ở `feedProductViews`, id `{feedId}_{offerId}` (`repositories/feedProductViewRepository.js:130`).

Danh sách field (`productSyncService.js:743-793`):

| Nhóm | Field |
|---|---|
| Định danh | `shopifyProductId`, `shopifyVariantId`, `variantPosition`, `offerId`, `itemGroupId`, `sku`, `barcode` |
| Nội dung | `title`, `variantTitle`, `description`, `seoTitle`, `seoDescription`, `handle`, `link` |
| Ảnh | `imageLink`, `imageWidth`, `imageHeight`, `additionalImageLinks` |
| Giá / tồn kho | `price`, `compareAtPrice`, `pricesByCountry{CC:{price,compareAtPrice,currency}}`, `availability`, `inventoryQuantity`, `inventoryTracked`, `inventoryItemId` |
| Phân loại | `vendor`, `productType`, `googleProductCategory`, `categoryPath`, `tags`, `collections`, `options` |
| Metafield | `metafields`, `variantMetafields`, `collectionMetafields` |
| Trạng thái | `shopifyStatus` |
| Field thêm ngoài normalize | `contentHash`, `syncedAt` (`:1571-1572`); `shopId`, `updatedAt` (`feedProductRepository.js:181-186`); `translations` |

**Pipeline sau chuẩn hoá: không phụ thuộc Shopify**
- Bắt đầu từ `generateFeedFile` (`services/feedFileService.js:558`) → `loadFeedItemPipeline` (`:450`).
- Áp rule (`foldRuleOverride` `:187`), rồi adapter `transform` (`googleChannelAdapter.js:392`).
- Precheck chặn hoặc giữ lại item (`feedFileService.js:943`, `:984`).
- Dựng XML ở `services/xmlFeedFormatter.js`. File này thuần, không import gì của Shopify (`:11-12`).
- Đẩy lên GCS `feeds/{shopId}/{feedId}.xml`, public-read (`helpers/storage.js:33-48`, `:84-110`).

**Câu trả lời:** được. Adapter Woo Store API / CSV / JSON-LD chỉ cần ghi đúng shape doc `feedProducts`, phần mapping + validation + XML + hosting dùng lại nguyên.

**Các điểm cần cắt**

| Điểm cắt | Việc | Effort |
|---|---|---|
| Adapter mới gọi `batchUpsertFeedProducts` (`repositories/feedProductRepository.js:163`) | Map nguồn sang shape row ở trên. Đặt `shopifyVariantId` = id ổn định, `shopifyStatus='active'` | M |
| `startProductSync` / `runProductSyncPage` (`services/productSyncService.js:1250`, `:1401`) và cron `hourlyCron.js:175` | Rẽ nhánh theo `shop.platform`. Dùng lại `sweepOrphanFeedProducts` (`:604`) | M |
| Tên field `shopifyProductId/VariantId` ở `services/feedGenerationService.js:76,132-147,190,270-276`, `services/productScopeResolver.js:74`, `googleChannelAdapter.js:107,121`. Tách số khỏi GID ở `feedGenerationService.js:92-95` | Giữ tên cũ vẫn chạy được. Đổi tên trung tính là tuỳ chọn | S |
| `link` / `shopifyDomain` (`productSyncService.js:406-408`, `feedFileService.js:64-66`) | Adapter tự set `link`. Shop doc set `domain`, code đã có sẵn fallback | S |
| `googleProductCategory` lấy từ Shopify taxonomy (`productSyncService.js:779`) | Adapter tự set, hoặc map từ category Woo | S |
| Markets / translations / `baseCurrency` (`googleChannelAdapter.js:409-411`) | Bỏ. Mỗi feed một market, adapter điền `pricesByCountry` | S |
| Shop doc + `initShopify` (`services/shopifyService.js:31-36`) | Tạo shop doc không có token. Chặn mọi call Shopify theo platform | M |
| Tenant/auth: `verifyEmbedRequest` (`handlers/api.js:34`), `shopifyAuth` (`handlers/auth.js:34`), `ctx.state.user.shopID` (`helpers/auth.js:10-11`) | Cần login riêng để phát hành `shopID`. MCP OAuth (`mcp/oauth.js`) là tiền lệ trong repo | **L** |
| UI `packages/assets` (App Bridge + Polaris embedded) | Cần bản standalone. Phương án khác: chạy dạng dịch vụ do team vận hành, không cho khách vào UI | **L** |
| Billing | Chưa có gì (mục 6). Phải tự dựng, ví dụ Stripe | M |

Ghi chú:
- Nếu bán dạng **managed service** (team vận hành, khách không login), có thể bỏ được 2 hạng mục L. Khi đó chỉ còn 2 hạng mục M (adapter, sync branch) và 4 hạng mục S.
- Tenant non-Shopify dùng `shopId` riêng, ví dụ có prefix khác. Mọi read/write đều keyed theo `shopId`, nên được cô lập mà không cần đổi schema.
- Nguồn JSON-LD scrape thiếu `inventoryQuantity`, `barcode` và ảnh variant, nên precheck sẽ chặn nhiều item hơn.

## 3. Validation / auto-fix

Có 48 rule `checkable:true` ở `const/precheckRules.js`. Rule được phát ra từ `services/feedHealthService.js`, `const/precheckRuleChecks.js` và `services/feedCrossChecks.js`. Hợp đồng auto-fix nằm ở `const/feedAutofixChecks.js:52-60`.

**Rule registry.** Ký hiệu: G = Google, M = Meta, FH = `feedHealthService.js`, PRC = `precheckRuleChecks.js`, FAC = `feedAutofixChecks.js`, AIG = `aiAutofixGenerators.js`.

| Code | Kênh | Sev | Fix | Registry / phát |
|---|---|---|---|---|
| `missing_title`, `missing_description` | G+M | crit | suggest từ seoTitle/seoDesc (FAC:342-343) + AI (AIG:130, :113) | 242/253; FH:432, 440 |
| `missing_brand` | G | crit | suggest = tên shop (FAC:341). FH:455 ghi `auto`, lệch với registry | 264; FH:450 |
| `missing_image/price/availability/link` | G+M | crit | sửa ở Shopify | 281-317; FH:458-488 |
| `out_of_stock` | G+M | crit | sửa ở Shopify | 329; FH:530 |
| `invalid_gtin_checksum/length`, `reserved/coupon/bulk_gtin` | G+M | crit | manual/suggest | 343-391; PRC:147 |
| `ambiguous_gtin` | G+M | warn | **auto**: thêm số 0 ở đầu (FAC:129) | 403 |
| `item_duplicate_by_gtin` | G+M | crit | manual | 428 |
| `invalid_availability` | G+M | crit | manual | 441; PRC:197 |
| `invalid_condition` | G+M | crit | auto: map từ đồng nghĩa (FAC:173, 247) | 453 |
| `invalid_encoding` | G+M | crit | **auto**: bỏ ký tự private-use (FAC:114, 231) | 540; PRC:322 |
| `invalid_url`, `invalid_url_with_ip` | G+M | crit | auto: sửa imageLink tương đối hoặc bắt đầu bằng `//` (FAC:148, 246) | 553/564; FH:518 |
| `text_value_too_long` | G+M | warn | **auto** cắt (FAC:252) + AI rút gọn title (AIG:190) | 575; FH:505 |
| `invalid_attribute_value` (sale_price) | G+M | crit | sửa ở Shopify | 588; PRC:233 |
| `unit_pricing_base_measure_without_measure` | G | warn | manual | 604; PRC:263 |
| `item_group_…_conflicting_attributes`, `same_image_varying_color` | G+M | crit/warn | manual | 669/680; `feedCrossChecks.js:89,95` |
| `google_category_unrecognized`, `missing_google_product_category` | G+M / G | crit/warn | AI (AIG:167, 147) | 718/810; FH:555-575 |
| `missing_apparel_color/size/gender/age_group` | G | warn | AI suggest (AIG:234-281) | 757-798; FH:587-615 |
| `missing_gtin_and_mpn` | G | warn | manual | 821; FH:547 |
| `identifier_exists_false_misuse` | G | warn | manual | 832; PRC:249 |
| `shipping_weight_too_high`, `missing_shipping`, `missing_tax` | G | warn/crit | manual | 884/944/954 |
| `meta_missing_universal_id` | M | crit | suggest | 1089; PRC:452 |
| `meta_description_html` | M | crit | **auto**: strip tag (FAC:236, 272) | 1108 |
| `meta_item_group_id_too_long`, `meta_description_uppercase`, `meta_description_same_as_title`, `meta_price_out_of_range` | M | crit/warn | manual/suggest | 1131-1192 |
| `meta_id_conflicts_group_id`, `meta_currency_mismatch` | M | crit/warn | manual | 1212/1232 |
| `image_link_roboted`, `landing_page_roboted` | G+M | crit | sửa ở Shopify | 1390/1402; PRC:583 |
| `image_link_too_small/too_big` | G+M | warn | sửa ở Shopify | 1439/1452; PRC:350 |

ChatGPT **không có validator riêng**: `feedHealthService.js:416` chấm feed ChatGPT bằng rule của Google.

**Đối chiếu 10 lỗi tìm được khi test 5 store non-Shopify (1.213 item)**

| # | Lỗi | Bắt? | Sửa? | Ghi chú |
|---|---|---|---|---|
| 1 | Thiếu identifier, cần ra `identifier_exists=no` | Một phần: warning `missing_gtin_and_mpn` (FH:547) | **Không** | Mode Auto trả `Boolean(gtin\|\|mpn\|\|brand)` (`const/googleFeedSchema.js:139`). Brand mặc định = Vendor (`const/feedDefaults.js:146`), nên gần như luôn ra `true` và XML không bao giờ ghi `no` (`xmlFeedFormatter.js:300`). **Lỗ thật**: rule phải bỏ brand ra khỏi điều kiện. |
| 2 | `variant_dict` rỗng | — | Có | Fallback `{variant: title}` (`chatgptCsvFormatter.js:201-207`). Cần kiểm fallback này có hợp spec không. |
| 3 | Group chỉ có 1 variant | **Không** | Chỉ ChatGPT | Rule `item_missing_variant_with_item_group_id` bị tắt (`feedCrossChecks.js:80-83`). ChatGPT bỏ `group_id` (`chatgptCsvFormatter.js:238-239`). Google/Meta vẫn ghi `item_group_id` cho mọi item (`productSyncService.js:785`). |
| 4 | Space trong image URL | **Không** | **Không** | Chỉ kiểm `^https?://` (FH:518). Không có `encodeURI` ở đâu. CSV chỉ encode dấu phẩy (`chatgptCsvFormatter.js:261`). |
| 5 | Gift card / $0 | $0: có (`missing_price`, FH:466) | Loại item $0 (`googleChannelAdapter.js:950`, `chatgptCsvFormatter.js:186-188`) | Gift card có giá > 0 thì không phát hiện. |
| 6 | HTML trong description | Có | Có | Strip lúc sync (`productSyncService.js:717`), ChatGPT strip thêm lần nữa (`chatgptCsvFormatter.js:113`), Meta có auto-fix. |
| 7 | `preorder` vs `pre_order` | Có, `invalid_availability` theo enum từng kênh (`precheckRuleChecks.js:20-23`) | Chỉ ChatGPT | ChatGPT map đủ `preorder`/`pre_order`/`backorder` (`chatgptCsvFormatter.js:93-99`). Shopify sync chỉ sinh `in_stock`/`out_of_stock` (`productSyncService.js:765`), nên **adapter non-Shopify phải tự chuẩn hoá enum**. |
| 8 | Apparel thiếu gender/age_group | Chỉ Google, chỉ 6 nước (FH:107, 587) | AI suggest (AIG:265, 281) | Mapping default đang tắt (`feedDefaults.js:166-167`). |
| 9 | Title thiếu brand (96%) | **Không có rule** | **Không** | Title mặc định = "Product title + Variant name" (`feedDefaults.js:144`). AI chỉ đặt brand lên đầu khi title rỗng (AIG:134). |
| 10 | Chỉ 1 ảnh | **Không có rule** | **Không** | Chỉ có `missing_image`. |

Tổng: sửa trọn 3/10 (#2, #5, #6), một phần 3 (#1, #7, #8), không có gì 4 (#3, #4, #9, #10).

Lệch doc: `docs/features/gmc-required-fields.md:22` dẫn `googleFeedSchema.js:127`, thực tế hàm nằm ở `:130`.

## 4. AI

- **Provider: OpenRouter.** Model mặc định `qwen/qwen3.7-flash`, đổi qua env `OPEN_ROUTER_MODEL`. Giá $0.03/$0.13 mỗi M token in/out (`config/openRouter.js:13-20`). Client đặt `maxTokens` 2048, temperature 0.2 (`services/openRouterClient.js:26`).
- **Phạm vi:** chỉ là auto-fix theo issue (`const/aiAutofixGenerators.js:113-281`):
  - title: missing, quá 150 ký tự (`:190-193`), `non_product_data`
  - description: missing, giới hạn 5000 (`:125`)
  - `googleProductCategory`
  - apparel: color, size, gender, ageGroup
- **Không** có tính năng tối ưu title/description để tăng hiệu quả bán (chèn brand/attribute, viết lại cho CTR).
- Giới hạn: `MAX_PRODUCTS = 25` mỗi request, `CONCURRENCY = 5` (`services/aiAutofixService.js:17-19`).
- **Không trừ credit:** grep `credit` trong `src` ra 0.
- **Không gọi APC:** grep `ai-product-copy|aiProductCopy` ra 0.
- Muốn bán "AI optimized title" thì phải viết thêm generator mới, hoặc gọi engine của APC.

## 5. ChatGPT channel: đã có gì, còn thiếu gì

**Đã có:**
- **Mapping** (`services/chatgptCsvFormatter.js`):
  - Header đủ cột spec, trừ `dimensions` (`:19-82`).
  - `title` ≤150, `description` ≤5000, strip HTML (`:84-85`, `:113-120`).
  - Enum availability map đúng (`:93-99`), giá trị lạ thành `unknown` (`:232`).
  - `price` qua `formatPrice` (`:233`).
  - `seller_name` = tên shop (`feedFileService.js:585`).
  - Cờ: `is_eligible_search=true`, `is_ads_eligible=true`, `is_eligible_checkout=false` (`:234-237`).
  - `group_id` / `listing_has_variations` / `variant_dict` (`:238-241`).
  - Bỏ item giá ≤0 (`:186-188`).
- **Delivery** (`services/openaiAdsService.js`):
  - Merchant dán Ads API key. Base URL `https://api.ads.openai.com/v1`, verify key qua `GET /ad_account` (`:23-26`, `:35`, `:98`).
  - `POST /feeds` (`:115`).
  - `POST /feeds/{id}/sftp_access` để lấy credential SFTP (`:529-563`).
  - Upload `.csv` bằng `ssh2-sftp-client` (`:679-703`).
  - Push chạy sau mỗi lần publish (`services/xmlLaneService.js:65-66`, `:100-117`). Nếu không có key, merchant dán URL CSV được host (`const/feed.js:320-335`).
- **Status:**
  - `GET /feeds/uploads` trả `rows_accepted`, `rows_rejected`, `rows_ads_eligible`, `diagnostics` (`openaiAdsService.js:151`, `:402-410`).
  - Chỉ chạy khi gọi tay `POST /api/feeds/:id/openai-status` (`controllers/openaiAdsController.js:109-118`).

**Còn thiếu:**

| Hạng mục | Tình trạng | Effort |
|---|---|---|
| Mapping | Gần đủ. Cần kiểm 3 điểm: format price có đúng "79.99 USD" không; `item_id` của variant; fallback `variant_dict` `{variant:"Red / M"}` có hợp spec không | S |
| Builder | CSV thô, **chưa gzip/jsonl/parquet**: grep trong `feedFileService`, `storage`, `openaiAdsService` ra 0 | S (thêm `.csv.gz`) |
| SFTP delivery | Đã chạy. Nhưng push chỉ xảy ra khi publish, mà shop trial **không có auto-sync theo lịch** (`const/feed.js:146`). Spec "full snapshot ≥ daily" chỉ đạt khi bật `unlockedAutoSync` | S |
| Status | Chỉ có tổng theo file, bấm tay. Cần poll tự động và map `diagnostics` thành feed issues | M |
| Status từng item | Chưa có | L |
| Validator ChatGPT riêng | Chưa có: thiếu rule brand, seller_name, URL encode | S-M |

Rủi ro: `sftp_access` và `/feeds/uploads` **chưa có tài liệu**. Comment `openaiAdsService.js:46-52` ghi "seen live (QA, 2026-10-06)". OpenAI đổi response là vỡ.

## 6. Plan / limits

**Không có plan trả phí.** grep `appSubscriptionCreate`/`confirmationUrl` ra 0. `subscriptionController` / `middleware/subscriptionValidation.js` chỉ là CRUD scaffold, không chặn gì (`routes/api.js:57-60`).

| Trạng thái | Feeds | SKU | Khác |
|---|---|---|---|
| Trial (mặc định) | 10 (`const/feed.js:79`, `services/productSyncService.js:868-870`) | 100 cho cả shop (`FREE_SKU_LIMIT`, `productSyncService.js:808`, `:828`) | Không auto-sync (`const/feed.js:146`); 5 template (`services/templateService.js:24`); 5.000 ảnh render/tháng (`services/renderQuotaService.js:80`) |
| CS bật `unlockedFeeds` | 10 | Không giới hạn (`productSyncService.js:846`) | |
| CS bật `unlockedAutoSync` | | | Có auto-sync (`services/autoSyncService.js:26`) |
| CS chỉnh `feedLimit` / `renderImageLimit` | Tuỳ chỉnh (`controllers/devController.js:159-160`) | | Render tối đa 100k (`renderQuotaService.js:89`) |
| `growthHackingDisabled=true` (toàn app) | | Không giới hạn | Auto-sync cho mọi shop (`repositories/appSettingsRepository.js:29`) |

- Mọi channel đều mở ở trial (`const/feed.js:305-317`).
- FE có early-bird "6 tháng free", nhưng không có code nào thu tiền sau đó (`packages/assets/src/const/plan.js:28`).

## 7. Security / risk

| # | Vị trí | Vấn đề | Ảnh hưởng |
|---|---|---|---|
| 1 | `controllers/settingsController.js:46`, `const/feed.js:161` | `renderImageLimit` không bị strip khỏi `PUT /settings` | Merchant tự nâng quota render lên 100k/tháng; Avada trả chi phí CPU/Storage |
| 2 | `middleware/devZoneGuard.js:62-64`, `routes/api.js:211,263` | Khi `trustShopEmail` bật, guard tin email shop (chưa verify) có đuôi domain Avada | Shop tự unlock SKU/feed/auto-sync, lật được `growthHackingDisabled` cho toàn app |
| 3 | `config/shopify.js:8`, `.env.example:6` | `accessTokenKey` fallback trùng giá trị công khai trong `.env.example` | Nếu env prod thiếu key thì token Shopify được mã hoá bằng key public. **Cần kiểm env prod** |
| 4 | `helpers/storage.js:108-110` | Fallback cấp public-read ở mức bucket | Nếu bucket cấp `allUsers` thì có thể list được feed của mọi shop. **Cần kiểm IAM bucket** |
| 5 | `services/googleChannelAdapter.js:1190,1197` | Query `product_view` nối chuỗi `feedLabel`/offerId | Giá trị do app sinh, rủi ro thấp; nên escape |
| OK | `publicFeedController.js:31-33`, `webhookKoaMiddleware.js:72-78`, `mcp/oauth.js:52-61`, `clientApiController.js:67` | Token 32 byte so sánh constant-time, HMAC + `timingSafeEqual`, secret MCP theo từng shop | — |
| OK | toàn repo | grep `shpat_`/`AIza`/`GOCSPX`/PEM/private_key | Không có credential thật nào bị commit |

Lỗ #1 và #2 phải vá **trước khi bán plan**, nếu không merchant tự gỡ trần được. Fix: thêm `renderImageLimit` vào danh sách strip, chuyển `PUT /app-settings` và `/dev/*` sang `requireStaffAccess`.
