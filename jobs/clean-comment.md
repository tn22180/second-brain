hiện trong các dự án khi AI làm việc thì comment giải thích rất nhiều, sau đây quét tất cả các chỗ bị comment nhiều sửa lại, sửa lại docs cho agent khi làm là hạn chế comment và comment mức bình thường, ưu tiên viết vào docs feature kĩ hơn là comment chi tiết tránh rác code làm file nặng

NEW REQUEST:thêm ý nữa là Agent đang gen comment quá dài + thừa để giải thích vì thê shorten lại tất cả các comment của AI và sau này cần giải thích thì update vào docs/{features} thay vì comment dài như thế
---

## Baseline đo được (2026-07-31)

Chỉ `packages/*/src`, đã loại `node_modules` / `lib` / `build` / `dist` / `static` / `.cache`.

| | seo | blogs (functions+assets) |
|---|---|---|
| `//` lines | 4673 | 1725 |
| code bị comment lại | 643 | 175 |
| banner `// ====` | 153 | 1 |
| `// Step N` / đánh số | 80 | 10 |
| restate (`// Get x`) | 148 | 141 |
| comment tiếng Việt | 79 | 20 |
| JSDoc `/** */` (cả repo) | 2664 | 2680 |

Phát hiện đổi hướng job: **51% comment của blogs nằm trong `packages/avadaseo/` — fork Yoast**, JSDoc upstream, không phải AI viết. Cùng loại: `packages/editor/*`, `assets/**/EditorJs/*` (fork EditorJS), `seo/static/assets/*` (build output). Loại hết khỏi phạm vi.

---

## Design

### Phạm vi
`seo` + `blogs`, chỉ `packages/*/src`.

Loại cứng: `node_modules`, `lib/`, `build/`, `dist/`, `static/`, `.cache/`, `packages/avadaseo/**`, `packages/editor/**`, `assets/**/EditorJs/**`, `*.min.js`.

### D1 — codemod dọn code (deterministic, không phán đoán bằng AI)

| # | Xoá | Điều kiện |
|---|---|---|
| R1 | Code bị comment lại | Run liền kề các dòng `//` mà nội dung parse được thành JS statement → xoá cả run |
| R2 | Banner phân cách | Dòng chỉ có `// ====` / `// ----` |
| R3 | `// Step N:` đánh số | Chỉ khi từ trong comment ⊂ identifier dòng code kế tiếp |
| R4 | Restate | `// Get shop` trên `const shop = getShop()` — cùng điều kiện token-overlap |

Không bao giờ đụng: JSDoc `/** */`, license header, comment có URL, directive (`eslint-disable`, `@ts-`, `prettier-ignore`, magic comment của webpack/vite), `TODO/FIXME/HACK/XXX`, comment tiếng Việt, comment chứa `because/why/workaround/bug/Shopify/limit/quota/race`.

### Acceptance test
Mỗi file sửa: parse trước + sau bằng `@babel/parser`, strip comment + location, **deep-compare AST**. Khác 1 node → reject file. Cộng `eslint` trên file đã đụng không sinh error mới.

### D2 — docs
- `~/.claude/CLAUDE.md`: rule comment ngắn, áp mọi repo.
- `seo/CLAUDE.md` + `blogs/CLAUDE.md`: mục `## Comments` + convention đẩy chi tiết vào `docs/features/<name>.md`.
- Commit `scripts/scan-comments.py` vào từng repo.
- Không CI gate, không eslint rule.

### Branch
`chore/comment-cleanup` cắt từ `origin/master` ở cả hai repo. Không đụng branch đang làm (`seo: chore/stop-activity-writes`, `blogs: feat/openrouter-prompt-cache`).

---

## Progress — ✅ COMPLETE

Started: 2026-07-31 · Kết thúc: 2026-07-31 · Tổng round dùng: 5/5 (task 3+4+5 gộp làm 1 vòng lặp)

| # | Task | Agent / Model | Status | Rounds | Notes |
|---|------|---------------|--------|--------|-------|
| 1 | Codemod + AST-equivalence verifier | inline (main) | ✅ | 1/5 | 16 fixture pass ngay vòng 1 |
| 2 | Dry-run 2 repo + soát false positive | inline (main) | ✅ | 1/5 | phát hiện R4 ăn nhầm section label → tách ra cho người duyệt |
| 3 | Apply lên seo | inline (main) | ✅ | 5/5 | 4 vòng sửa codemod do reviewer bắt lỗi |
| 4 | Apply lên blogs | inline (main) | ✅ | 5/5 | cùng vòng lặp với task 3 |
| 5 | Review độc lập 2 diff | cavecrew-reviewer / sonnet | ✅ | 3 lượt | bắt 7 lỗi thật, vòng cuối seo+blogs đều sạch |
| 5b | Phán 87 candidate R3/R4 | general-purpose / sonnet | ✅ | 1 | duyệt xoá 38, giữ 49 |
| 6 | Rule vào global + per-repo docs | inline (main) | ✅ | 1/5 | |
| 7 | Verify cuối: build + test | inline (main) | ✅ | 1/5 | |

### Kết quả

| | seo | blogs |
|---|---|---|
| branch | `chore/comment-cleanup` (cắt từ `origin/master` @ `881f96d56e89`) | `chore/comment-cleanup` (@ `a07652134`) |
| commit dọn code | `10c6cb34aaeb` — 99 file, **394 xoá / 0 thêm** | `dd2d57f6a` — 40 file, **184 xoá / 0 thêm** |
| commit docs | `bc89a97a02bc` | `5f6b5730d` |
| chia theo rule | R1 303 · R2 80 · R4 11 | R1 157 · R4 27 |

Tổng: **578 dòng rác xoá, 139 file, 0 dòng thêm.**

### 4 lỗi codemod reviewer bắt được (đều đã sửa + có test hồi quy)

1. **Dòng trống chia block** — block comment bị cắt đôi, nửa parse được thì xoá, nửa kia thành mảnh mồ côi. Sửa: run nhảy qua được tối đa 3 dòng trống.
2. **Xoá dây chuyền theo symbol** — `// const BULK_AI_FIX_MAX = 50` bị xoá dù `// const exceedsBulkLimit = ... BULK_AI_FIX_MAX` còn sống. Sửa: lan truyền anchor theo symbol tới điểm bất động.
3. **Bỏ sót JSX comment** — anchoring chỉ quét `//`, không quét `{/* */}`. Mất định nghĩa của `handleBook`, `apiUrl`, `savingCriticalCss`. Sửa: survivor gồm mọi loại comment.
4. **Anchor 1 chiều** — `// import {syncShopCreate}` sống nhưng chỗ dùng bị xoá. Sửa: anchor cả chiều candidate-mentions → survivor-declares, `declaredNames` nhận cả `import`.

Hệ quả: seo R1 giảm 512 → 303 khi 4 guard này vào. 209 dòng đó lẽ ra đã bị xoá sai.

### Verify cuối (output thật)

```
seo   packages/functions  babel src --out-dir lib   → Successfully compiled 1000 files with Babel (4087ms).
blogs packages/functions  babel src --out-dir lib   → Successfully compiled 422 files with Babel (2463ms).
blogs packages/assets     jest                      → Test Suites: 4 passed, 4 total
                                                      Tests:       26 passed, 26 total
blogs packages/assets     vite build (production)   → ✓ 6566 modules transformed. ✓ built in 22.76s
tools/comment-cleanup     node test.js              → 21 passed, 0 failed
seo + blogs               git diff: dòng xoá không phải comment → 0
```

**2 gate KHÔNG chạy được, cả hai hỏng sẵn trên master:**

- `seo` eslint v6.8.0 crash với Node 22: `SyntaxError: Cannot use import statement outside a module` tại `node_modules/async-function/require.mjs:1`. Crash lúc khởi động, trước khi đọc file → không liên quan codemod. Nên dùng AST-equivalence + babel làm gate thay thế.
- `seo` `packages/assets` vite build fail: `[vite]: Rollup failed to resolve import "falcon-event-tracker/browser" from src/pages/BulkGenerator/ListGenX.jsx`. Dựng worktree sạch từ `origin/master` → fail y hệt. Dep khai trong `packages/assets/package.json` nhưng chưa install. `ListGenX.jsx` không nằm trong diff.

### Bảo chứng an toàn

Mỗi file bị sửa đều parse trước/sau bằng `@babel/parser`, strip comment + location, deep-compare AST. Lệch 1 node → file bị loại, không ghi. 1 file seo bị loại đúng theo cơ chế này.

### Tài sản để lại

- `~/Documents/second-brain/tools/comment-cleanup/{codemod.js,test.js}` — codemod + 21 fixture test. Chạy lại được cho app khác: `node codemod.js --repo <path> --dirs <dirs> --rules R1,R2 [--apply]`.
- `<repo>/scripts/scan-comments.py` — báo cáo rác, không sửa gì. Có trong cả seo và blogs.
- Rule comment: `~/.claude/CLAUDE.md` (global) + mục `## Comments` trong `seo/CLAUDE.md`, `blogs/CLAUDE.md`.
- `blogs/docs/features/README.md` — thư mục feature-doc chưa từng tồn tại ở blogs.

### Còn lại (không làm, có chủ đích)

`scan-comments.py` sau khi dọn vẫn báo seo 331 / blogs 63 dòng "commented-out code". Đó là các block codemod cố ý giữ: có anchor symbol, hoặc dính protect list (URL, `@scope`, TODO, tiếng Việt). Muốn dọn nốt thì phải đọc tay từng chỗ.

---

# Vòng 2 — "comment quá dài" (2026-07-31)

Yêu cầu bổ sung: rút gọn comment AI viết dài, phần giải thích đẩy vào `docs/features/`.

## Phân tích: tiền đề đúng một nửa

5 "comment" dài nhất ở cả 2 repo **không phải prose** — là code bị comment lại mà vòng 1 tha vì protect list quá rộng: `planIcon.js` 170 dòng SVG JSX (tha vì `xmlns="http://www.w3.org/2000/svg"`), `loginService.js` 65 dòng function (tha vì `@param` trong JSDoc của chính nó), `{Shopify}` trong type annotation.

Prose thật thì ngắn: seo 333 site / 1534 dòng (TB 4.6 dòng/site), blogs 69 / 337. Và mấy cái dài nhất là loại **phải giữ** — `shopProbeService.js` (tại sao strip `accessTokenHash`), `redisCache.js` (tại sao timeout log `warn`, ~700 non-incident/ngày lọt sink).

Bucket phình thật là **JSDoc**: seo 312 site / 3203 dòng, blogs 106 / 864.

## Phase A — máy làm

Siết protect: URL / `@tag` / `shopify` chỉ còn bảo vệ **prose**, không bảo vệ block vốn đã parse ra code. Thêm: xoá blank line kẹp trong block, block nằm giữa 2 blank thì chỉ để lại 1.

seo `55378b7836fc` 373 xoá / 9 file · blogs `1efe579cd` 263 xoá / 9 file. Reviewer: 0🔴 0🟡.

## Phase B — 10 agent + 2 tầng bảo chứng

Ngưỡng: JSDoc ≥60 từ, prose ≥8 dòng → seo 137 site / 105 file, blogs 33 / 32. Chia 8+2 batch.

Luật cho agent: **giữ WHY, cắt WHAT**, tài liệu tham khảo dài đẩy sang `docs/features/` để lại pointer 2 dòng.

Kết quả: seo `2882cd46ca72` 60 file, blogs `627c7abe8` 25 file — sau rebase lên master mới.

### 2 lỗi tooling bắt được (không phải agent nói, máy nói)

1. **Hook `auto-lint.sh` của seo** (`PostToolUse: Write|Edit` → `eslint --fix`) reformat code không liên quan mỗi lần agent ghi file. AST vẫn bằng nên verifier không thấy. Phải viết `keep-comment-hunks.py`: dựng lại file từ base, chỉ lấy phía working-tree khi **mọi dòng cả 2 phía đều là comment/blank**. Lọc ra 23 block code ở seo, 4 ở blogs (blogs không có hook — 4 block đó là agent tự sửa code).
2. **Verifier tự nó có false positive**: `extra.trailingComma` là byte offset, dịch theo độ dài comment → báo lệch AST oan. Thêm vào `DROP_KEYS`.

### Reviewer vòng cuối

blogs sạch. seo 2🟡 — cả hai là mất thông tin thật, đã sửa:
- `pubsubFunctions.js` — bản rút gọn xoá mất nhánh "redeliver → resume từ cursor, không cần người", đọc thành ra mọi crash đều phải reset tay. On-call đọc nhầm là hỏng.
- `optimizeImageJobLoop.js` — mất hợp đồng thoát vòng lặp (done / stop signal / fatal).

## Docs sinh ra

seo: `locale-primary-override.md` (2 khái niệm "primary locale" của Shopify đá nhau — 52 dòng giáo trình trong container), `shop-locales-primary-concept.md`, `collections-graphql-fallback.md` (REST 404 trên collections model mới), `url-redirects.md`.
blogs: `logger.md`, `blog-assist.md`.

## Tổng vòng 2

| | seo | blogs |
|---|---|---|
| branch | `chore/comment-shorten` | `chore/comment-shorten` |
| diff vs master | 64 file, 293+/1288− | 27 file, 108+/460− |
| dòng đổi non-comment | **0** | **0** |
| AST comment-only | 60/60 | 25/25 |

Cộng vòng 1: **~2500 dòng comment rác/thừa đi khỏi 2 repo, 0 dòng code đổi.**

## Verify cuối (output thật)

```
seo   functions  babel → Successfully compiled 1002 files (3339ms)
blogs functions  babel → Successfully compiled 428 files (1523ms)
blogs assets     jest  → 4 suites, 26 tests passed
blogs assets     vite  → ✓ built in 14.21s
codemod          test  → 25 passed, 0 failed
verify-comments-only --base origin/master → seo 60/60, blogs 25/25 comment-only
```

`seo packages/assets` vite vẫn fail vì `falcon-event-tracker` chưa install — hỏng sẵn trên master, không đụng tới.

## Tài sản thêm

- `tools/comment-cleanup/verify-comments-only.js` — chứng minh một thay đổi chỉ đụng comment. `--revert` khôi phục file nào không đạt.
- `tools/comment-cleanup/keep-comment-hunks.py` — gỡ reformat của editor/hook ra khỏi một sửa đổi comment-only.
