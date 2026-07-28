a tuân ơi, e đang làm con ai agent cho app blog
[2:55 PM]e dùng docs swagger trong repo (packages/functions/src/docs) để gọi api
[2:55 PM]check thì docs đang thiếu so với routes/api.js, code 147 route mà docs mới 127
[2:55 PM]thiếu đúng mấy cái e cần: token-history, migrate-credit-to-token, settings/recipe-metafields
[2:55 PM]với articles-with-element-related-post, articles-with-element-faqs, knowledge-base PUT, generate-alt-text
[2:55 PM]ngoài ra body với query param trong docs để trống hết (schema type object)
[2:55 PM]nên biết endpoint mà k biết payload, gọi write api toàn phải mò
[2:55 PM]dev_zone thì docs có 1 dòng thôi, thực tế có 21 type (legacy-plan, set-token, sync-shop-data, create-page...)
[2:55 PM]a bổ sung giúp e vào docs yaml nhé ạ, e cần nhất dev_zone types với body của post /api/shop

---

## Progress

Started: 2026-07-28
Spec: `jobs/specs/2026-07-28-blog-swagger-completeness-design.md`
Repo: `projects/Falcon/blogs`, branch `docs/swagger-completeness` từ `origin/master`

### Đo thực tế (origin/master)

| Món | Code | Docs | Thiếu |
|---|---|---|---|
| Ops `/api` + `/proxy` | 164 | 127 | 37 |
| — `/api` | 147 | 126 | **21** |
| — `/proxy` | 17 | 1 | 16 (ngoài scope) |
| Op có `requestBody` schema thật | 49 | **1** | **48 rỗng** |
| Query param documented | — | **0** | toàn bộ |
| `dev_zone` type | 21 | 1 dòng | **20** |

Bạn kia báo 20 route thiếu — thực tế 37 (chưa đếm `routes/proxy.js`). Con số 21 dev_zone type thì đúng.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Worktree + `check-swagger-coverage.js` | ✅ | reproduce đúng 21/48, exit 1 |
| 2 | Inventory 145 route → controller field (`file:line`) | ✅ | 161/161 accessor attributed |
| 3 | Doc 19 op `/api` còn thiếu | ✅ | undocumented 0/145 |
| 4 | `dev_zone` 21 type (`type` = query param) | ✅ | enum 21, oneOf 8 variant |
| 5 | Fill 48 `requestBody` rỗng | ✅ | 47 fill + 1 xoá, empty = 0 |
| 6 | Query param cho route đọc `ctx.query` | ✅ | 38/38 route, 106 param |
| 7 | Verify + MR | ✅ | commit `1a2a4978a`, đã push; MR chờ auth |
| 8 | Auto-detect + `--fix` sinh stub khi có endpoint mới | ✅ | CI job fail MR + `--fix`, commit `80f693088` |

### Kết quả

| | Trước | Sau |
|---|---|---|
| Route `/api` có doc | 126/145 | **145/145** |
| `requestBody` có schema thật | 1/49 | **57/57** |
| Query param documented | 0 | **106** (38/38 route đọc query) |
| `dev_zone` type | 1 dòng | **21** type + 8 body variant + 4 example |

2 commit trên `docs/swagger-completeness` (worktree `blogs-wt-swagger`), **đã push**:
`1a2a4978a` docs + `80f693088` CI gate. MR chưa tạo — glab token 401.

### Log

#### ✅ Task 1: Worktree + coverage script
- Status: ✅ completed
- Worktree: `projects/Falcon/blogs-wt-swagger`, branch `docs/swagger-completeness` @ `7cdfb4381` (= origin/master)
- File: `packages/functions/scripts/check-swagger-coverage.js` + npm script `check:swagger`
- Output: `routes 147 / spec ops 127 / undocumented 21 / empty requestBody 48 / orphan 0`, exit 1
- `node_modules` symlink từ checkout chính (yarn.lock không đổi giữa master và branch cũ), excluded local — không vào commit
- Script bỏ qua `routes/proxy.js` theo scope; orphan check cũng loại path `/proxy/`

#### ✅ Task 2: Inventory routes
- Status: ✅ completed
- Inventory: `scratchpad/inventory.md` (846 dòng, 1 section/route + Manual findings)
- **Sửa số:** route thật **145** không phải 147 — `api.js:236-237` (`sync-likeFeature`, `sync-featureReq`) comment out, regex ban đầu ăn cả comment. Thiếu **19** op không phải 21. Script đã fix (`stripComments` + regex đa dòng)
- 145 route: 72 đọc body, 38 đọc query, 21 đọc path param, **28 không đọc input gì** (shop lấy từ bearer token qua `getCurrentShop`)
- Accessor spelling trong repo: `ctx.query` 46, `ctx.req.query` 17, `ctx.req.body` 73, `ctx?.req?.body` 5, `ctx.request.body` 2 → 161 dòng, attributed 161, sót 0
- **`dev_zone`: `type` nằm ở `ctx.query` (`devZoneController.js:58`), không phải body** → design task 4 đổi: query enum 21 giá trị + body `oneOf`, bỏ `discriminator`
- **`POST /api/shop`: partial patch tự do**, `updateShopData(shopID, postData)` merge thẳng vào Firestore doc, không whitelist. Field xử lý đặc biệt: `isCustomizeCss`/`cssCode` (mirror sang Shopify metafield), `doneOptimize`, `installedAt`

#### ✅ Task 3: 19 op thiếu
- Status: ✅ completed
- File mới: `token-history.yaml` (token-history ×3 + migrate-credit-to-token). Không tách `knowledge-base.yaml` như spec — `/api/knowledge-base` GET đã nằm ở `misc.yaml`, tách ra 2 file cùng khai báo 1 path là rủi ro merge, nên PUT + `/existing` gộp vào `misc.yaml`
- Sửa thêm: `misc.yaml` (knowledge-base PUT, /existing, blockLoader), `settings.yaml` (recipe-metafields DELETE), `articles.yaml` (7 op), `ai.yaml` (3 op image), `google.yaml` (location), `config/swagger.js` (+tag `Token History`)
- Kết quả: 145 route / 146 op / undocumented **0**
- **Bug bắt được:** `: ` trong plain scalar YAML (vd `` `success: false` `` trong description) làm cả file fail parse. swagger-jsdoc chỉ in warning `Not all input has been taken into account` rồi **bỏ nguyên file** — op tụt 127→101 mà exit code vẫn như cũ
- → thêm check `droppedFiles` vào script: quét text `^/path:` từng file yaml, đối chiếu với spec đã build; file nào có path không tới được spec là fail. Test bằng cách cố tình phá `settings.yaml` → `yaml files not loaded: 1`, exit 1
- Trap cho agent (đã ghi vào description từng op): nhiều endpoint bọc payload trong `{data: {...}}` (export/import-article, compress/revert-image, generate-alt-text, sync-related-post, migrate-faq-heading-tags), số khác flat (`knowledge-base` PUT, `google/location`)

#### ✅ Task 4: dev_zone 21 type
- Status: ✅ completed
- `misc.yaml` `/api/dev_zone` PUT: `type` = **query param required**, enum 21 giá trị
- Body = `oneOf` 8 variant (13/21 type không cần body → variant "No body"): create-file-sidebar, set-token, sync-products-blog, redis-get/del, redis-keys, redis-set, redis-stores
- Bỏ `discriminator` — OpenAPI 3.0 chỉ discriminate được theo property của body, mà selector nằm ở query. Description có bảng 21 type → body → hành vi → số dòng trong `devZoneController.js`
- 4 example dựng sẵn: noBody, setToken, redisSet, redisStores
- Bẫy ghi rõ trong doc: `legacy-plan` **toggle** chứ không set; `update-token-free` fan-out **toàn bộ shop trong app**; `redis-set` ghi đè type cũ của key; mọi `redis-*` trả `success: false` khi thiếu `REDIS_HOST`; lỗi trả HTTP 200 + `success:false`, không phải HTTP error
- `set-token` nhận payload ở root **hoặc** lồng trong `data` (`data?.data ?? data ?? {}`)

#### ✅ Task 5: 48 requestBody
- Status: ✅ completed
- 47 op fill schema thật (properties + required + description + example), 1 op (`POST /api/sidebarAds/theme`) **xoá hẳn `requestBody`** — handler không đọc body, để lại schema là bịa
- Sau task 5: 57 op có `requestBody`, 40 op kèm example
- Free-form thật (handler merge nguyên body vào Firestore, không whitelist): `POST /api/shop`, `/api/shopInfos`, `/api/feedback`, `/api/genClaude`, `/api/sidebarAds`, `/api/competitors`, `/api/element-settings`, `/api/integration/keys`, `/api/featureReqComment`, `/api/langgraph/metadata`
- → thêm quy ước opt-out vào script: `additionalProperties: true` **kèm** `description` = cố ý free-form, không tính là rỗng. `type: object` trần thì không có cả hai, nên không vô tình lách được
- Ghi rõ hành vi bẫy trong description: `POST /api/block-user-req` **xoá sạch feature request** của `blockId`; `PUT /api/settings` gửi cả document chứ không phải patch, thiếu `general.contentProtection`/`effects` là **reset về default**; `POST /api/langgraph/blog` trả **SSE stream** chứ không phải JSON; `POST /api/get-article-customer` lấy `shopId` từ body nên đọc chéo shop; `PUT /api/settings` `structuredData` bị `pick` chỉ giữ 2 field
- Envelope: `{data:{...}}` với article/author/settings/components/seo/support/historyOptimize/integration-keys/featureReq; flat với blog-assist/langgraph/genAiBlog/youtube/feedback/featureReqComment; `google/analytics/config` nhận **cả hai** (`body?.data || body`)

#### ✅ Task 6: Query param
- Status: ✅ completed
- Trước: **0** query param trong toàn spec. Sau: **106** param trên 38/38 route đọc `ctx.query`
- Không chỉ GET — `PUT /api/article/{id}` (locale/primary), `PUT /api/author` (`id`!), `DELETE /api/article` (`ids`), `POST /api/shopify/file` (`key`, `fileName`), `POST /api/article/revert-origin/{id}` đều lấy tham số từ query
- Param bắt buộc mà thiếu là **throw**, không phải default — đã đánh `required: true` + ghi lý do: `GET /api/articles` `order` (`order.split(' ')` không guard, `graphQLConvert.js:79`), `DELETE /api/article` `ids` (`ctx.query.ids.split(',')`, `articleController.js:612`)
- `PUT /api/author` lấy id từ **query** chứ không phải path — dễ gọi sai nhất
- Verify: 55 op có parameters, 0 param trùng, 0 path param thiếu so với `{token}` trong path
- **Chưa gắn vào script:** check "route đọc query mà chưa có param" còn là script rời trong scratchpad, không commit — cần logic đọc controller, nặng hơn 2 check hiện tại

#### ✅ Task 7: Verify + MR
- Status: ✅ completed (trừ push/MR — chờ duyệt)
- `yarn check:swagger` → 145 route / 146 op / undocumented 0 / empty 0 / orphan 0 / dropped 0, **exit 0**
- Spec build + serialize JSON: 104 KB, 126 path, 146 op, 57 requestBody, 128 param (106 query + 22 path)
- `@apidevtools/swagger-parser` (dep transitive có sẵn): **VALID OpenAPI 3.0**
- Structural self-check: 0 duplicate param, 0 path param thiếu, tag 27/27 khớp `config/swagger.js` (0 thừa 0 thiếu)
- Citation check: 108 `file.js:NNN` distinct, 107 in-range; sửa 2 cái sai — `integrationController.js:36-49` (file chỉ 47 dòng → 36-47) và `sidebarAdsController.js:245` → `:246` (245 là `shop,`, dòng branch là 246). Spot-check nội dung 15 citation: 15/15 đúng sau sửa
- `origin/master` không đổi `routes/api.js` + `devZoneController.js` kể từ task 1 → số liệu còn đúng
- Commit `1a2a4978a` trên `docs/swagger-completeness`, 22 file, +3071/-13

**Chưa làm:**
- **eslint chưa chạy được** — `npx eslint` exit 2 với cả file có sẵn (`detect-changed-functions.js`), lỗi boot môi trường (node 22 vs toolchain repo), không phải do thay đổi này
- **Swagger UI chưa render trên browser** — cần boot app kèm Firebase cred. Đã verify cái UI tiêu thụ: `/api/swagger.json` serialize được và pass validator chính thức
- **Chưa push, chưa tạo MR** — chờ duyệt

#### ✅ Task 8: Auto-detect + `--fix` sinh stub
- Status: ✅ completed
- Commit `80f693088`. 2 file: `scripts/check-swagger-coverage.js`, `.gitlab-ci.yml`
- **`--fix`**: đọc controller của route mới → destructure `ctx.req.body`/`ctx.query` thành properties + query param, đoán tag theo path, ghi vào file yaml đang giữ path prefix gần nhất
- Theo binding **1 hop**: `const {data} = ctx.req.body` rồi `const {a,b} = data` ở dòng sau → nhận ra là body envelope `data` có field, không phải object mù. Đây là pattern phổ biến nhất trong repo (23/145 route)
- **Check `todos` mới**: op nào còn chữ `TODO` là fail → stub sinh ra không thể bị nhầm là doc đã viết
- **CI**: stage `check` mới + job `check:swagger-docs`, chạy trên merge_request_event khi đụng `routes/api.js` / `src/docs/**` / `config/swagger.js` / chính script. Fail thì in sẵn lệnh `yarn check:swagger --fix`
- Recall đo trên 145 route thật: bắt được body field ở **39**, query param ở **30**, envelope **23**. Route nào pass `ctx.query` nguyên cục vào service thì không đọc được tên param → stub ghi TODO nói rõ "tên nằm trong service, đọc rồi liệt kê" thay vì im lặng bỏ trống
- Test end-to-end 2 lần: (1) route giả body envelope + query + path param → stub ra đủ 3 body field, 1 query, 1 path, tag `Articles`, đúng file `articles.yaml`; (2) route giả forward `ctx.query` → stub ra TODO cảnh báo. Cả 2 lần `check:swagger` exit 1 vì TODO. Revert xong về baseline exit 0
- `.gitlab-ci.yml` parse OK, 15 job, stage `check` đứng đầu
