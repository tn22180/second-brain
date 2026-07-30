# Plan — dừng write vào Firestore `activity` (bước 1 + 3)

Tiếp `jobs/index-inspect.md`. Tier 0 (MR !2083) chỉ xóa reader chết, **không bỏ write nào**.
Đây là hai bước cắt write, không đụng vào 18 call site `updateActivity` (đó là bước 2, đắt hơn
và rủi ro hành vi thật).

Verify trên `origin/master` = `5e923c2b7b32` (checkout hiện tại là `master`; nhánh Tier 0
`chore/remove-dead-activity-code` @ `66c8b32ccb27` đã push, MR !2083 đang mở).

## Base branch — quan trọng

MR !2083 **chưa merge**. Bước 3 sửa đúng dòng import trong `activityRepository.js` mà Tier 0
đã sửa → branch từ `master` sẽ conflict.

→ Branch từ `chore/remove-dead-activity-code`, MR target `master`, ghi "depends on !2083".
Hoặc chờ !2083 merge rồi branch từ `master`. Không branch từ `master` ngay bây giờ.

---

## Bước 1 — cắt bulk-create hằng ngày

Đây là nguồn write lớn nhất: `S` read + `3S` write **mỗi ngày**, `S` = số shop
`isInstalled == true`.

### Chuỗi gọi (đã verify)

```
resetOptimizeScheduleGen2  (cronFunctions.js:19-22, onSchedule '1 1 * * *', 2GiB/540s)
  └─ resetOptimize()       (handlers/cron/resetOptimize.js:14-17)
       └─ resetOptStatus() (shopRepository.js:263-273)  ← query ALL installed shops, select('id')
            └─ bulkCreateActivity(docs)  (activityRepository.js:68-76)  ← 3 doc/shop
```

`resetOptimize()` **không làm gì khác** — thân hàm đúng 2 dòng: `await resetOptStatus(); return 'ok';`.
Bỏ `resetOptStatus` ⇒ cả cron thành rỗng ⇒ xóa luôn scheduled function.

### Xóa gì

| File | Xóa |
|---|---|
| `handlers/exports/cronFunctions.js` | export `resetOptimizeScheduleGen2` (`:19-22`) + import `resetOptimize` (`:3`) |
| `handlers/cron/resetOptimize.js` | default export `resetOptimize()` (`:14-17`) + `resetOptStatus` khỏi import `:3` + JSDoc `:6-13` (đang sai: nói "every Monday" và "create 2 activities", thực tế daily và tạo 3) |
| `repositories/shopRepository.js` | `resetOptStatus()` (`:263-273`) + import `bulkCreateActivity` (`:5`) |
| `repositories/activityRepository.js` | `bulkCreateActivity()` (`:68-76`) + `batchCreate` khỏi import `:13` (giữ `batchDelete` — `deleteOptimizeActivities` còn dùng) |

**GIỮ** `sendEmails()` trong `resetOptimize.js` (`:19-26`) — còn caller sống
`devController.js:514` (dev-zone `weeklyScanSeo`). Giữ cả import `dispatchWork`, `chunk`,
`getShopToSendEmail`, `logger`.

### Thay đổi hành vi — chính xác

Model hiện tại: mỗi ngày cron tạo doc mới `count: 0` cho mỗi (shop, type∈`image`/`alt`/`filename`).
`getActivityByType` lấy `orderBy('createdAt','desc').limit(1)` = **bucket của hôm nay**.
`updateActivity` increment bucket đó. `countImageOTM` sum **mọi** doc có `count > 0`.

| Reader | Sau bước 1 |
|---|---|
| `countImageOTM` — reader sống chính, `shopController.js:115` | **Không đổi.** Nó sum toàn bộ doc, chưa bao giờ phụ thuộc bucket theo ngày. Tổng lifetime giữ nguyên. |
| `getActivityByType` — `emailController.sendTest:50-52`, case `optimize` của `POST /email/test` | **Đổi**: từ "count hôm nay" thành "count cộng dồn trên doc còn lại". Con số trong email test đổi. |

Shop mới, hoặc sau `deleteOptimizeActivities`: `getActivityByType` miss → `createActivity` tạo 1 doc
→ `updateActivity` increment. Vẫn chạy, không cần cron mồi.

Type non-image: `updateActivity:93` set `count: 1` (cờ, không increment) — không đổi, và bước 3
bỏ hẳn nhóm write đó.

Rủi ro thật chỉ nằm ở 1 chỗ: con số trong nút test email của merchant. `index-inspect.md` §8.6
đã ghi semantics chỗ đó vốn đã sai (nhãn 7 ngày trên count theo ngày), nên đây là đổi từ sai
sang sai khác, không phải làm hỏng cái đang đúng.

### Deploy — tự xóa, KHÔNG cần bước tay

**Sửa lại 2026-07-30 (Tuan chỉ ra).** Bản đầu của brief này viết là phải
`firebase functions:delete` bằng tay. **Sai.** Xóa export ở `handlers/exports/cronFunctions.js`
là đủ — deploy tự prune, vì **mọi** job deploy trong `.gitlab-ci.yml` đã truyền
`--force --non-interactive`:

| Job | Trigger | Command | Prune? |
|---|---|---|---|
| `deploy_production` | `only: - tags` | `firebase deploy --force` (bare, toàn bộ target) | ✅ |
| `deploy_production_changed` | tags + `[deploy-changed]` | `firebase deploy --only "$DEPLOY_TARGETS" --force` | ✅ |

`--force` chính là flag skip prompt "proceed with deletion". Đường selective cũng prune trong
case này: commit sửa `handlers/exports/cronFunctions.js` → trúng entry-point fallback ở
`scripts/detect-changed-functions.js:318` → `DEPLOY_TARGETS=functions` (unscoped, không phải
`functions:<tên>`) → so cả danh sách function. Chỉ dạng `--only functions:<tên>` mới bỏ prune,
và fallback không bao giờ sinh ra dạng đó.

Ghi thêm 2 điều phát hiện cùng lúc:

1. **Index Firestore cũng tự xóa** — claim ở !2083 ("`firebase deploy --only firestore:indexes`
   không prune, phải xóa tay") cũng sai. `node_modules/firebase-tools/lib/firestore/api.js:85`
   gate bằng `shouldDeleteIndexes = options.force`, và `firebase.json` khai
   `firestore.indexes` → bare `firebase deploy --force` của `deploy_production` prune luôn index.
   *Caveat:* đọc từ firebase-tools **v15.15.0** trong `node_modules`; CI
   `npm install -g firebase-tools@13.35.1` — chưa đọc source bản 13.35.1.
2. **Production deploy chạy theo tag, không theo merge master.** `deploy_production` là
   `only: - tags`. Root `CLAUDE.md` viết "`master` → production auto-deploy" — không đúng.

Vẫn đúng: deploy là thao tác tay của Tuan, không tự chạy.

### Tiết kiệm

Không có số `S` (không query prod, bước 0 vẫn chưa chạy). Công thức:

- Read: `S`/ngày biến mất (query `isInstalled == true` + `select('id')`).
- Write: `3S` doc/ngày biến mất, cộng index entry cho 2 composite index `activity` còn lại.
- Tăng trưởng doc: `1095 × S`/năm → tối đa `3S` doc **tổng cộng, một lần**, tạo on-demand.
- Giá `nam5`: write `$0.18`/100k, read `$0.06`/100k.
- Cũng bỏ 1 scheduled GCF 2GiB/540s chạy mỗi ngày.

Doc đã tích lũy **không** bị dọn trong plan này. Purge là việc riêng, cần delete trên prod,
ngoài scope.

### Doc phải sửa cùng — không được bỏ

`const/shopProbe.js:158-167` giải thích ở **thời hiện tại** rằng `activity` bị loại khỏi
`CORROBORATION_SOURCES` vì `resetOptStatus()` bulk-create daily. Bước 1 xóa đúng cơ chế đó.

Hai comment test cũng vậy:
- `const/__tests__/shopProbe.test.js:64-68`
- `repositories/__tests__/shopProbeRepository.test.js:158-163`

Assertion (`not.toContain('activity')`) vẫn pass — không sửa assertion. Nhưng phải viết lại
rationale thành lịch sử + nêu lý do **hiện tại** để `activity` vẫn không được thêm lại: nó vẫn
do chính job optimize của mình ghi (`updateActivity`), và sau bước 2 thì không còn ai ghi.

Đây là điểm dễ hỏng nhất của bước 1: xóa cơ chế mà để lại comment nói cơ chế còn đó thì lần sau
có người đọc comment, thấy nó không còn đúng, rồi thêm `activity` lại vào
`CORROBORATION_SOURCES` — và probe sẽ trả "alive" sai.

---

## Bước 3 — xóa `updateSeoActivity`

7 type nó ghi (`meta`,`rule`,`structured`,`redirect`,`site`,`social`,`sitemap`) là **write-only**,
không reader nào còn sống. `shopify` là tham số **không dùng** trong thân hàm.

### Xóa gì

| File | Xóa |
|---|---|
| `repositories/activityRepository.js` | `updateSeoActivity()` (`:27-32`) + JSDoc `:19-26`; import còn `import {optimizeImageActivities} from '../config/activities';` |
| `controllers/ruleController.js` | import `:12`; `create` — `updateSeoActivity(...)` `:74`; `update` — `:107` |
| `services/subscriptionService.js` | import `:38`; dòng `updateSeoActivity(shopify, shopId, updateSettings)` `:506` |

Ở `ruleController`, cả `:74` và `:107` nằm trong `await Promise.all([updateSettingsToTheme(...),
updateSeoActivity(...)])` → còn 1 phần tử, đổi thành `await updateSettingsToTheme(...)`.

Kèm theo: `const shopify = initShopify(shop);` ở `:71` và `:104` chỉ tồn tại để feed
`updateSeoActivity` (`updateSettingsToTheme({shop, settings, data})` không nhận `shopify`) →
xóa cả 2. Bớt 2 lần khởi tạo Shopify client mỗi lần create/update rule. **Giữ** import
`initShopify` (`:16`) — `:174` còn dùng (`shopify.shop.get`).

Ở `subscriptionService:506` chỉ xóa 1 dòng trong `resolveAll([...])`. `shopify` ở đó vẫn dùng
bởi `updateAssets({shopify, ...})` `:501` → không orphan.

### Thay đổi hành vi

Không. Cả 3 call site đều fire-and-forget trong `Promise.all` / `resolveAll`, hàm trả `void`,
và không reader nào đọc 7 type đó.

### Hệ quả config

`config/activities.js`: export `activities` và `noLimitActivities` mất hết consumer ngoài file
(sau khi Tier 0 xóa `ActivityDetails`). **Không xóa file** — `calcSavedTime` (`:77-80`) dùng
`activities` nội bộ, và `calcSavedTime` + `prepareSavingsTextI18n` vẫn được
`PricingTable.js:62-69` và `PricingTableOnboarding.js:63-69` dùng. Chỉ hạ 2 export đó xuống
biến nội bộ nếu muốn — optional, có thể để lần sau.

---

## Sau bước 1 + 3, ai còn ghi `activity`

| Writer | Trigger |
|---|---|
| `updateActivity` | 18 call site — `productService` 6, `collectionService` 5, `articleService` 4, `fileImageService` 3 |
| `createActivity` | `getActivityByType:123`, write-on-miss |

Chỉ còn `image`/`alt`/`filename` được ghi, on-demand thay vì theo lịch. Đó là bước 2 — thay
bằng `optimizeReport` (`recountOptimizedImages.js:20` đã tự chữa từ `history`).

Ghi chú cho bước 2: sau bước 3, ternary ở `updateActivity:93`
(`optimizeImageActivities.includes(type) ? increment : 1`) luôn đi nhánh increment → nhánh `: 1`
thành dead. Đừng dọn ở bước 3, để nguyên cho bước 2 xử một lượt.

## Verification

Không có test nào phủ `activity`. Bằng chứng là static + jest baseline.

1. Ref tới symbol đã xóa = 0:
   `grep -rn --include='*.js' -E "resetOptStatus|bulkCreateActivity|resetOptimizeScheduleGen2|updateSeoActivity" packages --exclude-dir=node_modules --exclude-dir=lib`
   Riêng `resetOptStatus` sẽ còn hit trong 3 comment ở `shopProbe` — đó là chủ ý, phải là
   văn lịch sử, không phải thời hiện tại.
2. `sendEmails` còn sống: grep phải thấy `devController.js:514` và export ở `resetOptimize.js`.
3. `initShopify` còn import ở `ruleController.js:16` và còn dùng ở `:174`.
4. `batchDelete` còn dùng trong `activityRepository`; `batchCreate` không còn.
5. jest: `npx jest packages/functions/src`. Baseline hiện tại **4 suite fail / 5 test fail /
   576 pass** — pre-existing (`falcon-event-tracker` chưa install; eslint 6.8 không chạy được
   trên Node 22). Con số phải giữ nguyên. `shopProbe` test phải vẫn xanh.
6. Cron còn lại trong `cronFunctions.js` phải parse và export đủ — grep `onSchedule` đếm trước/sau,
   chỉ giảm đúng 1.

Không deploy. Không query prod.

## Không nằm trong plan này

- Bước 2 (18 call site `updateActivity` → `optimizeReport`).
- Purge doc `activity` đã tích lũy trên prod.
- Bước 0 (prod spot-check `totalProductImageCount` / `totalProductCount`) — vẫn treo, cần chạy tay.
- ~~Xóa index `activity` thứ 3 trên prod~~ — tự prune theo `--force`, xem §Deploy ở trên.
