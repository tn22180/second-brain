lọc tất cả các function dùng activity collection firestore cho t, và đánh giá xem có nên bỏ đi không

Scope chốt: repo `seo`, branch `master` (2b0a1f2803b, sync origin). Deliverable = report + khuyến nghị, không sửa code, không query prod (code-only).

**Cập nhật 2026-07-30 (Tuan chốt): tính năng email đã sunset.** Mọi đường đi qua `renderTemplate` /
`getOptimizeReport` / `notifyOptimize` / `POST /email/test` coi như chết. Reader sống duy nhất của
collection `activity` còn lại là **`countImageOTM` gọi từ `shopController.js:115`**. Report bên dưới
đã điều chỉnh theo. Lưu ý về mặt code hai trigger vẫn còn wire ở FE — DevZone
`DTToolsContainer.js:539` (`/dev?x=weeklyScanSeo`) và `Email/SendTest.js:40` (`POST /email/test`) —
nên nếu ai bấm thì code vẫn chạy; sunset ở đây là quyết định product, không phải code đã gỡ.

**Cập nhật 2026-07-30 (b) — sửa lại 2 chỗ sai, verify trên `origin/master` = `2047de0d8a3`.**
Report bên dưới viết trên `2b0a1f2803b`; tree đã đi trước 38 commit (không commit nào chạm
`activity`). Hai claim bên dưới **sai về mặt code** và bị block này override:

1. **"9/10 type write-only" — sai.** `alt` và `filename` vẫn có reader sống: `POST /email/test`
   (`api.js:381`, FE `pages/Email/SendTest.js:40`) → case `report` → `renderTemplate` →
   `getOptimizeReport` (`mailService.js:243`) → `countImageOTM` ×3 cho `image`/`alt`/`filename`;
   case `optimize` → `getActivityByType` ×3 (`emailController.js:49-53`). Chỉ **7/10** type
   (`meta`,`rule`,`structured`,`redirect`,`site`,`social`,`sitemap`) là write-only.
2. **`getActivityByType` / `createActivity` / `deleteOptimizeActivities` không phải Tier 0** —
   đều còn caller sống: `emailController.js:50-52`; nội bộ `updateActivity:91` → `:123`;
   `seoController.resetHistory:593` + `handlers/reset.js:24`.

**Cơ chế sunset đúng ra là:** cron `resetOptimize()` (`handlers/cron/resetOptimize.js:14-17`) chỉ
gọi `resetOptStatus()`, **không gọi `sendEmails()`**. `sendEmails()` (`:19-26`) có đúng 1 caller —
`devController.js:514` (dev-zone `weeklyScanSeo`). Tức là email report **theo lịch** đã chết, còn
nút test email của merchant thì sống.

**Đã thi hành (branch `chore/remove-dead-activity-code` off `2047de0d8a3`, chưa commit):** Tier 0
thu hẹp lại còn phần chết theo wiring — `calculateSavings` (0 caller), comment `getGridActivity`,
`mailService.notifyOptimize:43-95` (0 caller external), FE page `ActivityDetails` (+ loadable,
route, key i18n ở 14 locale), 2 dòng route đã comment ở `api.js`, index `activity`
`shopID+type+updatedAt` trong `firestore.indexes.json`. Kèm P0: `console.log('data', data)` ở
`activityController.js:48`. `console.log` đó đọc BigQuery `activity_events`, **không** liên quan
collection Firestore `activity`.

---

# Report — Firestore collection `activity` (repo `seo`)

## Kết luận

**Bỏ được. Nên bỏ.** Sau khi email sunset, cả collection chỉ còn **đúng một reader sống**:
`countImageOTM(shopId)` gọi từ `shopController.js:115`, trả về một con số duy nhất, dùng cho
**banner upsell**. Mọi thứ còn lại là write không ai đọc.

Bốn sự thật quyết định:

1. **Chỉ type `image` được đọc. `alt`, `filename` và 7 type còn lại là write-only.**
   Reader sống duy nhất là `countImageOTM(shopId)` — `type` default `'image'`
   (`activityRepository.js:199`). Vậy:
   - `updateSeoActivity` (3 call site) ghi `meta`/`rule`/`structured`/`redirect`/`site`/`social`/`sitemap` → không ai đọc.
   - `updateActivity` cho `alt` và `filename` → không ai đọc (reader cũ là email, đã sunset).
   - `bulkCreateActivity` tạo 3 type/ngày, chỉ 1 type có nghĩa.
2. **Collection append-only, không TTL, không compaction.** Cron `resetOptimizeScheduleGen2`
   (`cronFunctions.js:19-22`, schedule `1 1 * * *` = **hằng ngày**) bulk-create **3 doc/shop/ngày**
   vĩnh viễn. `S` shop installed → `1095 × S` doc/năm, không bao giờ xóa. 2/3 số doc đó vô nghĩa.
3. **`countImageOTM` không có `limit`, chạy trên `/shop/appStatus`** — hook `useGetAppStatus` gắn ở
   `MainFrame.js:54`, tức **mọi lần merchant mở app**. Query đọc *tất cả* doc `count > 0` của shop
   đó. Số doc này tăng thêm 1 mỗi ngày shop có optimize. Chi phí mỗi lần mở app tăng đơn điệu,
   không có trần.
4. **Con số duy nhất đó gần như chắc chắn đang không hiện.** Banner code sống và gate là plan logic
   thật (FREE / trial), nhưng cả 3 gate đều nhân với `getTotalImageNotOptimized(shop) > 0`, mà hàm
   đó đọc `shop.totalProductImageCount` — **không có write site nào trên `master`** (nhánh
   `ReadyBanner` còn cần `shop.totalProductCount`, cũng không có). Thiếu field → hàm trả 0 → **cả 4
   banner tắt bất kể plan** (§5). Xác nhận bằng 1 lần đọc 2 shop doc FREE trên prod (§7 bước 0).
   **Nếu đúng thì `activity` có 0 reader sống → xóa thẳng, không migrate gì cả.**

Và nó **đã bị thay thế rồi, chỉ là chưa ai gỡ**: collection `optimizeReport` (1 doc/shop) đang giữ
cùng những con số đó, recompute từ `history` ở cuối mỗi optimize run
(`recountOptimizedImages.js:20`), có trừ ảnh đã revert, idempotent. Chi tiết §4. Nghĩa là migration
không cần dual-write hay backfill — chỉ đổi đầu đọc từ `A` read xuống **1 read**.

Đây là collection đã bị audit một lần rồi: `const/shopProbe.js:158-167` ghi rõ `activity` bị loại
khỏi `CORROBORATION_SOURCES` vì nó đo cron của chính mình chứ không đo merchant (25/25 shop SUSPECT
hit `activity`, 0/25 hit `webhookLogs`/`charges`). Report này là hệ quả tiếp theo của cùng một
nguyên nhân.

---

## 1. Inventory

`packages/functions/src/repositories/activityRepository.js` — `firestore.collection('activity')`
(`:17`). 9 export, 12 file import.

| Fn | Loại | Call site | Runtime |
|---|---|---|---|
| `updateActivity` | 1 read + 1 write | `productService.js:449,930,1013,1152,1235,1299`<br>`collectionService.js:319,650,705,753,836`<br>`articleService.js:267,677,746,827`<br>`fileImageService.js:292,656,790` | **GCF + fleet** — `optimizeImage`, `optimizeImageV2`, `recursive` đều nằm trong `MIGRATED_TOPICS` (`dispatchWork.js:23-33`) và `worker.config.yml jobs:` |
| `getActivityByType` | 1 read, **write nếu miss** | `emailController.js:50-52` (**email sunset**)<br>`mailService.js:53-55` (trong `notifyOptimize` — 0 caller) | — **chết** |
| `countImageOTM` | **N read, không limit** | `shopController.js:115` — **reader sống duy nhất của cả collection**<br>`mailService.js:246-248` (**email sunset**) | GCF |
| `updateSeoActivity` | k×(read+write) | `ruleController.js:74,107`, `subscriptionService.js:506` | GCF |
| `deleteOptimizeActivities` | N read + N delete | `seoController.js:593`, `handlers/reset.js:24` | GCF |
| `bulkCreateActivity` | 3×S write | `shopRepository.js:271` (`resetOptStatus`) | GCF cron |
| `createActivity` | 1 write | nội bộ (`getActivityByType:123`) | — **chết theo** |
| **`calculateSavings`** | N read + 1 write | **0** | — |
| `getGridActivity` | — | comment out `:131-146` | — |

Route: `api.js:162-163` — `/activity` và `/estimated` **đã comment out**. `activityController` hiện
tại đọc collection khác hẳn (`activityEventsRepository` → **BigQuery**, không phải Firestore).

### Đường đi thật của read path còn sống — chỉ còn 1

```
FE MainFrame.js:54 useGetAppStatus()
  → GET /shop/appStatus            (api.js:70)
  → shopController.getShopStatus   (:112-118)
  → countImageOTM(shopId)          → activity: shopID== , type=='image', count>0   [KHÔNG LIMIT]
```

Đường email dưới đây **đã sunset**, giữ lại để biết code còn wire ở đâu nếu cần gỡ:

```
devController:514 (thủ công) → sendEmails() → dispatchWork('sendEmails')
  → sendEmailsSubscriberGen2 (pubsubFunctions.js:285)   [không migrate fleet → luôn Pub/Sub]
  → subscribeSendEmails.js:31  for (const email of emails)
      → renderTemplate (mailService:155)
      → getOptimizeReport (mailService:243, private)
      → countImageOTM ×3   ← chạy lại NGUYÊN VẸN cho từng recipient
```

`sendEmails()` **không có cron nào schedule**. Trigger duy nhất là DevZone thủ công
(`devController.js:514`, case `weeklyScanSeo`). Tức: write path chạy hằng ngày tự động, read path
email chỉ chạy khi có người bấm.

---

## 2. Data model

Doc shape (`activityRepository.js:44-50`, `:71`):

```js
{shopID: string, type: string, count: number, createdAt: Timestamp, updatedAt: Timestamp}
```

- **ID ngẫu nhiên** — `batch.create(collection.doc())` (`firestoreUtils.js:114`). Không upsert,
  không dedup. Mỗi lần cron chạy là 3 doc mới.
- **Không TTL.** `const/ttlPolicies.js` chỉ có `webhookLogs` (30 ngày). `activity` không có entry,
  không có field `expireAt`.
- **Uninstall**: `shopDataCollections.js:113` — `{name: 'activity', keyField: 'shopID', backup: false, del: true}`.
  Xóa khi purge shop, không backup. Tức dữ liệu này đã được xếp loại "bỏ đi được" từ trước.
- **Semantics**: counter reset theo ngày. `getActivityByType` lấy `orderBy('createdAt','desc').limit(1)`
  → chỉ doc mới nhất được increment. Doc các ngày trước đóng băng và **không bao giờ được đọc lại
  qua path đó** — chỉ `countImageOTM` (cộng dồn) và `calculateSavings` (dead) quét cả tập.

### Cardinality

| Đại lượng | Công thức |
|---|---|
| Doc mới/ngày | `3 × S` (S = shop `isInstalled == true`) |
| Doc tích lũy | `3 × S × D` (D = số ngày kể từ khi cron bật) |
| Doc `count > 0` của 1 shop, 1 type | `A` = số ngày shop đó có optimize type đó |

`A` là con số quyết định chi phí read, và nó chỉ tăng.

### Index

`firestore.indexes.json` — 3 composite cho `activity` (trong tổng 157):

| # | Fields | Query phục vụ | Sống? |
|---|---|---|---|
| 1 | `shopID ASC, type ASC, createdAt DESC` | `getActivityByType:112-117` | ✅ |
| 2 | `shopID ASC, type ASC, updatedAt ASC` | `calculateSavings:167-170` + `getGridActivity` (comment) | ❌ **chỉ phục vụ code đã chết** |
| 3 | `shopID ASC, type ASC, count ASC` | `countImageOTM:200-204` | ✅ |

`deleteOptimizeActivities:182-185` (`shopID` + `type in`) dùng được prefix của bất kỳ index nào ở trên.

**Bằng chứng `calculateSavings` chưa từng chạy được**: nhánh `!isShopLimit(shop)` (`:164,170`) tạo
query `where('shopID','==').orderBy('updatedAt','desc')` — cần composite `shopID + updatedAt`,
**không có trong `firestore.indexes.json`**. Nhánh đó sẽ throw `FAILED_PRECONDITION` nếu gọi. Không
ai gọi nên không ai thấy.

---

## 3. Cost shape

Giá list Firestore multi-region (nam5): read `$0.06`/100k, write `$0.18`/100k, delete `$0.02`/100k,
storage `$0.18`/GiB/tháng. Đổi region thì đổi số, không đổi kết luận.

### Write (tự động, hằng ngày)

| Nguồn | Ops/ngày |
|---|---|
| `resetOptStatus` query `isInstalled==true .select('id')` | `S` read (`select()` vẫn tính 1 read/doc) |
| `bulkCreateActivity` | `3S` write |
| `updateActivity` mỗi lần optimize | `1 read + 1 write` × số (type × batch) |
| `getActivityByType` khi miss | `+1 write` |

`S = 10.000` → 30k write/ngày ≈ **$0,054/ngày ≈ $20/năm**. Nhỏ. **Chi phí write không phải vấn đề.**

Vấn đề là **10,95 triệu doc/năm** tích lũy: doc ~150B + 3 index entry → ~450B/doc → **~4,9 GB/năm**
storage, cộng dồn vĩnh viễn. Và nó nuôi read path bên dưới.

### Read (đường nóng)

`countImageOTM` không limit → mỗi lần gọi đọc `A` doc.

```
chi phí 1 lần mở app = A × $6e-7
```

| Tuổi shop (ngày optimize) | Read/lần mở app | $/1 triệu lần mở app |
|---|---|---|
| A = 100 | 100 | $6 |
| A = 300 | 300 | $18 |
| A = 700 | 700 | $42 |
| A = 1.500 | 1.500 | $90 |

Không có trần. Shop càng dùng lâu càng đắt, tuyến tính, mãi mãi. Đây là điểm chết của thiết kế —
không phải con số hôm nay, mà là **đạo hàm**.

Email path nhân thêm: `3 × A × số_recipient` read mỗi lần gửi (do `renderTemplate` gọi trong vòng
lặp per-recipient). Hiện chỉ trigger thủ công nên chưa đau; bật cron lại là đau ngay.

`deleteOptimizeActivities` bill chủ yếu ở read (`3A` read + `3A` delete; read đắt gấp 3 delete).

---

## 4. Nguồn thay thế: `optimizeReport` — đã tồn tại và tốt hơn

### Loại trừ trước

- **`activityEventsRepository` là BigQuery**, bảng `activity_events` partition theo ngày, ghi qua
  `middleware/trackActivity.js:33`, `auditAgentController.js:157`, `doneOptimize.js:169`. Ghi **một
  event mỗi lần xảy ra hành động** (`feature:action`), **không ghi số ảnh** —
  `doneOptimize.js:169` ghi `IMAGE_OPTIMIZE:COMPLETE` một dòng cho cả run. Không thay thế được
  counter. Đừng nhầm hai hệ này chỉ vì trùng tên.
- **`historyOptimize.countAll`** (`historyOptimizeRepository.js:182-193`) là per-run. Cộng dồn nó
  cũng là quét unbounded → đổi query xấu lấy query xấu khác.

### Đích đúng: collection `optimizeReport`

`optimizeReportRepository.js:11-13` — `collection.doc(shopId).set(data, {merge: true})`. **Một doc
mỗi shop.** Đang giữ đúng những con số mà `activity` đang cố giữ:

| Field | Nghĩa |
|---|---|
| `countImageFile` / `countImageProduct` | tổng ảnh đã optimize, theo source |
| `countAltFile` / `countAltProduct` | tổng alt đã optimize |
| `imageOldSize*` / `imageNewSize*` | size trước/sau (image only) |
| `syncTotalImagesCount`, `missingAltCount`, `syncTotalImagesStatus` | trạng thái sync |

Ai ghi:

1. **`recountOptimizedImages`** (`services/optimize/recountOptimizedImages.js:20`) — chạy **cuối mỗi
   lần optimize**: `finalizeJobDone.js:24`, `finalizeWriteFlow.js:220` (và `doneOptimize.js:153` cho
   nhánh Cloud Run finalize). Quét `history` rồi ghi lại tổng.
2. **`RECURSIVE_COUNT_OPTIMIZED_IMAGES`** (`subscribeRecursive.js:655-703`) — bản Pub/Sub self-chaining
   của cùng logic, kích bởi `historyOptimizeController.getTotalImages:261` (`POST /image-optimization/total-images`).

Nguồn sự thật là `countOptimizedImages` (`historyRepository.js:901-948`): đếm log trong `history` với
`status === COMPLETED && !isReverted`.

**Vì sao tốt hơn `activity` ở mọi chiều:**

| | `activity` | `optimizeReport` |
|---|---|---|
| Read để lấy tổng | `A` doc, tăng mỗi ngày | **1 doc** |
| Cách tính | tích lũy increment | **recompute từ `history`** |
| Idempotent | không — retry là double count | **có** — rescan cho cùng kết quả |
| Trừ ảnh đã revert | **không** | có (`!l.isReverted`) |
| Drift | có (`deleteOptimizeActivities` xoá, increment mất khi lỗi) | tự chữa ở lần optimize sau |
| Doc/shop | `3 × số ngày`, vô hạn | 1, cố định |

### Đây là hai source-of-truth song song cho cùng một con số

`historyOptimizeController.getCountData:77-84` (`GET /history-optimize/count`) đã trả
`totalOptimizedImages = optimizeReport.countImage${suffix}` cho report card trên trang Image, với
`suffix = shop.useOptImageV25 ? 'File' : 'Product'` (`:78`).

Cùng lúc đó `countImageOTM` trả một con số khác cho cùng khái niệm "tổng ảnh đã optimize", đi vào
banner upsell. Hai số này **không có gì bảo đảm khớp nhau** — một cái trừ revert, một cái không.
Đây không phải "activity thiếu nguồn thay thế", mà là **activity là bản cũ đã bị thay thế mà chưa
ai gỡ**.

---

## 5. `countImageOTM` hiện ra ở đâu

Kết quả `countImageOTM` **không bao giờ được hiển thị trực tiếp**. Nó chỉ là số bị trừ.

### Backend — 2 nơi sinh ra

| # | Nơi | Thành gì |
|---|---|---|
| 1 | `shopController.getShopStatus:115` | field `totalImageOptimized` trong response `GET /shop/appStatus` |
| 2 | `mailService.getOptimizeReport:246-248` (private) | 3 dòng số trong email report |

### Đường 1 — UI admin

```
GET /shop/appStatus  →  data.totalImageOptimized
  → useGetAppStatus.js:22-26  →  store.dispatch(setActiveShop(...))
  → shopReducer.js:21  activeShop: {...state.activeShop, ...payload}   [merge]
  → getTotalImageNotOptimized(shop)   (toolCompressImage.js:95-103)
        return totalProductImageCount - totalImageOptimized
```

4 nơi render, đều là **banner upsell lên pricing**, không phải số liệu report:

| Nơi | Hiện gì |
|---|---|
| `Image/Progress/ReadyBanner.js:28` | tiêu đề banner `<span style="color:red">N+</span>` + `Image.ReadyBanner.freeTitle`, bấm → pricing page |
| `ImageCompress/ImageCompress.js:579,584` | banner `N+ images have not been optimized!` + link `/image-optimization`. Gate `isLimitNew` |
| `Image/Progress/Steps.js:254` | chỉ dùng làm **điều kiện boolean** `isShowBannerUpgrade`, không hiện số |
| `Image/Progress/StepsV25.js:278` | như trên (bản V25) |

Tức: `countImageOTM` — query nặng nhất, chạy mỗi lần mở app — chỉ để quyết định **có hiện banner
bán hàng hay không**, và hiện một con số xấp xỉ có dấu `+`.

### Hai field này không ai ghi

Đây là phần đáng chú ý nhất:

- **`totalImageOptimized` không tồn tại trên shop doc.** Không có write site nào trong `packages/functions/src`.
  `pickFields.js:110` có liệt kê nó → nhưng `prepareShop`/`getShop` `pick()` một field không tồn tại
  → luôn `undefined`. Nguồn duy nhất là `shopController.js:117` nhét vào response `/shop/appStatus`.
- **`totalProductImageCount` cũng không có write site nào trên `master`.** Grep toàn `packages/` (trừ
  `lib/`, worktree): chỉ có đọc (`seoController.js:1021`, FE) và `pickFields.js:17`. Không có
  `updateShop({totalProductImageCount})` ở đâu cả.
- **`totalProductCount` — cũng không.** Chỉ `pickFields.js:111`, một accumulator cục bộ trong
  response (`historyOptimizeController.js:224`) và một default của `DEFAULT_ANALYSIS`
  (`const/optimize/compressImage.js:16` — đó là shape của analysis response, **không phải shop doc**).

Hệ quả theo `toolCompressImage.js:98-99`:

```js
if (isUndefined(totalProductImageCount)) {
  return 0;          // → getTotalImageNotOptimized(shop) === 0
}                    // → cả 4 banner tắt
```

### Banner còn được dùng không — kiểm tra riêng

Code **sống hết**, và gate là plan logic thật, không phải flag chết:

| Render site | Điều kiện |
|---|---|
| `Steps.js:447` → `<ReadyBanner />` | `isShowBannerUpgrade` = `getTotalImageNotOptimized(shop) > 0 && ((isLimitFreeNew && shop.totalProductCount > limitProductImages(shop)) \|\| isLimitTrial(shop))` (`:254-255`) |
| `StepsV25.js:543` → `<ReadyBanner />` | y hệt (`:278-279`) |
| `ImageCompress.js:579` | `getTotalImageNotOptimized(shop) > 0 && isLimitNew` |

Cả hai nhánh `Steps` / `StepsV25` đều sống — `pages/Image/index.js:8` chọn theo
`!!activeShop?.useOptImageV25`. `ReadyBanner` lấy shop qua `connect` (`ReadyBanner.js:53-57`), không
phải prop, nên không có chuyện thiếu prop.
`isLimitFreeNew` = `isShopLimit(shop, true, [FREE])` (`pricingReducer.js:31`) → shop plan FREE;
`isLimitNew` = `isShopLimit(shop, true)` (`:29`). Đây là điều kiện sản phẩm bình thường, đang dùng.

**Nhưng cả 3 gate đều nhân với `getTotalImageNotOptimized(shop) > 0`, và hàm đó phụ thuộc
`shop.totalProductImageCount` — field không có writer.** Nhánh `ReadyBanner` còn phụ thuộc thêm
`shop.totalProductCount` — cũng không có writer (`undefined > n` = `false`).

→ Trên `master`, với shop doc không mang hai field legacy đó, **cả 4 banner tắt vĩnh viễn bất kể
plan**. `countImageOTM` vẫn chạy đủ `A` read mỗi lần mở app để nuôi một phép trừ bị vứt đi.

Đây là **giới hạn của code-only**: không loại trừ được khả năng giá trị cũ còn sót trên shop doc của
shop cài lâu. Kiểm tra dứt điểm rất rẻ — đọc 2 shop doc plan FREE trên prod (1 mới cài, 1 cũ), xem
có `totalProductImageCount` / `totalProductCount` không. Xem §7 bước 0.

Thêm một race nữa dù field có tồn tại: `getTotalImageNotOptimized` chạy trước khi `/shop/appStatus`
resolve thì `totalImageOptimized` là `undefined` → `totalProductImageCount - undefined` = `NaN` →
`NaN > 0` false → banner tắt, rồi bật sau khi response về. Banner nhấp nháy vào.

### Đường 2 — email (SUNSET)

Giữ lại để biết phải gỡ ở đâu. `getOptimizeReport` (`mailService.js:243-268`) trả 4 dòng cho template:

| Nhánh | Dòng |
|---|---|
| mặc định | `Total compressed` = countImage · `Total alt optimized` = countAlt · **`Week optimized` = `0` hardcode** · `Renamed images` = countFileName |
| `isAutoOptimize && autoOptimize` | `<Type> optimized` = `historyOptimize.countAll` · `Total alt optimized` · `Total compressed` · `Renamed images` |

Vào qua `renderTemplate:169`, gọi từ `subscribeSendEmails.js:31` (fan-out `sendEmails()`, trigger duy
nhất là DevZone `devController.js:514` ← FE `DTToolsContainer.js:539`) và `emailController.sendTest`
(`POST /email/test` ← FE `Email/SendTest.js:40`).

**Hệ quả của sunset — đây là phần quan trọng:**

- `getActivityByType` mất caller sống cuối cùng (`emailController.js:50-52`) → **chết**. `mailService.js:53-55`
  vốn đã nằm trong `notifyOptimize` (0 caller).
- `createActivity` chỉ được gọi từ `getActivityByType:123` → **chết theo**.
- `countImageOTM` mất 3 trong 4 call site (`mailService.js:246-248`) → còn đúng `shopController.js:115`.
- Và vì reader duy nhất đó dùng `type` default `'image'` (`activityRepository.js:199`): **doc type
  `alt` và `filename` cũng thành write-only**. Cộng với 7 type của `updateSeoActivity`, tổng cộng
  **9/10 type trong `config/activities.js` không có ai đọc**.

---

## 6. Verdict per-function

### Tier 0 — chết hẳn, xóa được ngay, 0 rủi ro

Sau khi email sunset, Tier 0 nở ra đáng kể — thêm 3 hàm và toàn bộ nhánh non-`image`.

| Mục | Vì sao |
|---|---|
| `calculateSavings` (`:155-179`) | 0 call site; nhánh non-limit còn thiếu index → chưa từng chạy được |
| `getGridActivity` (`:131-146`) | đã comment |
| `notifyOptimize` (`mailService.js:43-95`) | 0 caller |
| **`getActivityByType`** (`:110-129`) | caller sống cuối cùng là email (`emailController.js:50-52`) → **email sunset ⇒ hàm chết** |
| **`createActivity`** (`:39-60`) | chỉ được gọi từ `getActivityByType:123` → chết theo |
| **`updateActivity` cho type `alt` + `filename`** | reader cũ là email. Reader còn lại `countImageOTM` chỉ đọc `type='image'` (`:199`) |
| **`deleteOptimizeActivities`** (`:181-191`) | chỉ xoá 3 type image; sau khi 2/3 thành write-only và `image` chuyển sang `optimizeReport` thì không còn gì cần xoá |
| `api.js:162-163` | route đã comment |
| **Index #2** `shopID+type+updatedAt` | chỉ phục vụ 2 mục trên |
| `updateSeoActivity` + `updateActivity` cho type non-image | **write-only**: `meta`/`rule`/`structured`/`redirect`/`site`/`social`/`sitemap` không có reader nào còn sống |
| FE `pages/ActivityDetails/` + `routes.js:88` + `loadables/ActivityDetails.js` | fetch `/activity` (đã comment) → 404; không có nav link tới `/activity-details` |

Sau Tier 0: `config/activities.js` chỉ còn `activities`, `optimizeImageActivities`,
`calcSavedTime`, `prepareSavingsTextI18n` — 3 cái sau vẫn được FE `PricingTable*.js` dùng, **giữ**.
`noLimitActivities` chỉ còn `ActivityDetails.js` dùng → chết theo.

### Tier 1 — bỏ được sau khi đổi nguồn

| Mục | Thay bằng |
|---|---|
| `updateActivity` (image/alt/filename) | **xóa** — `recountOptimizedImages` đã ghi `optimizeReport` ở cuối mỗi optimize run (`finalizeJobDone.js:24`, `finalizeWriteFlow.js:220`). Không cần counter thứ hai |
| `getActivityByType` | đọc `optimizeReport.doc(shopId)` |
| `countImageOTM` | `getOptimizeReport(shopId)` → `countImage${suffix}` → **1 read** thay `A` read. **Hoặc xóa thẳng** nếu spot-check §7 bước 0 cho thấy UI đã chết |
| `bulkCreateActivity` + `resetOptStatus` | **xóa** — `optimizeReport` là recompute, không cần reset theo ngày |
| `deleteOptimizeActivities` | **xóa** — reset-history không cần zero counter; lần optimize sau `recountOptimizedImages` tự quét lại `history` và ghi đúng |
| Index #1, #3 | xóa nốt |
| Cron `resetOptimizeScheduleGen2` | rỗng sau khi bỏ `resetOptStatus()` → xóa export luôn |

### Tier 2 — phải giữ

Không có. Sau Tier 1, `activity` không còn reader nào.

---

## 7. Migration path

Vì `optimizeReport` (§4) đã có sẵn số đúng và đã được maintain, **không cần dual-write, không cần
backfill, không cần field mới.** Chỉ là đổi đầu đọc.

0. **Spot-check trước tiên (rẻ, quyết định luôn có cần bước 1-2 hay không).** Đọc 2 shop doc plan
   **FREE** trên `avada-seo`: 1 cài gần đây, 1 cũ. Kiểm 2 field: `totalProductImageCount` và
   `totalProductCount`.
   → Thiếu → 4 banner ở §5 đã tắt sẵn → `activity` có **0 reader sống** → xóa thẳng `countImageOTM` +
   `shopController.js:113-117` cùng Tier 0, bỏ hẳn bước 1-2.
   → Có → làm bước 1-2 để giữ banner nhưng hạ `A` read xuống 1 read. Đồng thời báo lại: hai field này
   không có writer nên giá trị đang là ảnh chụp đông cứng từ lúc code ghi bị xóa, tức banner đang hiện
   số sai — đó là bug riêng, sửa ngoài scope này.
   Read-only, nhưng là prod scope → xác nhận project id `avada-seo` trước khi chạy.
1. **Đổi `countImageOTM` sang đọc `optimizeReport`.** Thay thân hàm bằng `getOptimizeReport(shopId)`
   rồi lấy `countImage${suffix}` / `countAlt${suffix}` với
   `suffix = shop.useOptImageV25 ? 'File' : 'Product'` — **copy đúng logic
   `historyOptimizeController.js:78`**, đừng cộng File + Product (chỉ một nhánh được ghi tuỳ flow →
   cộng cả hai là double count).
   → `A` read thành **1 read**. `getShopStatus` đã có `shop` trong tay (`getAppStatus:158`) nên
   không phát sinh read phụ để biết `useOptImageV25`.
2. **Verify số trước/sau.** So `/shop/appStatus`.`totalImageOptimized` với
   `/history-optimize/count`.`totalOptimizedImages` trên vài shop staging. **Hai số này vốn đã lệch**
   (activity không trừ ảnh đã revert) → chốt với product rằng lấy số của `optimizeReport` là đúng, vì
   nó mới là số đang hiện trên report card.
3. **Cắt write.** Bỏ `bulkCreateActivity`, `resetOptStatus`, cron `resetOptimizeScheduleGen2`; bỏ
   `updateActivity` ở cả 18 call site.
   → `updateActivity` nằm ở **cả GCF lẫn worker fleet** (`optimizeImage`, `optimizeImageV2`,
   `recursive` ∈ `MIGRATED_TOPICS`). Hai runtime deploy riêng — `firebase deploy` **không** cập nhật
   worker box. Ship kèm `[deploy-worker]`, nếu không một nửa call site vẫn ghi vào collection đã bỏ.
4. **Dọn.** Xóa `activityRepository.js`, `notifyOptimize`, 3 index, entry `shopDataCollections.js:113`,
   `pickFields.js:110`. Dữ liệu cũ: bulk-delete một lần (`gcloud firestore bulk-delete` — rẻ hơn
   đọc-rồi-xóa) hoặc để nguyên; sau bước 3 nó không tốn read nữa, chỉ tốn storage.

### Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Số hiển thị đổi sau migrate | **Sẽ đổi**, và đổi theo hướng đúng: `optimizeReport` trừ ảnh đã revert, `activity` không. Bước 2 là để chốt điều này với product, không phải để làm hai số khớp nhau |
| Chọn sai suffix → double count hoặc ra 0 | Dùng nguyên `shop.useOptImageV25 ? 'File' : 'Product'` như `historyOptimizeController.js:78`. Không tự cộng hai nhánh |
| `optimizeReport` chưa có doc cho shop chưa optimize lần nào | `countImage${suffix}` là `undefined` → xử như 0 (`getCountData:80` đã dùng pattern `!= null`) |
| `getActivityByType` (email test) lệch semantics | Đang là "đếm trong ngày" nhưng nhãn 7 ngày (§8.6). Caller sống duy nhất là `POST /email/test` → rủi ro gần 0 |
| Fleet lệch pha GCF | Bước 3 ship kèm `[deploy-worker]`; xác nhận cả hai runtime trước khi dọn |

---

## 8. Findings phụ (bắt được dọc đường, không nằm trong scope)

1. **`activityController.js:48` — `console.log('data', data)`.** Vi phạm rule tuyệt đối của
   `packages/functions/CLAUDE.md` (never raw `console.*`). Log nguyên payload BigQuery của shop.
   Blocking trong review. Endpoint này đang live: `api.js:164`.
2. **`activityController.js:142` — `logger.warn('[getActivityList] params', ...)` mỗi request.**
   `warn` luôn hiện ở prod. Dev endpoint mà log warn mỗi lần gọi → nhiễu log. Hạ xuống `debug`.
3. **`activityRepository.js:96-99` — `updateActivity` catch trả `{success: true, error}`.** Lỗi
   nhưng báo thành công. Caller không có cách nào phân biệt.
4. **`resetOptimize.js:6-9` — JSDoc sai.** Ghi "Scheduled to run every Monday", thực tế
   `cronFunctions.js:20` là `'1 1 * * *'` = **hằng ngày**. `shopProbe.js:164` ghi đúng ("daily").
   Doc trong repo mâu thuẫn nhau về đúng cái cron này.
5. **`activityRepository.js:74` — log sai hệ số.** `logger.debug('image activity reset count', createData.length / 2)`
   nhưng `optimizeImageActivities` có **3** phần tử → số log lệch 1,5×. Tàn dư từ hồi chỉ có 2 type.
6. **Email gắn nhãn 7 ngày nhưng đếm 1 ngày.** `mailService.js:59-60` /
   `subscribeSendEmails.js:19-22` đặt subject `from -7 days to now`, nhưng
   `getActivityByType` chỉ lấy doc **mới nhất** — mà cron tạo doc mới **mỗi ngày**. Con số trong
   email là của ~1 ngày, nhãn là 7 ngày. Under-report ~7×.
7. **`renderTemplate` gọi trong vòng lặp per-recipient** (`subscribeSendEmails.js:31-33`,
   `mailService.js:64`). Mỗi recipient chạy lại `getOptimizeReport` → `3 × countImageOTM` +
   `getDataAutoOptimize` + `getSettings` + `getStorages`. Shop có 5 email = 5× toàn bộ. Hoist ra
   ngoài vòng lặp.
8. **`getActivityByType` là read path nhưng ghi** (`:123` gọi `createActivity` khi miss). Gửi email
   cho shop chưa có doc → tạo doc. Read không nên có side-effect.
9. **FE `/activity-details` (`routes.js:88`) là route mồ côi.** Component sống, lazy-load sống,
   endpoint chết → merchant gõ đúng URL thì nhận 404. Không có link nào trong nav trỏ tới.
10. **`pickFields.js:110` `'totalImageOptimized'` là entry vô nghĩa.** Không có write site nào ghi
    field này lên shop doc → `pick()` luôn bỏ qua. Tương tự `savedTime` (`:23`) và `hasNewAct`
    (`:13`): `savedTime` chỉ được ghi bởi `calculateSavings` — đã chết; `hasNewAct` vẫn được ghi
    (`optimizeImg.js:403,517`) nhưng reader duy nhất cũng là `calculateSavings`. Thêm một cặp
    write-only nữa.
11. **`totalProductImageCount` và `totalProductCount` đều không còn write site nào trên `master`.**
    Chỉ còn đọc. Cả 4 banner ở §5 phụ thuộc chúng → nếu đúng là legacy thì banner đã chết với mọi shop
    cài mới, và giá trị trên shop cũ là ảnh chụp đông cứng → banner hiện **số sai**. Cần spot-check
    prod (§7 bước 0).
12. **`getOptimizeReport` có dòng `{label: 'Week optimized', value: 0}` hardcode** (`mailService.js:265`).
    Email luôn báo 0 cho dòng đó.
13. **Hai source-of-truth song song cho "tổng ảnh đã optimize", cho ra hai số khác nhau.**
    `optimizeReport.countImage${suffix}` (trừ ảnh revert, recompute từ `history`) hiện trên report
    card qua `GET /history-optimize/count`; `countImageOTM` (không trừ revert, tích lũy increment)
    hiện trên banner upsell. Merchant có thể thấy hai con số lệch nhau trên cùng trang Image. Migrate
    theo §7 khép luôn cái này.
14. **Tên hàm dễ gây nhầm.** `getOptimizeReport` có **hai** hàm khác nhau: một export ở
    `repositories/optimizeReportRepository.js:6` (đọc collection `optimizeReport`), một private ở
    `mailService.js:243` (dựng 4 dòng cho email từ `countImageOTM`). Cùng tên, khác hẳn nhau —
    giống cặp bẫy `formatDateFields` đã ghi trong `packages/functions/CLAUDE.md`.

---

## Tóm tắt hành động

| Ưu tiên | Việc | Rủi ro | Lợi |
|---|---|---|---|
| P0 | **Spot-check `totalProductImageCount` + `totalProductCount` trên 2 shop FREE prod** (§7 bước 0) | 0, read-only | Quyết định luôn: migrate hay xóa thẳng `countImageOTM`. Nếu thiếu → `activity` có 0 reader sống |
| P0 | Xóa Tier 0 — giờ gồm cả `getActivityByType`, `createActivity`, nhánh `alt`/`filename`, `deleteOptimizeActivities` (email sunset) | 0 | Bớt 1/3 index; **9/10 type** trong `config/activities.js` là write-only, cắt hết |
| P0 | Sửa `console.log` `activityController.js:48` | 0 | Rule vi phạm, đang live |
| P1 | Trỏ `countImageOTM` sang `optimizeReport` (§7) | thấp — không dual-write, không backfill | `A` read → **1 read** ở đường nóng nhất của app; khép luôn 2-source-of-truth |
| P2 | Sửa nhãn 7-ngày của email + hoist `renderTemplate` khỏi vòng lặp + `Week optimized` hardcode | thấp | Số liệu email đúng, bớt N× read |

---

## Progress

Started: 2026-07-29 · **COMPLETE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Inventory: mọi export activityRepository + call site | ✅ | 9 export, 12 file import, 34 call site ngoài repo. 2 export đã chết |
| 2 | Data model: doc shape, cardinality, index, TTL, uninstall | ✅ | Append-only, không TTL, `del: true` khi purge. 1/3 index chỉ phục vụ code chết |
| 3 | Cost shape: read/write ops mỗi luồng | ✅ | Write rẻ (~$20/năm @10k shop). Read `O(tuổi shop)` trên mỗi lần mở app — đây mới là vấn đề |
| 4 | Overlap với activityDaily / activityEventsRepository | ✅ | `activityEventsRepository` là **BigQuery**, ghi event chứ không ghi count → không thay thế được. **Đích đúng là collection `optimizeReport`** — đã tồn tại, đã maintain, 1 doc/shop |
| 5 | Verdict per-function + migration path | ✅ | Tier 0 xóa ngay / Tier 1 sau dual-write / Tier 2 rỗng |
| 6 | Findings phụ + viết report | ✅ | 12 finding phụ, 1 cái blocking (`console.log` live ở prod endpoint) |
| 7 | Bổ sung: `countImageOTM` hiển thị ở đâu | ✅ | 4 banner upsell + 3 dòng email. Cả 2 field nó nuôi (`totalImageOptimized`, `totalProductImageCount`) đều không có write site → UI có thể đã chết sẵn |
| 8 | Bổ sung: email sunset + banner còn dùng không | ✅ | Reader sống của `activity` còn **1** (`shopController.js:115`). 9/10 type là write-only. Banner code sống, gate plan thật, nhưng phụ thuộc 2 field không có writer → tắt bất kể plan |

### Log

#### ✅ Task 1: Inventory
- Verify branch trước: `seo` @ `master` `2b0a1f2803b`, 0 ahead/0 behind origin.
- Phát hiện `activityController` đã chuyển sang collection khác — dễ nhầm là cùng một hệ.

#### ✅ Task 2: Data model
- `ttlPolicies.js` không có `activity`. `batch.create(collection.doc())` → ID ngẫu nhiên, không upsert.
- Bằng chứng `calculateSavings` chưa từng chạy: thiếu index `shopID+updatedAt` cho nhánh non-limit.

#### ✅ Task 3: Cost shape
- Cron `1 1 * * *` (daily), không phải "every Monday" như JSDoc nói.
- Đường nóng: `MainFrame.js:54` → `/shop/appStatus` → `countImageOTM` không limit.

#### ✅ Task 4: Overlap
- `activity_events` = BigQuery, partition theo ngày, ghi `feature:action` — không có số ảnh.
- **Sửa lại kết luận ban đầu**: đích migration không phải shop doc mà là collection `optimizeReport`
  (`doc(shopId)`), phát hiện qua `historyOptimizeController.getTotalImages` →
  `RECURSIVE_COUNT_OPTIMIZED_IMAGES` → `recountOptimizedImages`. Nó đã maintain sẵn
  `countImage{File,Product}` / `countAlt{...}`, recompute từ `history`, trừ ảnh revert, idempotent.
  → bỏ được dual-write + backfill khỏi migration path.

#### ✅ Task 5: Verdict + migration
- Điểm mạnh nhất: type non-image là write-only, reader duy nhất đã chết.
- Migration phải để ý 2 runtime — 18 call site `updateActivity` nằm cả trên fleet.

#### ✅ Task 6: Findings phụ + report
- 12 finding. Blocking: `activityController.js:48` raw `console.log` trên endpoint live.

#### ✅ Task 8: Email sunset + banner còn dùng không (2026-07-30)
- Tuan chốt email đã sunset → `getActivityByType` + `createActivity` chết; `countImageOTM` mất 3/4
  call site, còn `shopController.js:115`. Reader sống của cả collection: **1**.
- Vì reader đó dùng `type` default `'image'` → doc `alt` + `filename` cũng thành write-only.
  Tổng **9/10 type** trong `config/activities.js` không ai đọc.
- Banner: code sống, gate là plan logic thật (`isLimitFreeNew` = FREE, `isLimitTrial`), cả
  `Steps.js:447` lẫn `StepsV25.js:543` đều reachable qua `pages/Image/index.js:8`. Nhưng cả 3 gate
  nhân với `getTotalImageNotOptimized(shop) > 0`, mà hàm đó cần `shop.totalProductImageCount` —
  không writer. Nhánh ReadyBanner cần thêm `shop.totalProductCount` — cũng không writer.
  → banner tắt bất kể plan, trừ khi shop doc còn giá trị legacy. Spot-check §7 bước 0 chốt việc này.

#### ✅ Task 7: `countImageOTM` hiển thị ở đâu (bổ sung theo yêu cầu)
- Không hiện trực tiếp ở đâu cả — chỉ là số bị trừ trong `totalProductImageCount - totalImageOptimized`.
- 4 render site đều là banner upsell lên pricing; 2/4 chỉ dùng làm cờ boolean, không hiện số.
- Cả `totalImageOptimized` lẫn `totalProductImageCount` **không có write site** trên `master`
  → nếu `totalProductImageCount` vắng trên shop doc thì `getTotalImageNotOptimized` trả 0 và
  toàn bộ 4 banner tắt. Thêm bước 0 (spot-check prod) vào migration path.
- `notifyOptimize` phát hiện thêm là dead → `getActivityByType` chỉ còn 1 caller sống.
