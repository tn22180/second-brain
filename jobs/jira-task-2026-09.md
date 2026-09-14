# Jira queue — tháng 9/2026

Cuối tháng kéo file này ra tạo task FAL bằng skill `jira-create` (batch). Mỗi entry đủ field cho
payload: summary Solar, app, issuetype, MR, dev/tester point, description (Jira wiki markup, paste thẳng).
Point đánh dấu *(đề xuất)* — chốt lại lúc tạo.

---

## 1. `[DEV][SEO] Filter product tables by stock status (in / out of stock)`

- **Type:** Task · **App:** SEO · **Assignee:** tuannv
- **MR:** https://git.avada.net/avada/seo/-/merge_requests/2262 · branch `feat/alt-filter-stock` · commit `aeac11e288`
- **Dev point:** 3 *(đề xuất)* · **Tester point:** 1 *(đề xuất)*
- **Feature doc:** `docs/features/product-stock-filter.md`
- **Nguồn:** Feature Request — *SEO Suite – Filter alt texts by Product pages that are in/out of stock*

**Description**

```
h3. Yêu cầu

Feature request: merchant muốn lọc product theo tình trạng tồn kho để chỉ tối ưu / xem những sản phẩm còn bán được.

Ban đầu FR nhắm vào trang alt text; chốt lại đặt filter ở *bảng product của SEO Audit và AI Content* (cả hai render chung {{Audit/Products/List.js}}, sửa 1 chỗ ăn 2 trang).

h3. Cách làm

List product là live Shopify {{products(query:"...")}} search, không đọc Firestore → thêm 1 entry vào allowlist search-field trong {{convertQueryToQueryQL}}. Không sync inventory, không webhook, *không thêm scope* ({{read_products}} đã cover {{inventory_total}} / {{tracks_inventory}} — bảng này vốn đã sort được theo {{INVENTORY_TOTAL}}).

||UI||Shopify search fragment||
|In stock|{{(tracks_inventory:false OR inventory_total:>0)}}|
|Out of stock|{{(tracks_inventory:true AND inventory_total:<=0)}}|

Hai điểm predicate phụ thuộc:
* {{tracks_inventory}} nằm trong predicate: product tắt tracking báo {{totalInventory:0}} vĩnh viễn, {{inventory_total:<=0}} trần sẽ gắn nhãn hết hàng oan cho digital / made-to-order. Shopify admin coi untracked = available; predicate theo đúng thế.
* Cụm giữ trong ngoặc: search syntax Shopify {{OR}} ưu tiên cao hơn {{AND}} ngầm giữa các điều kiện, bỏ ngoặc là các filter đứng trước mất tác dụng với nửa kết quả.

{{analysisController.getList}} strip param khi {{type !== 'product'}} — {{getCollectionList}} / {{getPageList}} đẩy {{ctx.query}} thẳng vào converter, Shopify đá cả query nếu lọt {{inventory_total}}.

h3. Ngoài scope (quyết định)

Select-all bulk (AI fix ở Audit, Generate ở AI Content) *không* tôn trọng filter. Bulk build query riêng ở {{buildBulkFilterQuery}}, chỉ đọc title/type/vendor/status. Lọc In stock rồi Select all → bulk vẫn chạy cả catalogue. Ghi trong feature doc; follow-up 1 dòng nếu thành ticket CS.

h3. Verify

* Jest 189 suite / 1666 test pass, trừ 2 fail sẵn trên master ({{shopify2026Client.test.js}} assert {{'2026-01'}} vs code {{'2026-07'}}; {{workListStore.test.js}} mock storage).
* Suite mới {{graphQLConvert.test.js}} 13 case: 2 predicate, AND với filter khác, bẫy precedence, value lạ bị drop, collection block-query. Pin luôn 6 hành vi cũ chưa có test.
* Live shop {{linhnguyen11.myshopify.com}} 302 active product, đúng hình query {{getProductList}} sinh ra: in 23 + out 279 = 302, overlap 0, thiếu 0. Naive {{inventory_total:<=0}} ra 297 → gắn nhãn sai đúng 18 product untracked của shop.
* {{vite build}} 2 shell OK; docs-gate PASS 534 citation.
* i18n: 4 key {{Audit.*}}, dịch đủ 12 locale.

h3. Test gợi ý cho tester

# SEO Audit → Products: filter Stock status = In stock → mọi row còn hàng hoặc không track inventory.
# Out of stock → mọi row track inventory và tồn = 0.
# Ghép với Vendor / Product type / Status → vẫn đúng.
# AI Content → cùng filter, cùng hành vi.
# Chip applied filter hiện đúng, remove chip → list về full.
# Collection / Page tab không có filter, không lỗi.
```

---

## 2. `[BUG][SEO] Audit product list rỗng khi có locale — 1 translation request timeout giết cả trang`

- **Type:** Bug · **App:** SEO · **Assignee:** tuannv
- **MR:** https://git.avada.net/avada/seo/-/merge_requests/2263 · branch `fix/audit-list-locale-fanout` · commit `05bad61b31`
- **Dev point:** 2 *(đề xuất)* · **Tester point:** 1 *(đề xuất)*
- **Phát hiện:** 2026-09-14, khi test MR !2262 trên local — báo là "sort theo inventory không ra", sort là red herring.

**Description**

```
h3. Triệu chứng

Bảng product SEO Audit / AI Content thỉnh thoảng trả *rỗng* khi request có {{lang=en}}, không hiện lỗi. Ban đầu tưởng sort {{INVENTORY_TOTAL}} hỏng.

h3. Root cause

{{prepareDataWithSEOAnalysis}} fan-out mỗi product. Có {{locale}} thì {{getTranslationLocales}} bắn *thêm 1 Admin API call mỗi product* ({{lang}} rỗng thì return [] sớm — nên {{lang=}} chạy, {{lang=en}} chết). Call đó nằm trong {{Promise.all}} từng row không catch → 1 connection timeout là reject row, reject {{Promise.all}} ngoài, reject cả request. {{getList}} catch trả {{{"data":[],"errors":"Cannot get products"}}} (42 byte) → bảng trắng cho mọi product trên trang.

Reproduce trên emulator: {{AggregateError [ETIMEDOUT]}} từ {{GetTranslatableResource ... locale:"en"}}, response 42 byte chỉ khi {{lang=en}}, đầy đủ khi {{lang}} rỗng, không phụ thuộc sortKey.

h3. Fix

# 2 lượt đọc translation mỗi row thành best-effort: fail → {{logger.warn}} (shop, product id, code) + fallback rỗng. Row render không dịch thay vì kéo cả trang.
# {{getTranslationLocales}} null-safe: {{makeGraphQlApi}} trả {{{errors}}} không có {{data}} khi GraphQL lỗi, chuỗi cũ nổ {{TypeError}} cùng bán kính.
# Catch log {{message}} / {{code}} / {{stack}} thay vì object.

h3. Security (mục 3)

Axios error mang request config, {{console.error}} in cả — gồm header {{X-Shopify-Access-Token}}. Dòng này đã in token Admin API thật ra plaintext trong log emulator lúc reproduce. Trên prod, cùng dòng đó ghi token merchant vào Cloud Logging mỗi lần path này timeout. MR chặn lần sau, *không* dọn cái đã lộ → xem follow-up dưới.

h3. Không đổi

* {{axios timeout: 0}} — thêm timeout đụng mọi Shopify call, MR riêng.
* {{getList}} nuốt lỗi thành 200 rỗng — đổi response shape, chưa quyết.

h3. Verify

* TDD: 8 test viết trước, 6 đỏ đúng bug (kể cả test tái hiện token trong log), 8/8 xanh sau fix.
* Full suite 190 suite / 1661 test = master + 2 suite + 8 test; 2 fail là 2 cái sẵn trên master.

h3. Test gợi ý cho tester

# Store đa ngôn ngữ, Audit → Products với locale không phải primary → list luôn có data.
# Đổi sort / filter liên tục 10 lần → không lần nào rỗng.
# Product thiếu bản dịch → row vẫn hiện (nội dung gốc).
```

---

## Follow-up không có MR (tạo task riêng, không link MR)

### 3. `[DEV][SEO] Rotate token dev store + đo mức lộ token merchant qua log prepareDataWithSEOAnalysis`

- **Type:** Task · **App:** SEO · **Assignee:** tuannv · **Due:** 2026-09-30
- **Liên quan:** MR !2263 (chặn lần sau, không dọn cái đã lộ)
- **Dev point:** 1 *(đề xuất)* · **Tester point:** 0

**Description**

```
h3. Bối cảnh

{{packages/functions/src/helpers/analysis.js}} — catch của {{prepareDataWithSEOAnalysis}} log nguyên object error của axios, mang {{config.headers['X-Shopify-Access-Token']}}. Mỗi lần path này timeout (request có {{lang}}) là token Admin API merchant bị in plaintext. Phát hiện 2026-09-14: token dev store {{linhnguyen11.myshopify.com}} in nguyên văn trong log emulator local. MR !2263 chặn lần sau.

h3. Việc cần làm

# *Rotate token dev store* {{linhnguyen11.myshopify.com}} (token {{shpat_f7b70c1c…}}) — gỡ app + cài lại hoặc regenerate ở Partner dashboard, verify app local chạy lại.
# *Đo mức lộ trên prod* — Cloud Logging project {{avada-seo}}:
{code}
resource.type="cloud_function" OR resource.type="cloud_run_revision"
textPayload:"ERROR prepareDataWithSEOAnalysis" OR jsonPayload.message:"ERROR prepareDataWithSEOAnalysis"
{code}
#* Đếm dòng, đếm shop (distinct token / url host), khoảng thời gian.
#* Check log sink prod-error (có ở mọi project prod) — token có lọt sang sink / Slack alert không.
# *Quyết định*: theo số shop, chọn (a) rotate hàng loạt qua re-auth hoặc (b) chấp nhận + xoá log entries. Ghi vào comment task.
# Grep Blog / APC / AEO / img cho pattern {{logger.error(..., error)}} với axios error — cùng lớp bug, không riêng SEO.

h3. Done khi

* Token dev store đã rotate, app local chạy lại.
* Có số: bao nhiêu merchant token đã vào log prod, từ ngày nào.
* Có quyết định rotate/không kèm lý do.
```
