# SEO API — 3 gap Esther báo (2026-08-12)

Repo `seo`, branch `fix/v25-optimize-stuck-stop` (nội dung == master, không có commit riêng).
Chưa commit, chưa deploy.

| # | Gap | Trạng thái trước | Bây giờ |
|---|-----|------------------|---------|
| 1 | Bật/tắt app embed | "có nhưng no-op / không fix được" | **Sai chẩn đoán** — fix được, đã fix |
| 2 | Đếm ảnh missing alt | Xong | Không đụng |
| 3 | Checklist score + issues không rescan | "chưa có, cần dev" | Đã có ở `/internal`, nay mở luôn trên API public |

---

## 1. App embed — bug thật, không phải giới hạn Shopify

Kết luận cũ ("Shopify không cho app bật/tắt app embed, merchant phải tự bật trong Theme Editor")
**sai**. App này ghi thẳng `config/settings_data.json` qua `themeFilesUpsert` từ lâu rồi:
`toggleAppEmbed()` — `packages/functions/src/services/shopifyService.js:1157`. Scope `write_themes`
đã có (`config/shopify.js:12`).

Nhầm là do test sai endpoint:

- `POST /api/shopify/enable-embed` → chỉ ghi metafield `avadaSEO.enable = 'true'` trên app
  installation. Metafield đó chỉ gate *block picker* trong Theme Editor (`available_if`), không bật
  embed. Hardcode `'true'`, không có đường tắt. Đây là DevZone tool, không phải API toggle →
  đúng là "success:true mà không đổi gì".
- `POST /api/shop/status {appStatus: bool}` mới là endpoint toggle thật.
- `GET /api/shop/appStatus` đọc state thật từ theme (`shopController.js:157`).

### Bug thật trong `toggleAppEmbed` — 27 shop fail / 30 ngày trên prod

```
[toggleAppEmbed] error <shopId> Cannot create property 'blocks' on string 'Dawn'
TypeError: Cannot create property 'blocks' on string 'Dawn'
    at toggleAppEmbed (/workspace/lib/services/shopifyService.js:1268:37)
```

Đếm từ log prod `avada-seo`, 30d: **Dawn 20 · Rise 4 · Trade 2 · Tails 1**. Cộng 2 lần 429.

`settings_data.json` có `current` là *tên preset* (string) chứ không phải object. Code cũ chỉ xử
lý đúng chuỗi `'Default'`; theme nào đặt preset tên khác thì `current` vẫn là string → gán
`.blocks` lên string → TypeError.

**Fix** (`shopifyService.js`):
- Normalize mọi tên preset, không riêng `'Default'`; copy preset thay vì alias (tránh ghi đè luôn
  preset gốc của theme).
- `handleThemeFilesUpsert` trả `{success:false, error}` chứ **không throw** → theme write bị từ
  chối mà caller vẫn báo `success:true`. Nay throw.

**Fix** (`shopRepository.js:updateAppStatus`): chạy `toggleAppEmbed` trước, tách khỏi `Promise.all`.
Trước đây chạy song song với Firestore update nên khi theme fail thì `appStatus` trong doc vẫn đã
lật — doc nói bật, storefront thì không. Thêm `data:{appStatus}` vào response.

---

## 3. Checklist đọc cache

Bug thật: `localStorageController.get()` — `isReloadCheckList !== 'true'` là nhánh **rescan**.
Gọi với `isReloadCheckList=true` rơi hết mọi `if`, `ctx.body` không bao giờ set → **body rỗng**.
Tức là không tồn tại đường đọc cache; rescan là cách duy nhất.

Fix:
- `GET /api/localStorages/avada-seo-checklist?isReloadCheckList=true` → trả checklist đã lưu.
- `GET /api/seo-score` → thêm `issues[]` + `scanned`. Đây mới là endpoint nên khuyên Esther dùng.
  Cả hai xài chung `buildChecklistPayload` với `GET /internal/seo-checklist` nên score/issues
  không thể lệch nhau giữa 3 surface.
- Cả hai nhận `?types=a,b` để lọc issue type.

Payload: `{scanned, score, categoryScores, lastScanAt, scanning, issues[]}`.
`scanned:false` = shop chưa scan lần nào (tránh trả `defaultCheckList` placeholder như issue thật).
Issue nào merchant đã dismiss sau scan được merge thành pass.

---

## File đụng

```
packages/functions/src/services/shopifyService.js          toggleAppEmbed
packages/functions/src/repositories/shopRepository.js      updateAppStatus
packages/functions/src/controllers/localStorageController.js  get + getSeoScore
packages/functions/src/docs/{shop,misc,seo-settings}.yaml  swagger
packages/functions/src/services/__tests__/shopifyService.toggleAppEmbed.test.js  (mới)
```

## Test

```
npx jest packages/functions/src/services/__tests__/shopifyService.toggleAppEmbed.test.js
  4 passed
npx jest packages/functions/src/config/__tests__/swagger.test.js
  5 passed
npx jest packages/functions/src
  709 passed, 2 failed   ← 2 fail này có sẵn từ trước (shopify2026Client, workListStore),
                            đã stash code mới và chạy lại để xác nhận
```

Test mới đã verify ngược: revert hunk preset → 2/4 fail. Reproduce đúng bug prod.

`npx eslint` không chạy được ở máy local (`node_modules/async-function/require.mjs` — SyntaxError,
fail trên mọi file kể cả file không đụng). Hook auto-lint cũng dính. Môi trường, không phải code.

## Còn lại

- [ ] Commit + MR
- [ ] Deploy — `[deploy-changed]`; đụng `handlers/exports/*`? Không → selective deploy chạy được
- [ ] Báo Esther đổi endpoint: toggle dùng `POST /api/shop/status`, đọc checklist dùng
      `GET /api/seo-score`. `POST /api/shopify/enable-embed` là DevZone tool, đừng gọi.
- [ ] Cân nhắc: sau khi deploy, grep lại log `Cannot create property 'blocks'` xem về 0 chưa
