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
- **Dev point:** 1 · **Tester point:** — (chưa có tester)
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

### 4. `[DEV][SEO] Research AutoPilot: benchmark Booster SEO, đối chiếu code + prod, chốt kiến trúc và gói`

- **Type:** Task · **App:** SEO · **Assignee:** tuannv
- **Nguồn:** `jobs/seo/auto_pilot.md` (research 2026-09-23) · spec `docs/superpowers/specs/2026-09-23-autopilot-design.md`
- **Liên quan:** MR !2312 (Draft) — phần build tạo task riêng khi ra khỏi Draft
- **Dev point:** — · **Tester point:** —

**Description**

```
h3. Mục tiêu

Bảng giá Pro quảng cáo "Autopilot optimization" ({{PlanFeatures.json:137-140}}) nhưng không có tính năng nào phía sau. Research: đối thủ làm gì, app mình đã có gì, cái gì chạy thật ở prod, từ đó chốt AutoPilot nên xây thế nào.

h3. 1. Benchmark Booster SEO AutoPilot

Một trang, mỗi module 1 toggle / mode: Image alt, Meta title/description (Off / AI / template / Shopify default), Protect manually edited fields, Target keywords, Broken links → redirect, Image compression + rename, URL optimization. Sản phẩm mới tự chạy, sản phẩm có sẵn phải bấm "Run Optimizer".

Điểm yếu của họ (chỗ mình làm hơn được): không preview, không lịch sử / undo, không giới hạn phạm vi theo collection/tag, không thấy trước credit AI, đổi URL không nói rõ 301, redirect 404 về trang chủ.

h3. 2. Đối chiếu với code seo (master {{0547925a9cb}})

Kết luận: research UX đúng, kiến trúc lõi sai — ~70% tính năng Phase 1–3 đã có sẵn. AutoPilot = *control plane gom module có sẵn*, không phải engine mới.

||Hạng mục||Code thật||
|Meta template cho sp mới|Có, render-time Liquid, không ghi Shopify, không cần webhook|
|Bảo vệ meta sửa tay|Có ({{ovrProductIds}})|
|Bảo vệ alt sửa tay|Một phần — bỏ qua mọi ảnh đã có alt|
|Alt + nén ảnh sp mới|Code có, *trigger chết*: subscription products/create gỡ 2025-03-23|
|Preview / undo|Có trong bulk-fix (snapshot before/after)|
|Bulk sp có sẵn|Có, cap 50 sp/job|
|Ước tính credit|Có; low-credit alert: không|
|Đổi URL + 301|Có khi app đổi handle|
|Redirect 404 tự động|Có (weekly Pro+, daily Enterprise), target cố định|
|Trang AutoPilot|Không có|

Sai của research ban đầu: hash chống loop không cần cho products/create; {{products/update}} bắn theo mọi đổi giá/tồn kho → phải có filter; đổi tên ảnh không cần re-upload ({{fileUpdate}}); "target keyword = tên sp" kém hơn focus_keyword + GSC → bỏ.

h3. 3. Verify prod (avada-seo, 2026-09-23)

* {{webhookCreateProductGen2}}: *0 request / 30 ngày* → alt + nén ảnh sp mới chết ở prod.
* {{autoSchedule.autoOptimize}} week/month: handler không cron nào gọi, UI {{return null}}.
* Redirect 404 tự động chỉ chạy khi {{permanentlyRedirect.isDevZoneEnabled=true}} — chỉ DevZone nội bộ bật được, merchant không tự bật.
* Meta template: chạy.

h3. 4. Quyết định chốt

* v1: hồi sinh {{products/create}} (alt / nén / audit realtime), trang AutoPilot gom card, nút "Run for existing" dùng {{startOptimizeImage}} thay vì bulkAuditFix (bulkAuditFix không làm alt/nén, 27 credit/sp).
* v2 theo feedback: Content audit (0 credit), Speed monitor (PSI homepage, mail khi tụt ≥10), Overview dashboard với counter riêng {{autopilotStats}}.
* PO 2026-09-30: AutoPilot vào bảng giá — Pro: weekly speed & 404; Enterprise: daily.
* Không làm: hồi sinh {{handleWeeklyJobs}} (Lighthouse tự host 4GiB), {{products/update}} ở v1.

h3. Output

* {{jobs/seo/auto_pilot.md}} — benchmark + đối chiếu code + verify prod
* Spec {{docs/superpowers/specs/2026-09-23-autopilot-design.md}} (+ amendment 2026-09-30)
* Plan {{docs/superpowers/plans/2026-09-24-autopilot.md}}, {{2026-09-30-autopilot-v2.md}}
```

---

# Tổng tháng 9 — toàn bộ việc (quét 2026-10-01)

Nguồn: 140 MR tạo bởi `tuannv` trên git.avada.net 01–30/09 (124 merged · 15 opened · 1 closed; seo 99, blogs 16,
APC 10, AEO 8, img 3, cdn 2, worker-sdk 1, bug-fix-agent 1) đối chiếu 43 task FAL giao `tuannv` tạo trong tháng.
Task Archived bỏ qua. Mục 1–3 ở trên nằm trong bảng B. Việc trên MR cùng branch chạy nhiều app (cùng một thay đổi) gộp thành 1 task.

## A. Đã có task FAL — gắn MR / kéo status / điền point

Sync 2026-10-05. Bỏ task Archived (thêm FAL-814, FAL-1041 bị archive từ lần quét trước).
Point: task `[BUG]` → dev 1; có tester (tranggt/dungtt/trangdt) trong assignees → tester 1. Task `[DEV]` để trống.

| FAL | Status | Assignees | Dev | Test | MR | Ghi chú |
|---|---|---|---|---|---|---|
| [FAL-920](https://space.avada.net/browse/FAL-920) shipping theo điều kiện `[DEV]` | Done | tuannv | — | — | seo !2304 !2329 !2332 | |
| [FAL-943](https://space.avada.net/browse/FAL-943) Content length lệch | Done | tranggt,tuannv | 1 | 1 | seo !2325 | |
| [FAL-1029](https://space.avada.net/browse/FAL-1029) variant @id | Done | tuannv | 1 | — | seo !2340 | |
| [FAL-1013](https://space.avada.net/browse/FAL-1013) Fix with AI / score range | Done | tranggt,tuannv | 1 | 1 | seo !2333 | |
| [FAL-918](https://space.avada.net/browse/FAL-918) bulk FAQ 404 | Done | tranggt,tuannv | 1 | 1 | seo !2306 | khớp theo nội dung |
| [FAL-912](https://space.avada.net/browse/FAL-912) MCP lộ token settings | Done | tranggt,truongnn,tuannv | 1 | 1 | seo !2300 | khớp theo nội dung |
| [FAL-911](https://space.avada.net/browse/FAL-911) Optimize All bỏ sót ảnh | Done | tranggt,tuannv | 1 | 1 | seo !2214 !2266 !2268 !2297 !2299 !2339 | chia MR ảnh lúc gắn |
| [FAL-942](https://space.avada.net/browse/FAL-942) ảnh tối ưu xong vẫn hiện chưa | Done | tuannv,tunglv | 1 | — | seo !2296 !2346(opened) !2347(opened) | |
| [FAL-898](https://space.avada.net/browse/FAL-898) LocalBusiness myshopify URL | Done | tranggt,tuannv | 1 | 1 | seo !2291 | |
| [FAL-863](https://space.avada.net/browse/FAL-863) meta rác vẫn trừ credit | Done | tranggt,tuannv | 1 | 1 | seo !2255 | |
| [FAL-835](https://space.avada.net/browse/FAL-835) missing meta title `<input>` | Done | tranggt,tuannv | 1 | 1 | seo !2225 (falcon-bot, opened) | khớp theo nội dung |
| [FAL-761](https://space.avada.net/browse/FAL-761) internal key AEO | Done | tuannv | 1 | — | AEO !130 !132 | |
| [FAL-748](https://space.avada.net/browse/FAL-748) rotate integration token | To Do | tuannv | 1 | — | seo !2246 !2248 | **lệch**: 2 MR gắn `[FAL-748]` nhưng là worker health/retune → gắn lại sang task fleet (B5) |

Đã nhận về tuannv (2026-10-05), point đã ghi Jira:
| FAL | Status | Dev | Test | MR |
|---|---|---|---|---|
| [FAL-829](https://space.avada.net/browse/FAL-829) AI Inline 500 (Blog) | To Do | 1 | — | blogs !881 |
| [FAL-881](https://space.avada.net/browse/FAL-881) meta CTA (SEO) | To Do | 1 | — | seo !2295 |

Task người khác, đích link cho bảng B: [FAL-526](https://space.avada.net/browse/FAL-526) MCP (Reviewing) ← B7.

## B. Đã tạo 2026-10-05 (FAL-1064 → FAL-1083)

| # | Summary đề xuất | Type · App | Dev | Test | MR |
|---|---|---|---|---|---|
| 1 · [FAL-1064](https://space.avada.net/browse/FAL-1064) | `[DEV][SEO] Filter product tables by stock status` | Task · SEO | — | — | seo !2262 (chi tiết mục 1 ở trên) |
| 2 · [FAL-1065](https://space.avada.net/browse/FAL-1065) | `[BUG][SEO] Audit product list rỗng khi có locale — 1 translation timeout giết cả trang` | Bug · SEO | 1 | — | seo !2263 (mục 2) |
| 3 · [FAL-1066](https://space.avada.net/browse/FAL-1066) | `[DEV][SEO] Rotate token dev store + đo lộ token merchant qua log` | Task · SEO | — | — | — (mục 3) |
| B3 · [FAL-1067](https://space.avada.net/browse/FAL-1067) | `[DEV][SEO] Security phase 4 SEO: Firestore/Storage rules, scope rules theo shop, proxy auth, XSS JSON-LD/FAQ, credit self-grant, SSRF` | Task · SEO | — | — | seo !2316–!2324 !2330 !2334–!2337 |
| B4 · [FAL-1068](https://space.avada.net/browse/FAL-1068) | `[DEV] Security: GDPR redact callback + XSS/injection cho AEO, Blog, APC, img` | Task · (4 app) | — | — | AEO !141, blogs !910, APC !208, img !286 |
| B5 · [FAL-1069](https://space.avada.net/browse/FAL-1069) | `[DEV][SEO] Worker fleet: stuck-slot leak, phantom load, health Redis, retune RSS, deploy timeout + dọn đĩa follower` | Task · SEO | — | — | seo !2215 !2216(opened) !2217 !2218(opened) !2246 !2248 !2261 !2271 !2311, worker-sdk !1 |
| B6 · [FAL-1070](https://space.avada.net/browse/FAL-1070) | `[DEV][SEO] Job dock: registry shopJobs, review hint, đếm đúng counter, release run chết` | Task · SEO | — | — | seo !2256 !2264 !2265(closed) !2269 |
| B7 · [FAL-1071](https://space.avada.net/browse/FAL-1071) | `[DEV][SEO] MCP OAuth: credit gate, refresh-token DoS, TTL, endpoint APP_BASE_URL, form-action Shopify` | Task · SEO | — | — | seo !2227 !2231 !2232 !2234 !2236 !2237 !2241(opened) — link [FAL-526](https://space.avada.net/browse/FAL-526) |
| B9 · [FAL-1072](https://space.avada.net/browse/FAL-1072) | `[BUG][SEO] Optimize: thay file bằng source rỗng làm mất ảnh merchant (20 shop)` | Bug · SEO | 1 | — | seo !2314 |
| B10 · [FAL-1073](https://space.avada.net/browse/FAL-1073) | `[DEV][SEO] Image: Free plan quota 1 lần + TS AI dev-zone cấp image quota` | Task · SEO | — | — | seo !2315 !2345 |
| B11 · [FAL-1074](https://space.avada.net/browse/FAL-1074) | `[BUG][SEO] seo.meta metafield bị wipe câm: Speed Up save đè, customOpenHours crash, mất write không dấu vết` | Bug · SEO | 1 | — | seo !2289 !2293 !2294 |
| B12 · [FAL-1075](https://space.avada.net/browse/FAL-1075) | `[DEV][SEO] Structured data: chọn Product/ProductGroup, exclude theo page type, itemCondition, bỏ comment HTML storefront` | Task · SEO | — | — | seo !2239 !2302 !2305, blogs !901 |
| B13 · [FAL-1076](https://space.avada.net/browse/FAL-1076) | `[DEV] Crisp: tag segment no-ai cho store staff Shopify + fix widget mở 2 conversation` | Task · (5 app) | — | — | seo !2238 !2278(opened), blogs !893, APC !198, AEO !125, img !281 |
| B14 · [FAL-1077](https://space.avada.net/browse/FAL-1077) | `[DEV] Cross-sell banner Product Feed (SEO, Blog, Speed) + APC render từ config localized` | Task | — | — | cdn banner-cross-sell !1 !2, APC !206 |
| B15 · [FAL-1078](https://space.avada.net/browse/FAL-1078) | `[BUG][AEO] Rescan nhân đôi chain khi Pub/Sub redeliver + encode handle + PubSub client leak` | Bug · AEO | 1 | — | AEO !122 !138 !140 |
| B16 · [FAL-1079](https://space.avada.net/browse/FAL-1079) | `[DEV][AEO] AI Referral: verify app embed Tracker trên trang AI referral` | Task · AEO | — | — | AEO !133 |
| B17 · [FAL-1080](https://space.avada.net/browse/FAL-1080) | `[DEV][Blog] Related keywords list 1 call + related post fetch lỗi không trắng editor + dev zone TS AI` | Task · Blog | — | — | blogs !879 !899 !908, !883 (falcon-bot) |
| B18 · [FAL-1081](https://space.avada.net/browse/FAL-1081) | `[DEV][SEO] Dọn: xoá router /chatbot chết, xoá 2 legacy ScriptTag từ Dev Zone, swagger /api/seo-issues` | Task · SEO | — | — | seo !2298 !2301 !2327 |
| B19 · [FAL-1082](https://space.avada.net/browse/FAL-1082) | `[DEV][SEO] Audit: extract copy SEO issue để dịch + label AI content meta coverage` | Task · SEO | — | — | seo !2228 !2249 |
| B20 · [FAL-1083](https://space.avada.net/browse/FAL-1083) | `[DEV][SEO] Research AutoPilot: benchmark Booster SEO, đối chiếu code + prod, chốt kiến trúc và gói` | Task · SEO | — | — | — (chi tiết mục 4); build = MR !2312 Draft, tạo task khi ra Draft |

Bỏ task review (2026-10-05): bundle/multistore, affiliate v2, GSC v2.
Bỏ qua (tooling team/cá nhân, không FAL): bug-fix-agent !9 (chạy bot native launchd), harness, prod-error-autofix.

## Tổng point tháng 9 (đọc Jira 2026-10-05, cả 35 task đều Done)

| Nhóm | Task | Dev point |
|---|---|---|
| A — task có sẵn | 15 | 19 |
| B — tạo mới FAL-1064→1083 | 20 | 115 |
| **Tổng** | **35** | **134** |
