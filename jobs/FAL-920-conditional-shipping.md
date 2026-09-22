# FAL-920 — SEO Suite: shipping cost theo điều kiện (free shipping threshold)

- **Jira**: https://space.avada.net/browse/FAL-920
- **Repo**: `/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo`
- **Worktree**: `/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo-wt-shiprules`
- **Branch**: `feat/FAL-920-conditional-shipping` @ base `9e8444b1c0` (= `origin/master`)
- **Slack nguồn**: https://avadaio.slack.com/archives/G01N5G8D562/p1789906705464119 — ticket `SEO-260920-QnBsGa`, shop `fraeulein-plath-green-dogshop.myshopify.com`

## Vấn đề

Structured data của SEO Suite chỉ cho merchant nhập **một** shipping cost phẳng. Khách cần rate
theo ngưỡng giỏ hàng: 4.90 EUR cho đơn dưới 79 EUR, free ship từ 79 EUR trở lên.

## Hiện trạng đã khảo sát

- Shipping cost = một số phẳng `productAndCollection.price` — `packages/functions/src/config/default.js:131`.
  Không có object `shippingDetails` riêng; các field nằm phẳng cùng cấp trong `productAndCollection`
  (`default.js:118-147`).
- Backend **không** build JSON-LD. `getStructuredValueByFeature`
  (`packages/functions/src/services/searchAppearance/updateStructuredFeature.js:119-125`) chỉ spread
  settings; `productAndCollection` đi nguyên vẹn vào app metafield `seo.meta2`
  (`packages/functions/src/services/setting/updateSettingToTheme.js:23-39`).
- Render 100% bằng Liquid. Block `OfferShippingDetails` bị copy **6 lần**, cả 6 giống hệt nhau
  ngoài thụt lề:
  - `extensions/theme-app-extension/snippets/avada-product-and-collection.liquid:166` (offers cấp
    ProductGroup), `:273` (product node theo variant), `:319` (offer của variant), `:461` (trang collection)
  - `packages/functions/src/config/customGsdLiquid.js:179` (product node), `:225` (offer node)
- Hai đường Liquid đọc **hai metafield khác nhau**: extension đọc `app.metafields.seo.meta2`,
  `customGsdLiquid` đọc `shop.metafields['avada-seo-gsd'].avadaSEOGsd.value` (`customGsdLiquid.js:26`).
- `customGsdLiquid` ghi **một file .liquid cho mỗi loại schema** vào theme merchant
  (`STRUCTURED_SNIPPET_PRODUCT_AND_COLLECTION`, `helpers/gsdThemeAi/updateCustomGsdTheme.js:13-48`) —
  nên bên đó **không tách snippet chung được**, phải sửa inline 2 block.
- Extension đã dùng `{%- render 'x' -%}` sẵn (`blocks/avada-seo.liquid:15-89`) → tách snippet dùng
  chung bên extension là đúng pattern có sẵn.
- UI nhập: `packages/assets/src/pages/StructuredV2/Edit/Form/ProductAndCollection.js:250-259`
  (`TextField` number, `suffix={data.currency}`). Toggle bọc ngoài `:205-218`, `Collapsible` `:226-232`.
- Validation hiện có: `packages/assets/src/helpers/productAndCollection/getRule.js` — chỉ
  `handlingTimeMax > handlingTimeMin` và `transitTimeMax > transitTimeMin`. **Không có rule nào cho
  `price`/`currency`.**
- Type: `packages/functions/src/types/schema/schemaProduct.d.ts:21-46`.
- i18n: `packages/assets/src/pages/StructuredV2/StructuredV2.json` + 14 locale generated. Quy trình:
  sửa JSON cạnh component → `yarn update-label`. **Không bao giờ sửa tay `locale/translations/*`.**
- **Không có** logic ngưỡng ở bất kỳ đâu. Conditional quanh block shipping chỉ là on/off:
  `{%- if productAndCollection.showShippingDetails -%}` và
  `{%- unless excludeFields contains "shippingDetails" -%}`.
- App **không** đọc shipping zone thật của Shopify (0 hit `deliveryProfiles`/`shippingZones`, không có
  scope `read_shipping`). Merchant gõ tay — giữ nguyên hướng đó.
- **Không có test nào** phủ `shippingDetails`.

## Nghiên cứu schema — kết luận (đã sửa so với bản brief đầu)

Bản brief đầu đề xuất `eligibleTransactionVolume` trên `OfferShippingDetails`. **Sai.**
`eligibleTransactionVolume` là property của `Offer`/`PriceSpecification`, không phải của
`OfferShippingDetails`, và Google không document nó cho shipping.

Cơ chế ngưỡng giỏ hàng đúng là **`ShippingConditions.orderValue`** (`MonetaryAmount` có
`minValue`/`maxValue`; không khai `minValue` mặc định 0, không khai `maxValue` mặc định vô cực).
Google: nhiều `ShippingConditions` cùng khớp thì lấy **mức rẻ nhất** và hiện tốc độ giao đi kèm
mức đó — đúng cái khách cần.

Đường đi tới `ShippingConditions` từ offer level:
`Offer.shippingDetails` → `OfferShippingDetails.hasShippingService` → `ShippingService.shippingConditions[]`.
schema.org xác nhận `OfferShippingDetails` có `hasShippingService`.

### Quyết định: làm ở offer level (phương án B)

Đã cân nhắc và loại:

- **A — `Organization.hasShippingService`**: Google document đầy đủ và khuyến nghị đây là chỗ khai
  policy chung. Loại vì đó là feature khác (schema `homepage`/Organization), merchant đang cấu hình
  shipping ở tab Product & Collection sẽ không khớp, và scope vượt hẳn ticket này.
- **C — làm cả hai**: gấp đôi việc, chưa cần.

**Rủi ro đã biết, chấp nhận:** Google nói property offer-level là "a subset of" org-level nhưng
**không liệt kê subset đó**, nên không chắc Google ăn `hasShippingService` ở offer level. Chấp nhận
vì đối xứng rủi ro nghiêng hẳn về làm: nếu Google bỏ qua, nó vẫn đọc `shippingRate` phẳng như hôm
nay → không regression, chỉ là không ăn thêm.

### Shape mục tiêu

Shop có rule (ví dụ đúng case khách):

```json
"shippingDetails": {
  "@type": "OfferShippingDetails",
  "shippingRate": {"@type": "MonetaryAmount", "value": 4.90, "currency": "EUR"},
  "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "DE"},
  "deliveryTime": { "...": "giữ nguyên như hiện tại" },
  "hasShippingService": {
    "@type": "ShippingService",
    "shippingConditions": [
      { "@type": "ShippingConditions",
        "orderValue": {"@type": "MonetaryAmount", "minValue": 0, "maxValue": 79, "currency": "EUR"},
        "shippingRate": {"@type": "MonetaryAmount", "value": 4.90, "currency": "EUR"} },
      { "@type": "ShippingConditions",
        "orderValue": {"@type": "MonetaryAmount", "minValue": 79, "currency": "EUR"},
        "shippingRate": {"@type": "MonetaryAmount", "value": 0, "currency": "EUR"} }
    ]
  }
}
```

`shippingRate` phẳng ở ngoài **vẫn giữ** — nó là cái Google chắc chắn đọc được. Giá trị của nó là
rate của rule đầu tiên (rate áp dụng cho đơn nhỏ nhất), tức mức xấu nhất merchant thu. Shop không có
rule thì nó là `price` như cũ.

Shop **không** cấu hình rule → emit **y hệt hôm nay**, không có `hasShippingService`.

## Chiến lược test

`liquid@4.1.0` đã là dependency của `packages/functions` (`package.json:97`) — **không thêm dep mới**.
Engine này không hiểu whitespace-control `{%-`, nhưng strip `{%-`/`-%}`/`{{-`/`-}}` trước khi render
không đổi ngữ nghĩa JSON. Đã probe: `for`, `unless … contains`, `!= blank`, `forloop.first` đều chạy.

Nên golden test đọc **file .liquid thật**, render với fixture settings, rồi `JSON.parse` output và
assert shape. Điều kiện "shop chưa cấu hình bắn ra y hệt" thành máy kiểm.

Jest cấu hình ở root (`jest.config.js`), alias `@functions/*` + `@assets/*`. Chạy `npx jest` từ root
worktree. `packages/functions/lib/` chứa bản build cũ của cùng test — luôn target đường dẫn `src/`.

## Phạm vi

1. **Settings + type + helper thuần** — `shippingRules: []` trong `productAndCollection`
   (`default.js`), khai trong `schemaProduct.d.ts`. Mỗi rule `{minPrice, maxPrice, rate}`
   (`maxPrice` rỗng = vô cực). Giữ nguyên `price`/`currency`. Helper thuần
   `normalizeShippingRules()` để FE và test dùng chung (FE import qua alias `@functions/*` — pattern
   đã có, xem `packages/assets/CLAUDE.md`).
2. **Liquid extension** — tách snippet dùng chung `avada-shipping-details.liquid`, 4 call site đổi
   thành `{%- render … -%}`. Snippet emit `hasShippingService` khi có rule, không thì giữ nguyên.
3. **Liquid customGsdLiquid** — 2 block sửa inline (không tách được, xem trên).
4. **UI** — `ProductAndCollection.js`: TextField đơn → list rule thêm/xoá được. Shop chưa có rule thì
   render `price` cũ thành rule đầu, **không ghi ngược Firestore**.
5. **Validation** — `getRule.js`: rule không chồng lấn, `maxPrice > minPrice`, `rate >= 0`, gate dưới
   `showShippingDetails`.
6. **i18n + verify cuối** — `StructuredV2.json` + `yarn update-label`, rồi chạy full test/lint.

## Nghiệm thu

- Merchant thêm được N rule, lưu và load lại đúng.
- JSON-LD storefront bắn ra `hasShippingService.shippingConditions` đúng số rule, output `JSON.parse`
  được, pass Google Rich Results Test.
- Shop chưa cấu hình rule bắn ra JSON-LD **y hệt trước khi sửa** — golden test chứng minh.
- `npx jest` xanh từ root worktree.

## Ngoài phạm vi (đã chốt bỏ)

- `default.js:126,131,139` — default `showShippingDetails: true` + `price: 0` + `country: 'BR'` trong
  khi currency default `'USD'`, sai fleet-wide. Không sửa trong task này.
- `customGsdLiquid.js:284` — block collection thiếu `shippingDetails`. Không sửa trong task này.
- Org-level `hasShippingService` (phương án A).
- Đọc delivery profile thật của Shopify.

---

## Progress

Started: 2026-09-22

> Session này không có tool TaskCreate — bảng dưới là tracker duy nhất.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Settings default + type + helper `normalizeShippingRules` + test | general-purpose / sonnet | ✅ | 1/5 | clean | 17/17 jest |
| 2 | Liquid extension: tách snippet chung + 4 call site + golden test | general-purpose / sonnet | ✅ | 1/5 | clean | 6/6 jest, −128 dòng |
| 3 | Liquid `customGsdLiquid.js`: 2 block inline + golden test | general-purpose / sonnet | ✅ | 1/5 | clean | 10/10 jest |
| 4 | Validation `getRule.js` + test | general-purpose / sonnet | ✅ | 1/5 | clean | 14/14 jest |
| 5 | UI list rule trong `ProductAndCollection.js` + key i18n | general-purpose / sonnet | ✅ | 1/5 | clean | 39/39 jest + eslint |
| 6 | `yarn update-label` + verify cuối toàn nhánh | inline | ✅ | 1/5 | clean | build + 3530 pass |

### Log

#### ✅ Task 1: Settings default + type + helper `normalizeShippingRules`
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: `productAndCollection.shippingRules` có trong defaults và type; helper thuần
    `normalizeShippingRules()` + `getBaseShippingRate()` trả đúng shape cho mọi input rác; jest xanh.
  - Files allowed:
    - `packages/functions/src/config/default.js`
    - `packages/functions/src/types/schema/schemaProduct.d.ts`
    - `packages/functions/src/helpers/structuredData/shippingRules.js` (mới)
    - `packages/functions/src/helpers/structuredData/__tests__/shippingRules.test.js` (mới)
  - Approach: helper thuần, không chạm Firestore/`process.env` — FE sẽ import qua alias
    `@functions/*` nên nó phải an toàn trong bundle FE. Loại: nhét logic vào service backend
    (FE vẫn cần dùng lúc validate, sẽ thành hai bản định nghĩa lệch nhau).
  - Test command: `npx jest packages/functions/src/helpers/structuredData` — pass, ≥8 case.
  - Risk: `default.js` là settings mặc định cho mọi shop mới. Thêm field là additive, nhưng shop
    cũ không có `shippingRules` → helper bắt buộc chịu được `undefined`/không phải mảng mà không throw.
  - Rollback: additive hoàn toàn, `git revert` commit.

#### ✅ Task 2: Liquid extension — tách snippet chung + 4 call site
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: 4 block `OfferShippingDetails` trùng nhau trong
    `extensions/theme-app-extension/snippets/avada-product-and-collection.liquid` gộp thành một
    snippet `avada-shipping-details.liquid`; snippet emit `hasShippingService.shippingConditions`
    khi shop có `shippingRules`, và emit **byte-tương đương** bản cũ khi không có.
  - Files allowed:
    - `extensions/theme-app-extension/snippets/avada-shipping-details.liquid` (mới)
    - `extensions/theme-app-extension/snippets/avada-product-and-collection.liquid`
    - `__tests__/shippingDetailsSnippet.test.js` (mới, ở root worktree)
  - Approach: `{%- render 'avada-shipping-details', pc: productAndCollection, excludeFields: excludeFields -%}`
    — `render` là scope cô lập nên phải truyền tham số tường minh; pattern này đã dùng sẵn ở
    `blocks/avada-seo.liquid:15-89`. Gate `if showShippingDetails` + `unless excludeFields contains`
    chuyển hẳn vào trong snippet để call site còn đúng một dòng. Loại: sửa tại chỗ cả 4 block —
    chính cách đó đã đẻ ra divergence ở `customGsdLiquid.js:284`, và nhân logic rule lên 4 bản.
  - Test command: `npx jest __tests__/shippingDetailsSnippet` — pass.
  - Risk: 4 call site nằm trong 4 ngữ cảnh JSON khác nhau; sai dấu phẩy hoặc sai gate làm **vỡ
    toàn bộ JSON-LD** của trang product/collection trên mọi shop đang bật feature. Golden test
    `JSON.parse` là cái chặn.
  - Rollback: `git revert` commit; snippet mới không được theme nào tham chiếu sau khi revert.

#### ✅ Task 3: Liquid `customGsdLiquid.js` — 2 block inline
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: 2 block shipping trong `customGsdLiquid.js` (`:179` product node, `:225` offer node) emit
    `hasShippingService` giống hệt snippet của Task 2; không rule → không đổi output.
  - Files allowed:
    - `packages/functions/src/config/customGsdLiquid.js`
    - `packages/functions/src/config/__tests__/customGsdShipping.test.js` (mới)
  - Approach: sửa inline. Không tách snippet chung được: `updateCustomGsdTheme.js:13-48` ghi **một**
    file .liquid cho mỗi loại schema vào theme merchant, thêm file thứ hai sẽ phải sửa cả chuỗi
    include — vượt phạm vi ticket.
  - Test command: `npx jest packages/functions/src/config/__tests__/customGsdShipping` — pass.
  - Risk: chuỗi này được ghi thẳng vào theme merchant. Liquid sai = vỡ JSON-LD của shop đi đường
    custom GSD. Lưu ý đường này đọc metafield **khác** (`shop.metafields['avada-seo-gsd']`), đừng
    đổi tên biến.
  - Rollback: `git revert`; theme merchant chỉ nhận bản mới ở lần ghi kế tiếp.

- Rounds used: 1/5
- Kết quả: `npx jest packages/functions/src/helpers/structuredData` → **17/17 pass**, 0.474s.
  Diff: `default.js` +1 dòng (`shippingRules: []`), `schemaProduct.d.ts` +6 (interface `ShippingRule`),
  2 file mới `helpers/structuredData/shippingRules.js` + test.
- Review: đạt. Helper thuần thật (không Firestore/env/logger), JSDoc nói đúng *tại sao* chứ không
  lặp signature. `normalizeShippingRules` không kiểm chồng lấn rule — đúng, việc đó của Task 4.
- Security check (§8) trên diff 2 file + 2 file mới: **clean**.
  1 không secret · 2 không log gì cả · 3 không chạm Firestore/query nên scoping N/A ·
  4 input bị coerce + lọc trước khi dùng · 5 không đụng `.env*`/lockfile/CI/`firebase.json` ·
  6 không thêm dep, không gọi ra ngoài · 7 blast radius: `default.js` là default cho shop mới,
  thêm mảng rỗng là additive, shop cũ thiếu field thì helper trả `[]`.
- Completed: 2026-09-22

#### ✅ Task 4: Validation `getRule.js`
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: form chặn được rule sai và rule chồng lấn trước khi lưu, để Liquid tin được thứ tự đã lưu
    mà không phải sort.
  - Files allowed:
    - `packages/assets/src/helpers/productAndCollection/getRule.js`
    - `packages/assets/src/helpers/productAndCollection/__tests__/getRule.test.js` (mới)
    - `packages/assets/src/pages/StructuredV2/StructuredV2.json` (chỉ thêm 2 key message)
  - Approach: hai key `custom` trong object rule sẵn có — `shippingRules` (từng dòng hợp lệ) và
    `shippingRulesOverlap` (hai khoảng không giao nhau), cả hai `depends` vào `showShippingDetails`.
    Framework `useFormValidation` (`hooks/FormValidationHook.js`) chỉ trả **một** message cho mỗi
    key nên tách hai key là cách duy nhất phân biệt được hai loại lỗi. Loại: validate từng dòng với
    key động `shippingRules.0.rate` — framework không đọc key lồng, sẽ câm.
  - Test command: `npx jest packages/assets/src/helpers/productAndCollection` — pass.
  - Risk: validation quá chặt sẽ **khoá nút Save của shop đang chạy**. Nên cả hai rule bắt buộc
    `depends` trả false khi `shippingRules` rỗng — shop chưa dùng feature không bao giờ chạm tới nó.
  - Rollback: `git revert`.

#### ✅ Task 2 — kết quả
- Rounds used: 1/5
- `npx jest __tests__/shippingDetailsSnippet` → **6/6 pass**, 0.476s.
- Diff: `avada-product-and-collection.liquid` **−128 dòng / +4** (4 block gộp thành 4 dòng `render`);
  file mới `snippets/avada-shipping-details.liquid` + `__tests__/shippingDetailsSnippet.test.js`.
- Review: đạt. Đã đối chiếu diff `-U4`: cả 4 dòng `render` nằm **đúng vị trí** block cũ trong cùng
  ngữ cảnh JSON (sau một value, trước `hasMerchantReturnPolicy`/`offers`), nên dấu phẩy dẫn đầu vẫn
  hợp lệ. `grep OfferShippingDetails` trong file cha = 0. Filter `default: 0` chạy đúng dưới
  `liquid@4` (case minValue 0 có assert).
- Security check (§8): **clean**.
  1 không secret · 2 không log · 3 Liquid chạy trong theme của chính shop, không có đường chéo tenant ·
  4 giá trị rule là số đã qua validate ở T4 · 5 không đụng file cấm · 6 không thêm dep
  (`liquid@4.1.0` đã có sẵn trong `packages/functions/package.json:97`) · 7 blast radius đã ghi ở plan.
- **Finding ngoài phạm vi, không sửa:** `currency` và `country` là free-text merchant gõ, được nội
  suy thẳng vào JSON không escape — merchant gõ dấu `"` là vỡ toàn bộ JSON-LD. Lỗi này **có sẵn từ
  trước**, code mới chỉ giữ nguyên parity. Nên tách ticket.
- **Khoảng trống test đã biết:** golden test chỉ render snippet **rời**, không render cả file cha.
  Tính hợp lệ JSON của file cha sau khi chèn `render` chưa được máy kiểm — chặn bằng việc thay 1:1
  đúng vị trí cũ, đã soát tay bằng diff.
- Completed: 2026-09-22

#### ✅ Task 4 — kết quả
- Rounds used: 1/5
- `npx jest packages/assets/src/helpers/productAndCollection` → **14/14 pass**, 0.462s. 4 rule cũ
  (`validFrom`, `priceValidUntil`, `handlingTimeMax`, `transitTimeMax`) có assert riêng, chứng minh
  không vỡ.
- Diff: `getRule.js` +49, `StructuredV2.json` +2 key, 1 file test mới.
- Review: đạt. `hasOverlap` chạy qua `normalizeShippingRules` (đã sort) rồi so từng cặp liền kề —
  đúng, vì rule rác đã bị loại trước và rule `shippingRules` bắt riêng loại lỗi đó. Tier vô hạn ở
  **cuối** không bị coi là chồng lấn, ở **giữa** thì bị — đúng ngữ nghĩa. Comment nói *tại sao* biên
  chạm nhau được chấp nhận, không narrate code.
- Security check (§8): **clean**. Không secret, không log, không chạm Firestore; validate thuần FE;
  không đụng file cấm; không thêm dep (import helper T1 qua alias `@functions/*` — pattern có sẵn,
  helper đã xác nhận thuần). Blast radius: rule sai có thể **khoá nút Save của shop đang chạy** —
  chặn bằng `depends` trả false khi `shippingRules` rỗng/thiếu, có 3 test phủ đúng điều đó.
- Completed: 2026-09-22

#### ✅ Task 5: UI list rule trong `ProductAndCollection.js`
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: merchant thêm/sửa/xoá được rule theo ngưỡng giá trị đơn, ngay dưới phần Shipping
    Information đang có; shop không dùng thì màn hình y như cũ.
  - Files allowed:
    - `packages/assets/src/pages/StructuredV2/Edit/Form/ProductAndCollection.js`
    - `packages/assets/src/helpers/productAndCollection/shippingRuleRows.js` (mới)
    - `packages/assets/src/helpers/productAndCollection/__tests__/shippingRuleRows.test.js` (mới)
    - `packages/assets/src/pages/StructuredV2/StructuredV2.json` (chỉ thêm key mới)
  - Approach: logic thêm/sửa/xoá dòng tách ra helper thuần để **test được** — repo **không có** hạ
    tầng test component (không testing-library, không enzyme, không jsdom), nên component chỉ còn là
    lớp vỏ gọi helper. Giữ nguyên TextField `price` làm "rate mặc định", list rule là phần tuỳ chọn
    bên dưới; khi list có rule thì hiện Banner nói rõ rate công bố ở offer level lấy từ rule đầu.
    Loại: ẩn/đồng bộ ngầm `price` theo rule đầu — hai nguồn sự thật đồng bộ ngầm là cách sinh bug câm.
  - Test command: `npx jest packages/assets/src/helpers/productAndCollection` +
    `DISABLE_V8_COMPILE_CACHE=1 npx eslint packages/assets/src/pages/StructuredV2/Edit/Form/ProductAndCollection.js`
    — cả hai sạch.
  - Risk: màn hình Structured Data là màn hình thật của merchant; JSX vỡ = trắng trang. Không có
    test render nên eslint + build là lưới duy nhất; build chạy ở Task 6.
  - Rollback: `git revert`.

#### ✅ Task 3 — kết quả
- Rounds used: 1/5
- `npx jest packages/functions/src/config/__tests__/customGsdShipping` → **10/10 pass**, 0.447s.
  Test chạy cả hai block qua `describe.each` và có riêng một case assert **hai block cho cùng một
  shape** — đúng chỗ file này từng lệch.
- Cách tách fragment để render: cân bằng **độ sâu tag Liquid** (`if`/`unless`/`for`/`case`/`comment`
  ↔ `end*`), không đếm ngoặc — nên miễn nhiễm với chỗ trộn `[` và `{` trong `hasShippingService`.
  Robust, không brittle.
- Diff: `customGsdLiquid.js` +68/−4, 1 file test mới. Shape giống hệt snippet của Task 2.
- Review: đạt. `assign` nằm trong `unless` của từng block, không rò sang block kia.
  `shippingDestination`/`deliveryTime` giữ nguyên byte. Block collection `:284` không bị đụng.
  Đã kiểm: **0 backtick và 0 `${`** thêm mới vào template string — không làm vỡ chuỗi JS.
- Security check (§8): **clean**. Không secret, không log, không Firestore; không đụng file cấm;
  không thêm dep. Blast radius: chuỗi này ghi thẳng vào theme merchant, sai Liquid = vỡ JSON-LD —
  golden test 10 case là lưới chặn; theme chỉ nhận bản mới ở lần ghi kế tiếp nên rollback được.
- **Lệch nhỏ, cố ý bỏ qua:** Task 2 dùng `{{ rule.minPrice | default: 0 }}`, Task 3 dùng
  `{{ rule.minPrice }}`. UI luôn ghi `minPrice`, cả hai đều có test phủ case `minValue: 0` → không
  phải bug, không sửa để khỏi nới diff.
- **Báo cáo sai của agent, đã kiểm và bác bỏ:** agent báo `packages/scripttag/…/avada-product-and-collection.liquid`
  và `packages/functions/src/helpers/productAndCollection/getRule.js` đang bị sửa. `git status` **không**
  có hai file đó. `scripttag` không hề dính shipping (khảo sát ban đầu: 0 hit). Agent đọc nhầm đường dẫn.
- Completed: 2026-09-22

#### ✅ Task 5 — kết quả
- Rounds used: 1/5
- `npx jest packages/assets/src/helpers/productAndCollection` → **39/39 pass** (25 mới + 14 của T4,
  T4 không vỡ). ESLint trên 2 file → exit 0, không output.
- Diff: `ProductAndCollection.js` +133, `StructuredV2.json` +9 key, 2 file mới (helper + test).
- Review: đạt. Polaris đúng chuẩn (không raw `div`, không inline style), mọi string mới qua i18n,
  logic dòng nằm hết trong helper thuần nên test được dù repo không có hạ tầng test component.
  Lỗi validation hiện bằng `<Text tone="critical">` một lần dưới list — đúng, vì đây là lỗi của cả
  danh sách chứ không của một field.
- **Nit không chặn:** `key={index}` trên list xoá được là anti-pattern React. Ở đây mọi TextField
  đều controlled bằng `value` nên giá trị vẫn đúng sau khi xoá dòng; chỉ vị trí focus có thể nhảy.
  Không sửa để khỏi nới diff.
- Security check (§8): **clean**. Không secret, không thêm log, FE thuần không query, không đụng
  file cấm, không thêm dep.
- Completed: 2026-09-22

#### ✅ Task 6: i18n + verify cuối
- Agent: inline
- Status: ✅ completed
- Rounds used: 1/5
- **Chọn công cụ dịch:** không có `GOOGLE_TRANSLATE_API_KEY` ở đâu (`.env` của main checkout: 0 match),
  ollama local chỉ có model cloud (`glm-5.3:cloud`, `gemma4:cloud`) — thiếu `qwen3.5:9b` mà
  `autoTranslateLocal.js` hardcode. Dùng `yarn update-label-claude-cli`. Script này **incremental**:
  `collectStrings` chỉ lấy key lệch giữa `en.json` và `origin.json`. Probe trả về **548 ký tự** =
  đúng 11 string mới, không drift.
- **Bug orphan phát hiện và đã vá (Tony duyệt):** `Subscription.referralApplied`
  (`"Referral code applied"`) được gọi thật ở
  `packages/assets/src/pages/Subscription/Components/UserChargeInfo/UserChargeInfo.jsx:95` nhưng
  **không có trong `Subscription.json`** → generator không sinh ra, mọi lần chạy `update-label` sẽ
  xoá nó khỏi cả 14 file locale. Nó sống tới giờ vì ai đó sửa tay file generated. Đã thêm đúng 1
  dòng vào `Subscription.json` để generator sinh lại được, hết vĩnh viễn.
- **Audit ngữ nghĩa 14 file locale sau khi chạy:** `en.json`/`origin.json` +11/−0/~0.
  9 locale +27/−0 (11 của mình + 16 lỗ hổng có sẵn được lấp). `it`/`iw`/`nb` +100/−2 — 2 key bị xoá
  là `Google.v2.sitemaps.errorCount` và `warningCount`: **không có trong `en.json` master** và
  **không chỗ nào `i18n.translate`** chúng (các hit `errorCount` trong code là biến JS khác) → key
  chết, xoá là đúng. **Không có key nào bị đổi giá trị.**
- Phần còn lại của diff locale (~400 dòng/file) là **đảo thứ tự key** — master đang lệch với output
  generator. Tony chốt nhận hết một lần.
- **Verify:**
  - `yarn production:embed` (vite build FE) → **✓ built in 22.86s**. Đây là lưới duy nhất chứng minh
    JSX compile vì repo không có test render.
  - `npx jest` toàn repo → **3530 pass / 5 fail**. Cả 5 đều **có sẵn trên master**: dựng worktree
    baseline từ `origin/master` và chạy đúng 6 suite đó → fail y hệt 3 suite
    (`shopify2026Client`, `onPageListQuery.helpers`, `workListStore`). 3 suite báo
    "Test suite failed to run" chạy riêng thì **pass 16/16** → artifact chạy song song, không phải
    code mình. `detect-changed-functions` fail vì nhánh chưa push. 56 suite còn lại nằm trong
    `packages/functions/lib/` (build cũ) — đúng như `packages/functions/CLAUDE.md` cảnh báo.
- **Security check (§9) trên toàn nhánh** (22 file tracked + 6 đường dẫn mới): **clean**.
  1 quét secret/token/key trên mọi dòng thêm và mọi file mới → 0 hit · 2 **0** dòng `console.*` thêm mới ·
  3 không thêm dòng Firestore/query nào, scoping không đổi · 4 input là settings của chính merchant,
  đã qua `normalizeShippingRules` + validation · 5 không đụng `.env*`, lockfile, `.gitlab-ci.yml`,
  `firebase.json`, `.firebaserc`, rules · 6 **0 file `package.json` đổi** → không dep mới, nên
  không cần commit `yarn.lock`, CI immutable install không bị ảnh hưởng · 7 blast radius ghi ở từng task.

---

## COMPLETE — 2026-09-22

6/6 task ✅, mỗi task 1/5 round, security **clean** ở cả 6 và ở lần quét toàn nhánh.

**Đã sửa:** 22 file tracked + 6 file mới. Diff thật của code là ~390 dòng; phần còn lại là locale
generated.

**Test mới: 64** — 17 helper `shippingRules`, 6 golden render snippet extension, 10 golden render
`customGsdLiquid` (cả 2 block), 14 validation `getRule`, 25 `shippingRuleRows` (trừ trùng đếm: tổng
suite `productAndCollection` là 39). Trước ticket này **shippingDetails không có test nào**.

**Còn lại, chưa làm:**
- Nhánh **lùi 3 commit** so với `origin/master` (master chạy tiếp trong lúc làm: `70792f953a`,
  `25f5bbdd04`, `a80300c05a`). 3 commit đó chỉ đụng `avada-seo-social.liquid` và
  `__tests__/themeExtensionSocialGate.test.js` — **không trùng file nào** với nhánh này, rebase sạch.
  Chưa rebase, chưa commit, chưa push.
- Chưa deploy (deploy thủ công, và prod SEO deploy theo tag chứ không theo merge master).

**Finding ngoài phạm vi, không sửa:**
1. `ProductAndCollection.js:52` có `console.log('ProductAndCollection data', data)` — in nguyên
   object settings ra console mỗi lần render. **Có sẵn trên `origin/master`** (dòng 45), không phải
   do nhánh này thêm. `packages/assets/CLAUDE.md` gọi đây là lỗi chặn khi review code.
2. `currency` và `country` là free-text merchant gõ, nội suy thẳng vào JSON-LD không escape —
   merchant gõ dấu `"` là vỡ toàn bộ structured data của trang. Có sẵn từ trước.
3. Hai bug đã chốt bỏ từ đầu: default `showShippingDetails: true` + `price: 0` + `country: 'BR'`
   sai fleet-wide; `customGsdLiquid.js` block collection thiếu `shippingDetails`.

---

## Shipped — 2026-09-22

| | |
|---|---|
| MR | https://git.avada.net/avada/seo/-/merge_requests/2304 — open, `remove_source_branch` bật |
| Branch | `feat/FAL-920-conditional-shipping` @ `d956073fae`, rebase lên `origin/master` (`a80300c05a`), 0 behind |
| Commits | `618cb15266` feature · `d956073fae` feature doc |
| Pipeline | https://git.avada.net/avada/seo/-/pipelines/220354 — **success** (job duy nhất là `docs_gate`; CI repo này không chạy test) |
| Jira | comment `15928` trên FAL-920, kèm link MR + ghi chú deploy |

### Hai lần gate chặn, đã vá

1. **Pre-commit hook eslint** chặn commit đầu: `__tests__/shippingDetailsSnippet.test.js` thiếu
   JSDoc (`require-jsdoc`), rồi `valid-jsdoc` đòi `@return` chứ không phải `@returns`. Root
   `__tests__/` áp config chặt hơn `packages/`. Đây là lỗ hổng thật trong quy trình T2 — agent đó
   chạy jest nhưng không chạy eslint lên file test root. Hook bắt được.
2. **`docs_gate` fail pipeline đầu** (`220349`): nhánh đổi 25 file feature mà không có
   `docs/features/*.md`. Đã viết `docs/features/conditional-shipping-rates.md` (176 dòng) theo đúng
   convention của `product-stock-filter.md`. Gate chạy lại: citations **542 → 552 anchored**, tức
   10 citation `file:line` trong doc mới đều verify được trên disk. **PASS**.

### Cố ý KHÔNG làm

- **Không đặt `[deploy-extensions]` trong commit title.** Job `deploy-shopify-extension:production`
  (`.gitlab-ci.yml:2173`) fire khi ref là `master` **và** title khớp marker đó. Nếu merge kiểu squash
  mang title nhánh lên master, extension sẽ deploy thẳng production lúc merge. Deploy là quyết định
  thủ công → marker để Tony tự thêm khi muốn ship. Đã ghi rõ trong MR description và comment Jira.
- Không rotate/đụng secret nào, không sửa 2 bug ngoài phạm vi, không đụng `console.log` có sẵn.

---

## Resolve conflict với master — 2026-09-22

Master nhận `e849fee573 feat(structured-data): exclude product schema per page type`
(MR merge `5a70157c3b`) — đụng đúng vùng structured data. MR !2304 chuyển sang `has_conflicts: True`.

### Master đổi gì

| File | Master làm gì | Đụng mình không |
|---|---|---|
| `avada-product-and-collection.liquid` | bọc cả nhánh product bằng `{%- if productAndCollection.excludeOnProductPage != true -%}` (+2 dòng) | có — mình xoá 128 dòng bên trong |
| `ProductAndCollection.js` | thêm toggle `excludeOnProductPage` (+20) | có |
| `StructuredV2.json` | +2 key `excludeOnProductPage*` | có |
| `Subscription.json` | **thêm đúng `referralApplied`** + chuẩn hoá `"text" :` | có |
| 14 file locale | chạy `update-label` riêng → hấp thụ luôn phần đảo thứ tự | có |

Master độc lập vá **đúng cùng** bug orphan `Subscription.referralApplied` mình phát hiện. Người khác
cũng đâm vào nó. Sau rebase, bản của master thắng (nó có thêm phần chuẩn hoá whitespace) → vá của
mình thành thừa, đúng như mong muốn.

### Cách resolve

Rebase `origin/master`. Conflict **chỉ ở 12 file locale**; toàn bộ code auto-merge sạch.
Dùng `git rebase -X ours` — trong rebase "ours" là upstream (master) — nên 12 file generated lấy
bản master, code không conflict vẫn merge bình thường.

**Bẫy đã tránh:** `en.json` và `origin.json` auto-merge nên đã mang 11 key của mình, trong khi 12
locale dịch thì không. Script `update-label` diff `en.json` (main) với `origin.json` (old) — cả hai
đã có key thì nó dịch **0 string** và lỗi im lặng. Phải đưa `origin.json` về mốc master trước, lúc
đó probe mới trả đúng 548 ký tự = 11 string.

### Kiểm sau merge (không tin auto-merge)

- Liquid: tag balance script → **balanced**; wrapper `excludeOnProductPage` của master còn nguyên;
  4 dòng `render 'avada-shipping-details'`; `OfferShippingDetails` trong file cha = **0**.
- `ProductAndCollection.js` vs master: **132 thêm / 1 bớt**; 4 chỗ `excludeOnProductPage` của master
  còn nguyên ở `:596-608`.
- `StructuredV2.json` vs master: chỉ thêm 11 key của mình, 2 key của master không bị đụng.
- Locale vs master: **+11 key mỗi file, 0 xoá, 0 đổi giá trị** — sạch hơn lần đầu, vì master đã nuốt
  phần đảo thứ tự rồi.
- `npx jest` 6 suite liên quan (gồm `themeExtensionSocialGate` của master) → **74/74 pass**.
- `yarn production:embed` → ✓ built in 18.87s. ESLint sạch. `docs-gate` **PASS**.

### Kết quả

- Branch `feat/FAL-920-conditional-shipping` @ `4414e4ae46`, **0 behind / 3 ahead**.
- Commit thứ 3: `chore(i18n): re-run update-label after rebasing onto master` — locale bị rebase lấy
  bản master nên phải sinh lại, ghi riêng cho đúng lịch sử.
- Force-push `--force-with-lease`. Pipeline `220369` **success**.
- MR !2304: `has_conflicts: False`, `detailed_merge_status: mergeable`.
