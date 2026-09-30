# Security phase 4 — trạng thái & việc còn lại

Report gốc: https://notes.avada.net/AGrhGjTx65.md (audit 2026-09-24, SEO Suite: 8 Critical, 3 High, 2 Medium, 3 Low).
Cập nhật: 2026-09-30.

## TL;DR

- 15/16 finding của report đã lên prod SEO (v1.86.43 + v1.86.45, 2026-09-29).
- **Còn hở ở prod:** C7 (revert/jsonl, chờ extension) và C2 (15 collection list được, !2336/!2337 đang chờ). C5 hoãn theo FAL-720.
- 9 MR đang mở (5 SEO + 4 app khác). Việc tiếp theo: review → merge → cắt tag → `shopify app deploy`.

## Việc cần làm (theo thứ tự)

1. [ ] Review + merge các MR Ready: seo !2334, !2335, !2336 · blogs !910 · apc !208 · img !286 · aeo !141
2. [ ] Cắt tag từng repo (merge master KHÔNG tự deploy)
3. [ ] `shopify app deploy` cho: SEO (!2335), blogs, APC, img — phần Liquid/extension không đi theo tag
4. [ ] SEO !2336 (C2 đợt 1) lên staging → mở admin embedded, xem realtime còn sống
5. [ ] !2336 chạy prod ≥ 1 ngày → bỏ Draft + merge **!2337** (C2 đợt 2, rules) → cắt tag
6. [ ] Nhờ Lại Ngọc Lâm cho extension "revert image v2" gửi session token → bỏ Draft **!2320** (C7)
7. [ ] APC: check Partner Dashboard xem extension có tunnel trycloudflare đã từng live chưa
8. [ ] Check lại `errorAlerts` prod SEO sau deploy (TTL 1 ngày) — để ý lighthouse timeout (ssrfGuard)

## MR đang mở

| Repo | MR | Nội dung | Trạng thái |
|---|---|---|---|
| seo | !2334 | isTeamAvada server-side, cache app-key bỏ token, audit internal key, preview pricing, dọn code | Ready |
| seo | !2335 | JSON-LD dùng `\| json` (product/collection snippet, customGsdLiquid) | Ready — cần `shopify app deploy` |
| seo | !2336 | C2 đợt 1: `GET /realtime-token` + embedded sign-in Firebase. **Không đổi rules** | Ready |
| seo | !2337 | C2 đợt 2: rules scope theo shop (`shopOf()` nhận cả `shopId`/`shopID`) | **Draft** — chờ !2336 ≥1 ngày |
| seo | !2320 | C7: revert/jsonl cần session token, xoá `file-id`, chặn SSRF `revert-product` | **Draft** — chờ extension |
| blogs | !910 | GDPR callbacks, sanitize AI summary (+dep `xss`), JSON-LD/href author, bỏ IP khỏi log | Ready |
| ai-product-copy | !208 | GDPR callbacks, bỏ loader script từ trycloudflare (host chết) | Ready |
| avada-image-optimizer | !286 | GDPR callbacks, chặn script injection include/exclude + loading settings | Ready |
| llm-ai-search-seo | !141 | GDPR callbacks, escape FAQ answer, `{% raw %}` cho llms.txt/agents.md, sửa 3 citation docs-gate hỏng sẵn | Ready |

Link: `https://git.avada.net/avada/<repo>/-/merge_requests/<n>`

Pipeline MR (2026-09-30): 8/9 xanh. blogs !910 không có pipeline MR (CI blogs không chạy trên MR) → test chỉ chạy local (21 suite / 108 test pass).

## Tại sao C2 phải tách 2 đợt

CI tag deploy (`firebase deploy --except extensions`) release `firestore.rules` **trước** functions + hosting.
Gộp 1 tag → rules scope lên trước khi FE biết sign-in → realtime mọi shop embedded chết tới khi reload.
Đợt 1 ship code (rules vẫn mở) → đợi tab cũ reload hết → đợt 2 ship rules.

## Đã lên prod SEO

| Tag | Nội dung |
|---|---|
| v1.86.43 (09-29) | C1/C2 phần get-only, H1 storage rules (lần đầu deploy), C3 FAQ XSS, C4 LocalBusiness, C8, H2 GDPR, M1/M2, L1–L3 |
| v1.86.45 (09-29) | C6, H3, C7 republish/updateObfucate, C1 generateBulk (item edit qua API), credit-cart activate hỏi Shopify, credit pack 1 lần/charge, getLimit Timestamp, refund đúng pool, SSRF lighthouse, secret khỏi log/URL/Redis |

Probe prod xác nhận: republish/updateObfucate 401, `/proxy/optimize/start` 401, list `optimizeReport` 403, storage list 403.

## Chờ quyết (không phải code)

- **Backfill** dữ liệu bẩn cũ: metafield FAQ + LocalBusiness (SEO), AI summary (blogs). Fix chỉ áp khi ghi lại.
- **Job purge `redactRequestedAt`**: cả 5 app mới đánh dấu, chưa xoá gì. Tốn Firestore read. Cũng cần chốt policy backup GCS sau purge.
- **Rotate secret:**
  - `MCP_OAUTH_SECRET` (5 ký tự)
  - `SHOPIFY_ACCESS_TOKEN_KEY` (commit trong `fixProBackToFree.js`)
  - proxy token 5 app trên npm `avada-components-seoon`
  - `npmAuthToken` trong `.yarnrc.yml` (mục "111 repo" của report — việc platform)
- **TinyMCE**: push `fix/tinymce-allow-script-urls` (worktree `seo-wt-xss`, chưa có MR) — hiện chỉ tắt `allow_script_urls`. Siết `valid_elements` cần scan content đã lưu trước.
- **C5** `validateAccessToken` không bind shop — hoãn theo FAL-720 (cả 5 app).

## Còn hở đã biết (chưa có MR)

- `featureReq` / `commentFeatureReq` / `statsSpeedReq`: sau !2337 vẫn đọc chéo được giữa các shop đã sign-in (board vote chung).
- Header snippet llms.txt (AEO) không bọc raw — chỉ chủ shop tự làm vỡ.
- Admin blogs render summary bằng `dangerouslySetInnerHTML` → summary cũ còn bẩn chạy được ở admin.
- AEO `ProductDetailCard.js:73` bọc answer không escape phía FE.

## Gotcha rút ra

- Shopify `| json` escape `/` → `\/` nên `</script>` không thoát được; liquidjs thì không → test local báo thiếu. `escape_once` KHÔNG an toàn trong JSON-LD.
- `@avada/core` tự mount route GDPR; audit grep `src` báo "thiếu" là sai. Lỗ thật: không truyền callback.
- APC/AEO/blogs đánh dấu uninstall bằng `isInstalled:false`, SEO/img dùng `uninstalled:true` — đừng copy logic nguyên xi.
- Staging 1 SEO deploy bằng cách thêm branch vào `only:` của 4 job staging trong `.gitlab-ci.yml` → **revert trước khi merge**.
- glab chạy trong repo khác sẽ tự thêm remote `glab-base` — chạy từ thư mục không phải git, hoặc dùng `glab api`.

## Dọn dẹp sau khi merge

Worktree:
- seo: `seo-wt-sec-p4`, `seo-wt-sec-p4-h1`, `seo-wt-sec-c3`, `seo-wt-sec-c4`, `seo-wt-sec-c7`, `seo-wt-sec-m2`, `seo-wt-sec-c8`, `seo-wt-sec-h2`, `seo-wt-sec-hardening`, `seo-wt-sec-hardening2`, `seo-wt-sec-followups`, `seo-wt-sec-c2auth`, `seo-wt-security-high`
- `blogs-wt-sec-gdpr`, `ai-product-copy-wt-sec-gdpr`, `avada-image-optimizer-wt-sec-gdpr`, `llm-ai-search-seo-wt-sec-gdpr`

Nhiều worktree có symlink `node_modules` trỏ về main checkout (untracked) — xoá cùng worktree.
