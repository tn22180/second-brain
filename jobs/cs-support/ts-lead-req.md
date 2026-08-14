tony ơi có 3 việc bên aeo với ai product copy nhờ e xử giúp a nhé

1. aeo /proxy/swagger-token đang 500 trên prod
a test 5 shop thật (tesbros, freelandco, wacoal22, cart-tek, d0x0kt-ez) đều 500
thiếu ?shop thì 400, token sai 403, shop k tồn tại 404, tức là qua auth r mới chết
chỉ còn đúng dòng jwt.sign(payload, SWAGGER_JWT_SECRET) ở swaggerAuth.js:41
nên chắc là env SWAGGER_JWT_SECRET chưa set trong cloud functions prod của aeo
seo suite cùng code này trả jwt bình thường
đang chết 19/21 tool bên a

2. apc nhánh feature/apidocs đứng từ 22/07 chưa merge
prod /proxy/swagger-token trả 404 nên 13/14 tool apc chết hết
e merge deploy giúp a, nhớ set SWAGGER_JWT_SECRET luôn k lại 404 thành 500

3. trước khi merge nhờ e vá chỗ này đã
swaggerAuth.js:8-27 của apc chỉ nhận ?shop= r phát jwt luôn, k check key nào cả
mà verifySwaggerToken mount global ở handlers/api.js:64 nên jwt đó mở cả /api/*
ai biết shop domain là gọi đc POST /api/credit, PUT /api/shop, /api/generate, /publish
bên aeo làm đúng r (getIntegrationKey(accessToken) → 403), e bê mẫu đó sang nhé

---

## Findings (2026-08-13, trước khi làm)

**Premise #2 sai.** `feature/apidocs` đã merge vào `master` rồi, không đứng từ 22/07.

```
merge commit  6ed6ed6  'Merge branch feature/apidocs into master'
tip           77100ca  2026-08-10 16:21 Tony  docs(api): document the Shopify Flow extension endpoints
tags chứa nó: v1.6.26, v1.6.27, v1.6.28   (v1.6.28 = 2026-08-13)
git diff master...feature/apidocs → rỗng
```

`routes/proxy.js:10` trên master đã có `router.get('/swagger-token', exchangeToken)`.
APC deploy prod theo TAG, tag chứa route đã tồn tại → 404 là nguyên nhân khác, phải đo prod.

**Hệ quả:** lỗ hổng ở việc 3 không phải "sắp lên prod" — nó đã ở master và đã tag.
Nếu function `proxy` thực sự đã deploy thì nó đang live. Vá trước, tag sau.

**Env không fix bằng file trong repo.** `.env*` bị gitignore ở cả 2 repo
(`.gitignore:68` AEO, `.gitignore:65` APC) → file local không bao giờ vào CI.
Prod env dựng từ CI variable lúc deploy:

```
AEO  .gitlab-ci.yml:309-310   echo "$PRODUCTION_ENV_FILE" >> packages/functions/.env
APC  .gitlab-ci.yml:127-128   echo "$PROD_ENV_FILE"       >> packages/functions/.env
```

→ `SWAGGER_JWT_SECRET` phải vào CI var. File local chỉ dùng để test local / hand-deploy.

**APC đã có sẵn hạ tầng integration key** — `repositories/integrationRepository.js`,
collection `integrationKeys`, `getIntegrationKey(accessToken)` (đang dùng ở
`middleware/validateAccessToken.js:42`). Chỉ thiếu `getIntegrationKeyById`.

Consumer của token là **agent**, xác thực qua integration key — xác nhận bởi Tuan.

Doc drift phụ: `ai-product-copy/CLAUDE.md:51` ghi tag format `v1.84.X`, thực tế `v1.6.x`.

---

## Progress

Started: 2026-08-13

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| C | Đo prod APC: 404 do đâu (read-only) | inline (gcloud) | ✅ | 1/5 | clean (0 file) | tìm ra P0, xem Task C log |
| E | **P0** Vá dep swagger APC (đóng băng prod 14 ngày) | inline | ✅ | 1/5 | clean (3 file, +11 −7) | 5 dep thiếu chứ không phải 2 |
| A | Vá auth APC swaggerAuth (mirror AEO) | inline | ✅ | 1/5 | clean (2 file, +61 −7) | 9/9 acceptance |
| B | Fail-fast thiếu SWAGGER_JWT_SECRET + wire env | inline | ✅ | 1/5 | clean (1 file, +15) | 4/4 acceptance |
| D | Verify cuối + bàn giao lệnh tag | inline | ✅ | 1/5 | clean (toàn nhánh) | deploy là tay Tuan |

**Lệch routing table:** skill định tuyến A/E sang `general-purpose`(opus), nhưng làm inline hết.
Lý do: `~/.claude/CLAUDE.md` — "Đừng spawn subagent trừ khi tao bảo". User instruction thắng skill.

**Thứ tự bắt buộc: A và E phải nằm trong CÙNG một tag.** Nếu deploy E trước A, lỗ hổng
exchangeToken không-auth lên prod ngay lập tức (hiện nó 404 chỉ vì code prod cũ hơn commit merge).

Deploy KHÔNG do agent chạy. Ghi CI variable cũng là tay Tuan.

### Log

#### ✅ Task C: Đo prod APC 404 — tìm ra P0
- Agent: inline (Bash, read-only)
- Status: ✅ completed
- Plan:
  - Goal: biết function nào phục vụ `/proxy` trên `ai-product-copy` và `updateTime` của nó, kết luận exchangeToken không-auth có đang live không
  - Files allowed: none (read-only, không sửa file)
  - Approach: `gcloud functions describe` + `firebase.json` rewrites. Loại bỏ: gọi thẳng endpoint prod bằng shop thật (sinh traffic + nếu live thì tự mint token)
  - Test command: `gcloud functions describe <fn> --project ai-product-copy --format='value(updateTime)'` → có giá trị
  - Risk: không. Read-only. Sai project id → chỉ lỗi, không ghi
  - Rollback: n/a
- Rounds used: 1/5
- Security check: clean — read-only, 0 file thay đổi, không log giá trị env (chỉ in tên biến)
- Started: 2026-08-13
- Completed: 2026-08-13

**Kết quả — 404 KHÔNG phải do chưa merge. P0 rộng hơn nhiều.**

Toàn bộ Cloud Run service của `ai-product-copy` đang phục vụ revision từ **2026-07-30**:

```
api        serving=api-00213-qum        2026-07-30 | newest=api-00216-tak   2026-08-13T03:40:14Z
apisa      serving=apisa-00212-peq      2026-07-30 | newest=apisa-00215-jep 2026-08-13T03:40:15Z
auth       serving=auth-00212-ruj       2026-07-30 | newest=auth-00215-zuk  2026-08-13T03:40:15Z
authsa     serving=authsa-00212-zib     2026-07-30 | newest=authsa-00215-zaq
embedapp   serving=embedapp-00175-kax   2026-07-30 | newest=embedapp-00178-mav
extension  serving=extension-00144-xac  2026-07-30 | newest=extension-00147-lay
handlehook serving=handlehook-00145-por 2026-07-30 | newest=handlehook-00148-yig
proxy      serving=proxy-00189-jal      2026-07-30 | newest=proxy-00192-vev 2026-08-13T03:40:46Z
publishall     serving=publishall-00039-qik     2026-07-30 | newest=publishall-00042-wev
syncproducts   serving=syncproducts-00086-fox   2026-07-30 | newest=syncproducts-00089-zid
updatedesc     serving=updatedesc-00039-roj     2026-07-30 | newest=updatedesc-00042-wep
webhookcreateproduct serving=...-00144-web      2026-07-30 | newest=...-00147-wut
```

`traffic: latestRevision=true, percent=100` — không phải pin traffic. Revision mới **fail health check**:

```
proxy-00190-dov  2026-08-10T09:47  HealthCheckContainerError
proxy-00191-yeg  2026-08-10T11:35  HealthCheckContainerError
proxy-00192-vev  2026-08-13T03:40  HealthCheckContainerError
```

Log crash (`gcloud logging read`, revision proxy-00192-vev):

```
Provided module can't be loaded.
Did you list all required modules in the package.json dependencies?
Detailed stack trace: Error: Cannot find module 'koa2-swagger-ui'
Require stack:
- /workspace/lib/middleware/swagger.js
- /workspace/lib/handlers/api.js
- /workspace/lib/index.js
Container called exit(1).
Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080.
```

**Nguyên nhân:** `koa2-swagger-ui` và `swagger-jsdoc` khai ở **root** `package.json:73,79`,
KHÔNG có trong `packages/functions/package.json`. `firebase.json:7` deploy `"source": "packages/functions"`
→ dep hoisted của workspace không đi kèm bundle → mọi function chết lúc load.
`handlers/api.js` require `middleware/swagger.js`, mà `index.js` là entry DUY NHẤT của mọi function
→ chết hết, không riêng `proxy`.

Local chạy được vì yarn workspace hoist (yarn.lock có 3 hit `koa2-swagger-ui`). Prod thì không.

**Hệ quả:** mọi thứ merge vào master từ 2026-07-30 chưa từng lên prod — gồm cả
`feature/FAL-568` merge sáng nay (tag v1.6.28). Deploy vẫn "xanh" vì revision tạo thành công,
chỉ health check fail rồi Cloud Run giữ bản cũ.

**Lỗ hổng ở việc 3 hiện KHÔNG live** — probe `https://ai-product-copy.web.app/proxy/swagger-token`
→ `HTTP 404 Not Found`, còn `/proxy/checkInstalled` → `HTTP 200 {"success":true,...}`.
Route 404 chỉ vì code prod là bản 2026-07-30, trước commit merge. Vá E là nó live ngay.

**Việc 1 (AEO) xác nhận bằng bằng chứng prod**, không phải suy đoán:

```
gcloud functions describe proxy --project=seo-on-aeo
  status ACTIVE | updateTime 2026-08-10T09:49:24Z | runtime nodejs20
  19 env var: APP_BASE_URL APP_HOOK_URL AVADAIO_API_KEY AVADAIO_API_URL AVADAIO_APP_ID
  AVADA_ACCESS_TOKEN_KEY AVADA_BEHAVIOR_ENVIRONMENT AVADA_BEHAVIOR_KEY
  AVADA_BEHAVIOR_SHOP_SIGNATURE_SECRET EVENTARC_CLOUD_EVENT_SOURCE FIREBASE_CONFIG
  GCLOUD_PROJECT PROJECT_FIREBASE_API_KEY PROJECT_FIREBASE_BUCKET SHOPIFY_API_KEY
  SHOPIFY_SECRET SLACK_BOT_TOKEN SLACK_CS_CHANNEL_ID SLACK_ERROR_CHANNEL_ID
  SWAGGER_JWT_SECRET present: False
```

AEO là **Gen1** (không có Cloud Run service) nên không dính bug dep; AEO khai swagger deps
đúng chỗ ở `packages/functions/package.json:67,76`.

Cả 3 task APC (E, A, fail-fast phía APC) đi CHUNG 1 nhánh `fix/apc-swagger-deps-auth`
cắt từ `origin/master`, 1 MR, 1 tag. AEO đi nhánh riêng `fix/aeo-swagger-secret` từ `origin/main`.

**Chiến lược test:** repo có jest 24 + babel-jest 24, không có `@babel/core`/`module-resolver`
ở root; `.babelrc` chỉ nằm trong `packages/functions`. Dựng jest infra mới giữa lúc vá P0 là
đốt round. Thay vào đó test chạy trên **output babel thật** (`packages/functions/lib/`) —
đúng thứ prod chạy, nên nó verify luôn cả E (module resolve được) lẫn A (logic auth).
Script test nằm ở scratchpad, không đụng repo.

#### ✅ Task E: Vá dep swagger APC (P0)
- Agent: inline (shell-heavy: yarn install + lockfile)
- Status: ✅ completed — nhánh `fix/apc-swagger-deps-auth`
- Plan:
  - Goal: `koa2-swagger-ui` + `swagger-jsdoc` có trong `packages/functions/package.json`,
    `yarn install --immutable` pass, babel build ra `lib/` require được 2 module đó
  - Files allowed: `package.json`, `packages/functions/package.json`, `yarn.lock`. Không file nào khác
  - Approach: **move** (xoá khỏi root, thêm vào packages/functions) — grep xác nhận 2 dep chỉ
    dùng ở `packages/functions/src/middleware/swagger.js:1` và `packages/functions/src/config/swagger.js:1`,
    không nơi nào khác. Giữ nguyên specifier `^5.12.0` / `^6.2.8` để yarn.lock churn tối thiểu
    (resolved 5.12.0 / 6.3.0). Loại bỏ: duplicate ở cả 2 chỗ — để lại debt và root vẫn hoist che lỗi
  - Test command: `yarn install --immutable` → exit 0; `yarn workspace @avada/functions run production` → exit 0;
    `node -e "require('./packages/functions/lib/handlers/api.js')"` → không throw `Cannot find module`
  - Risk: đổi `packages/functions/package.json` → `detect-changed-functions` fallback deploy-all.
    Đúng ý muốn (mọi function đang chết cần deploy lại). Nếu quên commit `yarn.lock` → CI immutable install fail
  - Rollback: `git revert` commit; prod đang chạy 2026-07-30 nên revert = giữ nguyên hiện trạng, không tệ hơn
- Rounds used: 1/5

**Thiếu 5 dep chứ không phải 2.** Audit toàn bộ bare import trong graph reachable từ `index.js`
(151 file, 39 external module):

```
MISSING  cors             (*** KHONG KHAI O DAU ***)  <- handlers/webhooks/bulkOperation.js, createProduct.js
MISSING  jsonwebtoken     (*** KHONG KHAI O DAU ***)  <- middleware/swaggerAuth.js
MISSING  koa2-swagger-ui  (root package.json)         <- middleware/swagger.js
MISSING  p-limit          (root package.json)         <- handlers/pubsub/subscribeUpdateCredits.js
MISSING  swagger-jsdoc    (root package.json)         <- config/swagger.js
```

`cors` + `jsonwebtoken` không khai ở đâu cả — hiện chỉ sống nhờ hoisting transitive. `p-limit`
khai ở **devDependencies** của root dù là runtime dep. Vá mỗi swagger là gặp crash kế tiếp,
nên khai đủ cả 5 vào `packages/functions/package.json`, xoá 3 cái khỏi root (grep xác nhận
chỉ dùng trong `packages/functions/src`).

Kết quả verify:

```
1. yarn install --immutable                     exit 0
2. audit reachability lại                       MISSING: none - OK
3. yarn workspace @avada/functions run production   Successfully compiled 179 files
4. require lib/middleware/swagger.js            OK   (đây là module đã crash prod)
5. require toàn bộ 187 file lib                 MODULE_NOT_FOUND: 4
```

4 cái còn lại là dead code, không nằm trong graph `index.js` → prod không load:
`controllers/testSubscription.js`, `handlers/pubsub/subscribeUpdateNewSubscriberCredits.js`,
`helpers/checkShopGH.js` (import chéo `@assets/services/shopService`), `services/avadaioService.js`.
Broken relative import trong graph: 0.

- Security check: **clean** — diff 3 file (+11 −7). Không secret literal. `yarn.lock` có mặt là
  bắt buộc (CI immutable install), đã khai trong plan. **0 dòng `resolution:` mới** trong lock →
  không package version mới nào vào cây, không host ngoài registry npm. Blast radius: đổi
  `packages/functions/package.json` → `detect-changed-functions` fallback deploy-all — đúng ý muốn.

#### ✅ Task A: Vá auth APC swaggerAuth (+ fail-fast phía APC)
- Agent: inline (xem ghi chú lệch routing ở bảng trên)
- Status: ✅ completed
- Plan:
  - Goal: `/proxy/swagger-token` không phát JWT nào nếu không có integration key hợp lệ;
    JWT mang `integrationId` và `verifySwaggerToken` từ chối token có integration đã bị xoá
  - Files allowed: `packages/functions/src/middleware/swaggerAuth.js`,
    `packages/functions/src/repositories/integrationRepository.js`. Ngoài 2 file này là ngoài scope
  - Approach: mirror AEO `packages/functions/src/middleware/swaggerAuth.js:12-57,59-95` 1-1.
    Giữ `getShopByShopifyDomain` từ `@avada/core` của APC (đang đúng, không đụng).
    Loại bỏ: viết cơ chế auth mới — APC đã có `integrationKeys` + `getIntegrationKey`
    dùng ở `middleware/validateAccessToken.js:42`, bịa cái khác là tạo taxonomy thứ hai
  - Test command: `node <scratchpad>/swagger-auth.test.js` → 7/7 pass
  - Risk: siết auth làm agent đang dùng token cũ mất quyền. Chấp nhận được — endpoint hiện 404 trên prod,
    chưa ai dùng được. Sai chiều ngược lại (nới lỏng) = IDOR toàn bộ `/api/*`
  - Rollback: `git revert`; endpoint quay lại 404 vì E chưa deploy riêng
- Rounds used: 1/5

Test viết TRƯỚC khi vá, chạy trên code chưa vá để chứng minh nó bắt được lỗ hổng thật:

```
FAIL  2. accessToken sai -> 403, KHONG phat token        expected 403, got 200   <-- lo hong
FAIL  5. hop le -> 200, JWT mang shopID + integrationId  JWT thieu integrationId
FAIL  6. JWT khong co integrationId -> KHONG set user    JWT cu van duoc cap quyen
FAIL  7. integration bi thu hoi -> KHONG set user        integration da xoa van duoc cap quyen
FAIL  9. thieu SWAGGER_JWT_SECRET -> 503                 secretOrPrivateKey must have a value
3/9 pass
```

Sau khi vá: **9/9 pass**. `expected 403, got 200` chính là lỗ hổng Tuan báo, được tái hiện
bằng test rồi mới bịt.

Thay đổi ngoài kế hoạch ban đầu, có lý do: bỏ `require('../repositories/shopRepository')` lười
ở dòng 53 cũ, chuyển lên import top-level. Kiểm `shopRepository` không import gì từ `middleware/`
→ không có circular dep, lazy require là thừa.

- Security check: **clean** — diff 2 file (+61 −7). Không secret literal, không thêm dòng log nào,
  không dep/outbound host mới. `shopID` lấy từ doc Firestore chứ không từ request. Shop scoping:
  `verifySwaggerToken` set `ctx.state.user.shopID`, controller đọc qua `getCurrentShop(ctx)` — nguyên vẹn.

**Rủi ro tồn dư (báo, KHÔNG sửa — ngoài scope):** integration accessToken rò rỉ vẫn mint được JWT
cho **bất kỳ** shopifyDomain nào rồi gọi `/api/*` với tư cách shop đó. AEO y hệt. Đó là thiết kế
của integration key (khoá server-side tin cậy), không phải regression của diff này. Nếu muốn siết
thì phải buộc integration ↔ shop, là việc riêng.

#### ✅ Task B: Fail-fast SWAGGER_JWT_SECRET (AEO) + sinh secret
- Agent: inline
- Status: ✅ completed — nhánh `fix/aeo-swagger-secret`
- Plan:
  - Goal: thiếu `SWAGGER_JWT_SECRET` → 503 kèm message rõ, thay vì 500 mù
    (`secretOrPrivateKey must have a value`) — chính con này ngốn của Tuan 1 buổi
  - Files allowed: `llm-ai-search-seo/packages/functions/src/middleware/swaggerAuth.js`.
    Cộng file `.env` local (gitignored) của cả 2 repo — không commit
  - Approach: guard đầu `exchangeToken`; `verifySwaggerToken` thiếu secret → `return await next()`
    (không set `ctx.state.user`), fail closed. Loại bỏ: throw lúc module load — sập cả function
  - Test command: `node -e` load module với env rỗng → gọi exchangeToken → `ctx.status === 503`
  - Risk: không. Chỉ đổi 500 → 503 ở đúng nhánh đang hỏng
  - Rollback: revert
- Rounds used: 1/5

```
PASS  1. thieu SWAGGER_JWT_SECRET -> 503 co ly do, khong phai 500 mu
PASS  2. thieu secret -> verifySwaggerToken fail closed
PASS  3. co secret -> happy path khong doi
PASS  4. co secret + accessToken sai -> van 403
4/4 pass
```

Secret đã sinh: `openssl rand -base64 48`, 64 ký tự, **hai app hai giá trị khác nhau**
(sha8 `35446507` vs `b51fc98e`). Ghi vào 4 file, tất cả gitignored, `git status --porcelain` = 0 entry:

```
llm-ai-search-seo/packages/functions/.env
llm-ai-search-seo/packages/functions/.env.production
ai-product-copy/packages/functions/.env
ai-product-copy/packages/functions/.env.production
```

**Giá trị secret không đi qua transcript** — sinh trong process rồi redirect thẳng vào file.
Tuan tự mở file copy sang GitLab CI variable.

- Security check: **clean** — diff AEO 1 file (+15). Không secret literal, không log mới.
  `.yarn/install-state.gz` bị bước build đụng vào đã revert (ngoài scope).

#### ✅ Task D: Verify cuối + bàn giao
- Agent: inline
- Status: ✅ completed
- Rounds used: 1/5

**APC — `npx jest`:**

```
Test Suites: 6 passed, 6 total
Tests:       119 passed, 119 total
Time:        9.859s
```

**AEO — `npx jest`:**

```
Test Suites: 9 failed, 8 passed, 17 total
Tests:       7 failed, 146 passed, 153 total
```

7 fail này **có sẵn**. Đo baseline bằng cách stash diff rồi chạy lại trên `origin/main` sạch:

```
BASELINE (khong co diff): 9 failed, 8 passed, 17 total | 7 failed, 146 passed, 153 total
```

Giống hệt → diff không gây regression. Nguyên nhân fail có sẵn: `firebase-admin initializeApp`
cần credential trong môi trường test (`node_modules/@avada/core/build/services/authService.js:95`).

**Acceptance:** APC 9/9, AEO 4/4.

**eslint hỏng sẵn ở APC** — fail cả trên file KHÔNG sửa (`middleware/validateAccessToken.js`),
lỗi từ `node_modules/async-function/require.mjs` (`Cannot use import statement outside a module`).
Báo lại, không nới diff để sửa. `npx prettier --check` trên 2 file sửa: pass.

- Security check toàn nhánh: **clean**
  - secret literal / chuỗi base64-hex ≥32 ký tự trong diff: none
  - dòng `console.*` / `logger.*` mới: none
  - forbidden files: none (`yarn.lock` có mặt là bắt buộc và đã khai trong plan)
  - outbound host / `fetch(` / `axios.` mới: none. Import mới: 2, đều là repository nội bộ
  - file `.env` bị track: AEO 0. APC 1 = `packages/assets/.env.example` — VITE_* của frontend,
    vốn public trong bundle client, và nằm ngoài diff này. Ghi nhận, không sửa.

---

## COMPLETE — 2026-08-13

5/5 task ✅. Tổng round: 5/25. Security verdict cuối: **clean** cả hai nhánh.

Đã commit local, **chưa push, chưa tag, chưa deploy**:

```
ai-product-copy   fix/apc-swagger-deps-auth   270766e   5 file, +72 −14
llm-ai-search-seo fix/aeo-swagger-secret      9c394de   1 file, +15
```

### UPDATE 2026-08-14 — đã push, MR mở

Tuan xác nhận đã set xong 2 CI variable. Push + tạo MR:

| App | MR | Base | Commit |
|---|---|---|---|
| APC | https://gitlab.com/avada/ai-product-copy/-/merge_requests/188 | `master` | `270766e` |
| AEO | https://gitlab.com/avada/llm-ai-search-seo/-/merge_requests/118 | `main` | `9c394de` |

Cả hai `--remove-source-branch`, state `open`, **pipeline xanh, mergeable, không conflict**.

APC đỏ lần đầu ở `docs_gate`: `route-coverage: no spec entry for GET /api/shopify/collection-options`.
Không phải diff này — route vào từ `feature/FAL-568` (`eb7b9b6`, 10/08), docs-gate merge sau (!187),
nên **mọi MR mở từ đó đều đỏ**. Vá bằng commit riêng `cab296d` (thêm entry vào
`packages/functions/src/docs/swagger-shopify.yaml`), gate local `60 routes | 60 documented | PASS`.

Ghi chú: tag `v1.6.28` (13/08) cũng đỏ, nhưng đỏ ở `push-react-artifacts:production` —
`deploy-firebase:production` **success** trong khi container crash startup. Xanh/đỏ của pipeline
không nói gì về revision đang serve.
**Vẫn chưa tag → prod chưa đổi gì.** Bước 3 và 4 dưới đây còn nguyên.

### Việc còn lại — tay Tuan

**1. Set CI variable (bắt buộc, không có bước này thì code vẫn 503).** ✅ done 2026-08-14
Giá trị nằm sẵn trong file, copy nguyên dòng `SWAGGER_JWT_SECRET=...`:

| App | Đọc từ file | Paste vào CI variable |
|---|---|---|
| AEO | `llm-ai-search-seo/packages/functions/.env.production` | `PRODUCTION_ENV_FILE` |
| APC | `ai-product-copy/packages/functions/.env.production` | `PROD_ENV_FILE` |

CI append cả biến vào `packages/functions/.env` lúc deploy
(AEO `.gitlab-ci.yml:309-310`, APC `.gitlab-ci.yml:127-128`).

**2. Push + MR.** ✅ done 2026-08-14 — MR !188 (APC), !118 (AEO), link ở bảng trên.

**3. Tag để deploy.** Chỉ tag mới deploy prod ở cả hai repo.
`git fetch --tags` trước. APC tag hiện tại là `v1.6.x` (KHÔNG phải `v1.84.X` như
`ai-product-copy/CLAUDE.md:51` ghi — doc sai). AEO `v1.5.X`.

**Thứ tự bắt buộc: set CI var TRƯỚC khi tag APC.** Vá E làm `/proxy/swagger-token` sống lại;
nếu chưa có secret thì nó trả 503 thay vì phát token — không nguy hiểm, chỉ là quay lại chỗ cũ.

**4. Sau khi deploy, xác minh revision thật sự nhận traffic** — đây là bước cả pipeline
lẫn Firebase đều không báo:

```bash
gcloud run services describe proxy --project=ai-product-copy --region=us-central1 \
  --format='value(status.traffic[0].revisionName)'
gcloud run revisions list --service=proxy --project=ai-product-copy \
  --region=us-central1 --format='table(name,creationTimestamp,active)' --limit=3
```

Revision đang serve phải là bản mới. Nếu vẫn là bản cũ → lại crash startup, đọc log:

```bash
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="proxy"
  AND resource.labels.revision_name="<revision-moi>"' \
  --project=ai-product-copy --limit=25 --format='value(timestamp,severity,textPayload)'
```

### Việc nên làm riêng (KHÔNG nằm trong nhánh này)

1. **Không app nào có gác cho lỗi này.** Deploy fail health check mà pipeline vẫn xanh — APC
   im lặng 14 ngày. Nên thêm bước sau `firebase deploy` trong CI: so `status.traffic[0].revisionName`
   với revision vừa tạo, khác thì fail job. Áp cho mọi app Gen2, không riêng APC.
2. **Kiểm các app còn lại có cùng bệnh dep không** — `blogs`, `avada-image-optimizer`, `joy`,
   `avachat`, `seo`. Script audit reachability từ `index.js` dùng ở Task E chạy lại được nguyên xi.
3. eslint APC hỏng sẵn (`async-function/require.mjs`).
4. 4 file dead code trong APC import module không tồn tại — xoá hoặc sửa.
5. `ai-product-copy/CLAUDE.md:51` ghi sai tag format (`v1.84.X` → thực tế `v1.6.x`).
6. Siết integration key ↔ shop nếu muốn bịt rủi ro tồn dư ở Task A.
