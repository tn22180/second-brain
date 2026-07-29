lọc tất cả các function dùng activity collection firestore cho t, và đánh giá xem có nên bỏ đi không

Scope chốt: repo `seo`, branch `master` (2b0a1f2803b, sync origin). Deliverable = report + khuyến nghị, không sửa code, không query prod (code-only).

---

# Report — Firestore collection `activity` (repo `seo`)

## Kết luận

**Bỏ được. Nên bỏ.** Không phải "dọn cho gọn" — nó đang ghi dữ liệu không ai đọc và có một read path
chi phí tăng tuyến tính theo tuổi shop, chạy trên **mỗi lần mở app**.

Ba sự thật quyết định:

1. **Docs của mọi type ngoài `image`/`alt`/`filename` là write-only.** `updateSeoActivity` (3 call
   site) ghi type `meta`/`rule`/`structured`/`redirect`/`site`/`social`/`sitemap`. Reader duy nhất
   của các type đó là `calculateSavings` — **0 call site**. Ghi xong không ai đọc.
2. **Collection append-only, không TTL, không compaction.** Cron `resetOptimizeScheduleGen2`
   (`cronFunctions.js:19-22`, schedule `1 1 * * *` = **hằng ngày**) bulk-create **3 doc/shop/ngày**
   vĩnh viễn. `S` shop installed → `1095 × S` doc/năm, không bao giờ xóa.
3. **`countImageOTM` không có `limit`, chạy trên `/shop/appStatus`** — hook `useGetAppStatus` gắn ở
   `MainFrame.js:54`, tức **mọi lần merchant mở app**. Query đọc *tất cả* doc `count > 0` của shop
   đó. Số doc này tăng thêm 1 mỗi ngày shop có optimize. Chi phí mỗi lần mở app tăng đơn điệu,
   không có trần.

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
| `getActivityByType` | 1 read, **write nếu miss** | `emailController.js:50-52` (live, `POST /email/test`)<br>`mailService.js:53-55` (**trong `notifyOptimize` — 0 caller, chết**) | GCF |
| `countImageOTM` | **N read, không limit** | `shopController.js:115` (live, mỗi lần mở app)<br>`mailService.js:246-248` (email, trigger thủ công) | GCF |
| `updateSeoActivity` | k×(read+write) | `ruleController.js:74,107`, `subscriptionService.js:506` | GCF |
| `deleteOptimizeActivities` | N read + N delete | `seoController.js:593`, `handlers/reset.js:24` | GCF |
| `bulkCreateActivity` | 3×S write | `shopRepository.js:271` (`resetOptStatus`) | GCF cron |
| `createActivity` | 1 write | nội bộ (`getActivityByType:123`) | — |
| **`calculateSavings`** | N read + 1 write | **0** | — |
| `getGridActivity` | — | comment out `:131-146` | — |

Route: `api.js:162-163` — `/activity` và `/estimated` **đã comment out**. `activityController` hiện
tại đọc collection khác hẳn (`activityEventsRepository` → **BigQuery**, không phải Firestore).

### Đường đi thật của 2 read path còn sống

```
FE MainFrame.js:54 useGetAppStatus()
  → GET /shop/appStatus            (api.js:70)
  → shopController.getShopStatus   (:112-118)
  → countImageOTM(shopId)          → activity: shopID== , type=='image', count>0   [KHÔNG LIMIT]

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

## 4. Không có nguồn thay thế sẵn — nhưng cũng không cần

Kiểm `activityEventsRepository` (cái mà `activityController` dùng bây giờ): đó là **BigQuery**,
bảng `activity_events` partition theo ngày, ghi qua `middleware/trackActivity.js:33`,
`auditAgentController.js:157`, `doneOptimize.js:169`.

Nó ghi **một event mỗi lần xảy ra hành động** (`feature:action`), **không ghi số ảnh**.
`doneOptimize.js:169` ghi `IMAGE_OPTIMIZE:COMPLETE` một dòng cho cả run. → **Không thay thế được
counter.** Đừng nhầm hai hệ này.

`historyOptimize` có `countAll` per-run (`historyOptimizeRepository.js:182-193`) — thay thế được về
mặt dữ liệu, nhưng cộng dồn nó cũng là quét unbounded → đổi một query xấu lấy một query xấu khác.

**Đích đúng: counter trên chính shop doc.** `pickFields.js:110` đã có `totalImageOptimized` trong
danh sách field của shop. FE (`toolCompressImage.js:97`) đọc `shop.totalImageOptimized` — nó **đã**
mong đợi field nằm trên shop. Hiện `shopController.js:117` vá bằng cách nhét kết quả `countImageOTM`
vào response. Chỉ cần biến nó thành field thật.

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

Hệ quả theo `toolCompressImage.js:98-99`:

```js
if (isUndefined(totalProductImageCount)) {
  return 0;          // → getTotalImageNotOptimized(shop) === 0
}                    // → cả 4 banner tắt
```

**Nếu shop doc không có `totalProductImageCount`, toàn bộ 4 UI đó không bao giờ hiện** — và
`countImageOTM` vẫn chạy đủ `A` read trên mỗi lần mở app để nuôi một phép trừ bị vứt đi.

Field này gần như chắc là **legacy**: code ghi nó đã bị xóa, giá trị còn sót trên shop doc cũ. Shop
mới cài sẽ không có. Không xác nhận được bằng code-only — **cần spot-check 1 shop mới + 1 shop cũ
trên prod trước khi kết luận UI đó sống hay chết**. Đây là kiểm tra đáng làm đầu tiên: nếu nó chết,
`countImageOTM` bỏ thẳng, không cần migrate gì.

Thứ tự trả về cũng có race: `getTotalImageNotOptimized` chạy trước khi `/shop/appStatus` resolve thì
`totalImageOptimized` là `undefined` → `totalProductImageCount - undefined` = `NaN` → `NaN > 0`
false → banner tắt. Sau khi response về mới bật. Banner nhấp nháy vào.

### Đường 2 — email

`getOptimizeReport` (`mailService.js:243-268`) trả 4 dòng, template render vào email:

| Nhánh | Dòng |
|---|---|
| mặc định | `Total compressed` = countImage · `Total alt optimized` = countAlt · **`Week optimized` = `0` hardcode** · `Renamed images` = countFileName |
| `isAutoOptimize && autoOptimize` | `<Type> optimized` = `historyOptimize.countAll` · `Total alt optimized` · `Total compressed` · `Renamed images` |

Vào qua `renderTemplate:169`, gọi từ `subscribeSendEmails.js:31` (fan-out `sendEmails()` — **chỉ
trigger thủ công** từ DevZone `devController.js:514`) và `emailController.sendTest` (`POST /email/test`).

`getActivityByType` thì chỉ còn **1 caller sống**: `emailController.js:50-52`, case `type === 'optimize'`
của endpoint test email. Caller còn lại (`mailService.js:53-55`) nằm trong `notifyOptimize` —
hàm này **0 caller**, đã chết.

---

## 6. Verdict per-function

### Tier 0 — chết hẳn, xóa được ngay, 0 rủi ro

| Mục | Vì sao |
|---|---|
| `calculateSavings` (`:155-179`) | 0 call site; nhánh non-limit còn thiếu index → chưa từng chạy được |
| `getGridActivity` (`:131-146`) | đã comment |
| `notifyOptimize` (`mailService.js:43-95`) | 0 caller. Kéo theo `getActivityByType` chỉ còn 1 caller sống (`POST /email/test`) |
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
| `updateActivity` (image/alt/filename) | `FieldValue.increment` trên shop doc → **1 write, 0 read** (đang là 1 read + 1 write) |
| `getActivityByType` | đọc field shop doc |
| `countImageOTM` | đọc field shop doc → **0 read phụ** (`getAppStatus:158` đã `getShopById` trong cùng request). **Hoặc xóa thẳng** nếu spot-check §7 bước 0 cho thấy UI đã chết |
| `bulkCreateActivity` + `resetOptStatus` | **xóa** — counter cộng dồn không cần reset theo ngày |
| `deleteOptimizeActivities` | set 3 field về 0 → **1 write**, thay `3A read + 3A delete` |
| Index #1, #3 | xóa nốt |
| Cron `resetOptimizeScheduleGen2` | rỗng sau khi bỏ `resetOptStatus()` → xóa export luôn |

### Tier 2 — phải giữ

Không có. Sau Tier 1, `activity` không còn reader nào.

---

## 7. Migration path

Đề xuất: 3 field trên shop doc — `totalImageOptimized`, `totalAltOptimized`, `totalFilenameOptimized`.

0. **Spot-check trước tiên (rẻ, có thể đổi cả kế hoạch).** Đọc 2 shop doc trên `avada-seo`: 1 shop
   cài gần đây, 1 shop cũ. Kiểm field `totalProductImageCount` có tồn tại không.
   → Nếu shop mới **không** có field này thì 4 banner ở §5 đã chết sẵn với mọi shop mới, và
   `countImageOTM` không cần migrate — xóa thẳng cùng Tier 0, bỏ luôn bước 1-4 cho nhánh image.
   Đây là read-only, nhưng là ghi vào prod-project scope → xác nhận project id `avada-seo` trước khi chạy.
1. **Dual-write.** Mọi call site `updateActivity` ghi thêm `FieldValue.increment` lên shop doc. Vẫn
   giữ ghi `activity`. Deploy, chạy 1 tuần.
   → Chú ý: `updateActivity` có 18 call site nằm ở **cả GCF lẫn worker fleet** (`optimizeImage`,
   `optimizeImageV2`, `recursive`). Hai runtime deploy riêng — `firebase deploy` không cập nhật
   worker box. Phải ship kèm `[deploy-worker]`, nếu không một nửa call site vẫn ghi kiểu cũ.
2. **Backfill.** Script one-off: mỗi shop, sum `count` theo type trên `activity`, ghi vào shop doc.
   Đây là lần quét toàn bộ collection duy nhất — chi phí = tổng số doc. Chạy 1 lần, chấp nhận được.
3. **Cắt read.** `countImageOTM` → đọc field. `getActivityByType` → đọc field. Deploy, verify
   `totalImageOptimized` trên `/shop/appStatus` khớp trước/sau.
4. **Cắt write.** Bỏ `bulkCreateActivity`, `resetOptStatus`, cron; bỏ ghi `activity` trong
   `updateActivity`.
5. **Dọn.** Xóa `activityRepository.js`, 3 index, entry `shopDataCollections.js:113`. Dữ liệu cũ:
   purge một lần bằng bulk-delete (`gcloud firestore bulk-delete`, rẻ hơn đọc-rồi-xóa) — hoặc để
   nguyên, không tốn read nữa, chỉ tốn storage.

### Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Số liệu lệch sau migrate (counter cộng dồn vs reset-theo-ngày) | Semantics `countImageOTM` vốn đã là cộng dồn toàn thời gian → **không đổi**. Chỉ `getActivityByType` đang là "đếm trong ngày" và bị gắn nhãn 7 ngày (xem §8.6) — migrate sang cộng dồn là **sửa** một bug sẵn có, không phải tạo bug mới. Caller sống duy nhất của nó là endpoint test email nên rủi ro gần bằng 0. |
| Race trên shop doc | `FieldValue.increment` là atomic server-side — an toàn hơn `getActivityByType` + `update` hiện tại (read-then-write, mất update khi 2 job song song) |
| Shop doc phình | 3 số nguyên. Không đáng kể |
| Fleet lệch pha GCF | Ship dual-write kèm `[deploy-worker]`, xác nhận cả hai runtime trước khi sang bước 3 |

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
11. **`totalProductImageCount` không còn write site nào trên `master`.** Chỉ còn đọc. Nếu đúng là
    legacy thì 4 banner ở §5 đã chết với mọi shop cài mới. Cần spot-check prod (§7 bước 0).
12. **`getOptimizeReport` có dòng `{label: 'Week optimized', value: 0}` hardcode** (`mailService.js:265`).
    Email luôn báo 0 cho dòng đó.

---

## Tóm tắt hành động

| Ưu tiên | Việc | Rủi ro | Lợi |
|---|---|---|---|
| P0 | **Spot-check `totalProductImageCount` trên 2 shop prod** (§7 bước 0) | 0, read-only | Quyết định luôn: migrate hay xóa thẳng `countImageOTM` |
| P0 | Xóa Tier 0 (dead code + `notifyOptimize` + index #2 + write-only path + FE page mồ côi) | 0 | Bớt 1/3 index, bớt write vô nghĩa ở 3 call site |
| P0 | Sửa `console.log` `activityController.js:48` | 0 | Rule vi phạm, đang live |
| P1 | Migrate counter sang shop doc (§7) | thấp, có dual-write | Bỏ read tăng-theo-tuổi ở đường nóng nhất của app |
| P2 | Sửa nhãn 7-ngày của email + hoist `renderTemplate` khỏi vòng lặp + `Week optimized` hardcode | thấp | Số liệu email đúng, bớt N× read |

---

## Progress

Started: 2026-07-29 · **COMPLETE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Inventory: mọi export activityRepository + call site | ✅ | 9 export, 12 file import, 34 call site ngoài repo. 2 export đã chết |
| 2 | Data model: doc shape, cardinality, index, TTL, uninstall | ✅ | Append-only, không TTL, `del: true` khi purge. 1/3 index chỉ phục vụ code chết |
| 3 | Cost shape: read/write ops mỗi luồng | ✅ | Write rẻ (~$20/năm @10k shop). Read `O(tuổi shop)` trên mỗi lần mở app — đây mới là vấn đề |
| 4 | Overlap với activityDaily / activityEventsRepository | ✅ | `activityEventsRepository` là **BigQuery**, ghi event chứ không ghi count → không thay thế được. Đích đúng là field trên shop doc |
| 5 | Verdict per-function + migration path | ✅ | Tier 0 xóa ngay / Tier 1 sau dual-write / Tier 2 rỗng |
| 6 | Findings phụ + viết report | ✅ | 12 finding phụ, 1 cái blocking (`console.log` live ở prod endpoint) |
| 7 | Bổ sung: `countImageOTM` hiển thị ở đâu | ✅ | 4 banner upsell + 3 dòng email. Cả 2 field nó nuôi (`totalImageOptimized`, `totalProductImageCount`) đều không có write site → UI có thể đã chết sẵn |

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
- `pickFields.js:110` + `toolCompressImage.js:97` cho thấy FE vốn đã mong `totalImageOptimized` nằm trên shop doc.

#### ✅ Task 5: Verdict + migration
- Điểm mạnh nhất: type non-image là write-only, reader duy nhất đã chết.
- Migration phải để ý 2 runtime — 18 call site `updateActivity` nằm cả trên fleet.

#### ✅ Task 6: Findings phụ + report
- 12 finding. Blocking: `activityController.js:48` raw `console.log` trên endpoint live.

#### ✅ Task 7: `countImageOTM` hiển thị ở đâu (bổ sung theo yêu cầu)
- Không hiện trực tiếp ở đâu cả — chỉ là số bị trừ trong `totalProductImageCount - totalImageOptimized`.
- 4 render site đều là banner upsell lên pricing; 2/4 chỉ dùng làm cờ boolean, không hiện số.
- Cả `totalImageOptimized` lẫn `totalProductImageCount` **không có write site** trên `master`
  → nếu `totalProductImageCount` vắng trên shop doc thì `getTotalImageNotOptimized` trả 0 và
  toàn bộ 4 banner tắt. Thêm bước 0 (spot-check prod) vào migration path.
- `notifyOptimize` phát hiện thêm là dead → `getActivityByType` chỉ còn 1 caller sống.
