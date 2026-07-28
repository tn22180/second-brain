app SEO: 
- SEO checklist: lấy điểm và danh sách issue checklist mà không cần rescan. Đường đọc-cache duy nhất (isReloadCheckList=true) trả rỗng, phải rescan mất thời gian
- lấy danh sách các page có issue meta title/description (length) ở checklist ko e?

---

## Progress

Started: 2026-07-28

Consumer: **CS AI tool**, không qua App Proxy, không có Shopify session.
Spec: `projects/Falcon/seo/docs/superpowers/specs/2026-07-28-cs-checklist-read-api-design.md`

### Findings

- Nhánh `CHECKLIST_KEY` ở `localStorageController.js:21-34` **dead** — không caller nào trong
  `packages/` gọi `GET /localStorages/avada-seo-checklist`. Admin app đọc checklist qua Firestore
  `onSnapshot` (`assets/src/helpers/firebase/seoScore.js:9-16`). Logic cũng đảo so với tên biến:
  `isReloadCheckList !== 'true'` mới rescan; `=== 'true'` không match nhánh nào → `ctx.body` không
  được set → rỗng. Để nguyên theo rule dead-code của repo.
- `pages[]` (URL page vi phạm) **đã có sẵn** trong checklist đã lưu —
  `services/audit/issues/metaTitleLength.js:28` → `Audit.getPages`, sống sót qua
  `convertDataIssue` (`audit.js:164`). Không cần scan logic mới.
- Crawl scope tối đa 4 URL/shop (`audit.js:307-339`) → `pages[]` ≤4 phần tử, payload bé.

### Decisions

| Câu hỏi | Chốt |
|---|---|
| Surface | `handlers/internalTools.js` (`internalGen2`) — machine-to-machine, không proxy |
| Token | Dùng chung `INTERNAL_REDIS_TOKEN` (đánh đổi: token CS mở luôn Redis dump) |
| Nhánh dead FE | Để nguyên, ghi vào spec |
| Số endpoint | 1 — `types` CSV filter phủ cả 2 yêu cầu |

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Add `GET /internal/seo-checklist` route | ✅ | `handlers/internalTools.js` |
| 2 | Extract pure checklist mapper (issueFixed, types, scanned) | ✅ | tách ra `helpers/checklist/buildChecklistPayload.js` — spec nói "cùng file", sai: import handler kéo theo Firestore+Redis |
| 3 | Unit test mapper + run `npx jest` | ✅ | 11/11 pass |
| 4 | Document endpoint cho CS | ✅ | `docs/features/seo-audit.md` + 2 gotcha |

### Log

#### ✅ Task 1: Add GET /internal/seo-checklist route
`packages/functions/src/handlers/internalTools.js` — route mới trên `internalGen2`, dùng luôn token
gate `X-Internal-Token` sẵn có. Flow: `getShopByShopifyDomain` → `getStorages(shopId, CHECKLIST_KEY)`
→ `formatDateFields` → mapper. **Không rescan.** 400 / 404 / 500 theo spec.
Bẫy gặp phải: `getShopByShopifyDomain` trả doc id ở key `fireStoreId`, không phải `id`
(`shopRepository.js:138`). Dùng fallback `shop?.id || shop?.fireStoreId` như `swaggerAuth.js:33`.

#### ✅ Task 2: Extract pure checklist mapper
`packages/functions/src/helpers/checklist/buildChecklistPayload.js`. Ban đầu viết inline trong
handler theo spec, phải tách ra: `internalTools.js` import `shopRepository`, kéo theo
`shopifyService`/`shopifyGraphQlService` + `new Firestore()` lúc module load → test không import nổi.
Mapper lo 3 việc: merge `issueFixed`, filter `types`, và short-circuit `scanned:false`.

#### ✅ Task 3: Unit test mapper + run jest
`helpers/checklist/__tests__/buildChecklistPayload.test.js` — **11/11 pass** (0.375s).
Full suite: 1424 pass / 9 fail. 9 fail đó **pre-existing trên master** — verify bằng cách stash
change rồi chạy lại, fail y hệt. 4/9 nằm trong `.claude/worktrees/worker-pubsub-migration/`.
`npx eslint` gãy sẵn trong repo (`async-function/require.mjs` ESM + `v8-compile-cache`), không phải
do change.

#### ✅ Task 4: Document endpoint cho CS
`docs/features/seo-audit.md` — section "Checklist read API (internal / CS tooling)" + 2 gotcha
(nhánh dead + đảo logic của `/localStorages/:field`; hai key id của shop).

---

## COMPLETE

**Files:**
| File | |
|---|---|
| `packages/functions/src/handlers/internalTools.js` | modified — route mới |
| `packages/functions/src/helpers/checklist/buildChecklistPayload.js` | new — mapper thuần |
| `packages/functions/src/helpers/checklist/__tests__/buildChecklistPayload.test.js` | new — 11 test |
| `docs/features/seo-audit.md` | modified — contract + gotcha |
| `docs/superpowers/specs/2026-07-28-cs-checklist-read-api-design.md` | new — **gitignored** (`.gitignore:13` khớp `specs`), local-only |

Chưa commit, chưa deploy. Deploy chỉ cần `internalGen2`; `INTERNAL_REDIS_TOKEN` đã có sẵn trong
env CI mỗi project, không cần thêm env.

### Đính chính (sau khi push MR)

`pages[]` **không phải mảng URL** — tao ghi sai ở lượt đầu. `Audit.getPages` → `d.page`, mà `d.page`
là object dựng ở `helpers/seoSpeed.js:284-295`:

```js
{pageType: 'home'|'blog'|'product'|'collection', url,
 data: {metaTitleContent, metaTitleLength, metaDescContent, metaDesLength, metaOgDescContent}}
```

→ API trả **giàu hơn** mô tả cũ: URL + nội dung tag hiện tại + độ dài fail. Code không sai, chỉ docs
sai. Fix ở commit `5b3a4629739`, test fixture sửa theo shape thật, 11/11 vẫn pass.

**Giới hạn thật của yêu cầu #2:** checklist chỉ crawl tối đa **4 URL/shop** (`audit.js:307-339`) —
home, blog đầu, product published đầu, collection đầu. Nên `pages[]` tối đa 4 dòng, mỗi page type 1
dòng. Trả lời được "page nào fail meta length **theo checklist**". **Không** trả lời được "mọi
product trong store có meta title length xấu" — cái đó nằm ở collection `analysis` (per-resource),
nguồn khác, endpoint khác.

**Token:** chốt dùng chung `INTERNAL_REDIS_TOKEN`, không tách `INTERNAL_CS_TOKEN`. Đánh đổi đã
biết và chấp nhận: token giao cho CS mở luôn được `/internal/redis-cache/dump` (preview value cache
cross-shop). Quyết định đóng, không mở lại.
