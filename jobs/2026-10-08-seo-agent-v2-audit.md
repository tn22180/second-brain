# Audit note "SEO Agent v2 — nhóm tác vụ và tool" (FAL-1039, Lan Anh)

Note: https://notes.avada.net/3mMYwvO6tS.md (v4). Code: seo master `df900241aa8` (api.js giống hệt `43d1a60115` của note), FAL-837 `69c030bd406`.
6 agent đọc code, mỗi claim có file:line. BE = packages/functions/src, FE = packages/assets/src.

## Tổng

| Phần | Dòng kiểm | Đúng | Lỗi |
|---|---|---|---|
| Kiểm plan/credit + Nhóm 1 | 19 + preamble | 11 | 8 (+4 preamble) |
| Nhóm 2 + mục Credit | 26 + 6 | 18 | 14 |
| Nhóm 3-4 | 24 | 13 | 11 |
| Nhóm 5-7 | 32 | 18 | 14 |

Số: 110 việc + 16 tool riêng là đúng (Slack ghi 109 / 13). "82 việc thiếu tool" sai → 75 (82 gồm 7 dòng Nhóm 8 "Không cần tool").

## Sai nặng (đổi quyết định/ước lượng)

1. **Xem điểm SEO + checklist**: không phải "không có API" — `GET /seo-score` (api.js:132, localStorageController.js:83-105) trả score + issues + issueFixed.
2. **Mục "Credit: việc Dev bổ sung"** — làm theo note sẽ trừ 2 lần / đổi giá:
   - Thiếu caller thứ 3 `handleReduceCreditFixAllWithAI` ở Result.js:387 ("Fix all issues with AI", tới 27 credit, vẫn trừ khi vài nhóm fail). Bỏ cả 3 rồi xoá `/shop/reduce-credit` (api.js:102).
   - Nhóm content (14) là async (aiFixJob) → phải trừ trong worker fixAuditContent khi thành công, không "cùng request".
   - BE không thấy `keywordAssessment` (FE tách keyphrase + relatedKeywords) → giá phải key theo issueType BE nhận.
   - Không được đặt charge trong `fixIssueByType` (services/auditAgent/fixIssue.js) — productWorker bulk/MCP dùng chung, đã tự trừ (productWorker.js:535-543) → double.
   - Bulk edit gợi ý keyword/URL/related và Optimize URL **hiện không trừ ở đâu cả**: `handleReduceCredit` chỉ dispatch redux (useAiCredit.js:31-33), refresh là hoàn. Optimize URL không hiện "Uses 1 AI credit" (OptimizeUrl.js:95-123). Đưa vào BE = thu phí mới, không phải "chuyển chỗ".
   - Per-issue price (1 / 2) chỉ hiện khi `shop.isUseAiFixV1` — cờ DevZone.
3. **Revert toàn bộ ảnh (Pro)**: nút Pro chỉ gửi tin CS (Steps.js:184-190, 273-277); `/revert/all` thật gọi từ bảng history + "Continue" revert, không gate Pro.
4. **Speed toggles (146) ×2**: lưu xong chưa áp vào theme (trừ preload/pageSpeed/loading) — FE đẩy sang `/speed-up?speedUpMode=custom` chạy preset 390. → API một phần. Critical CSS/HyperSpeed chạy fleet job `handleSpeedupBackground` 4096MB.
5. **Dừng preset (391)**: FE dựng payload; endpoint là `doc.update(body)` raw (optimizeStoreController.js:38-50) → tool không được pass-through body.
6. **Preset 30 phút khoá**: chỉ localStorage FE, BE không guard. Preset BE (handleAutoOptimize/optimizeStore.js) đã drift so với FE.
7. **Nhận biết Save**: 5/6 trang handleSave trả undefined (Social, StructuredV2/Edit, MetaRule, SpeedUp); BulkEdit không dùng setHandleSave. 21 caller. → phát event ở tầng `useCreateApi`/`fetchAuthenticatedApi` + pathname, không sửa 21 trang.
8. **Internal link 1 trang**: FE chèn link (`applySuggestionsToHtml`) → API một phần.
9. **Key Bing (287)**: FE sinh key, BE ghi đè cả object instantIndexing + xoá redirect verification. **Gửi URL (282)**: phải truyền enabledGoogle/enabledBing trong body.
10. **Robots.txt sync (447)**: chỉ email staff Avada thấy nút → bỏ khỏi bảng.
11. **Quick upload**: endpoint thật `POST /api/seo-tool/image` (api.js:373).
12. **Mật độ keyword**: tính ở FE (getKeywordDensity) → API một phần.
13. **audit_resource**: không ghi historyAudit (edit của agent không restore được), không đụng `onPageSEOAuditUsesIds` (Quota20 không áp), là write tool → read-only connection không chấm lại được.
14. `fix_issue_with_ai` 1 trang meta: tốn 4 (+1 keyword +1 related nếu thiếu), chỉ trừ khi điểm tăng; FAQ flat 4 vs app N.

## Preamble "Kiểm plan và credit"

- "Tool MCP không kiểm plan": thiếu — MCP chặn Free cả connection (handlers/mcp.js:151-160, planGate.js:3-5); không check Pro/Ent per tool → create_redirect Starter vẫn tạo được (đúng).
- Danh sách "BE có chặn" thiếu: credit ở bulkAuditFix, generateBulk, FAQ worker, anchor text, alt AI full-run, MCP bulkFix/alt; plan ở AI meta tier, gsdAutoFill (Ent), broken-link cron.
- 0 `isShopLimit` trong controllers/ → plan gần như chỉ FE.
- Quota20 = default; per-shop `pageFreeAnalysisNumber` override; counter do FE ghi.
- Line refs: aiChatController charge :53 (không :58), check :19.

## Note bỏ sót

- **Sidekick tools** `extensions/seo-tools` (10 tool đọc/preview, BE/modules/sidekick) — agent surface thứ 2, trùng tool sắp làm.
- Shopify admin: `optimize-product-images` (nén/revert từ product list qua /proxy), 20 admin_link, bulk Instant Indexing (GET /settings/:field 139 tự submit — write sau GET), Flow action "Optimize product image alt".
- Image filename optimizer (`/image-optimization/image-filename`, POST /optimize/start type filename).
- Publish / revert theme copy (PUT /shopify/theme/:id 364).
- Media tab product (367, 368).
- Rescan speed score (GET /speed-score 133) — get_speed_score bảo rescan nhưng không có row. Job dock resume/dismiss (161).
- 301 auto-redirect theo loại trang (Paid, cron áp).
- Legacy pages non-embed shop: /search/structured, /search/local-business (+ POST /google/mapConnection 283) → agent cần rẽ theo `useEmbedBlock`.
- 293-295 `/404-pages` không phải phụ trợ (fix modal checklist brokenLink trên master; FAL-837 xoá).
- 567/568 missing-alt và services/audit/issues/ đã có trên master, không phải "nhánh FAL-837".
- Nhánh đang build: `feat/autopilot` (29 commit, trùng scope agent), `feat/gsd-fix-ai` (189 commit, 10 route /gsd-fix/*), `feature/FAL-872` backlinks, `feat/FAL-706` internal link history, `feat/free-image-quota-once` (đã merge → định nghĩa Quota ảnh có thể cũ), `seo-agent-v2` / `feature/seo-agent-ui` (drawer UI, Linh).
- FAL-837 thêm 8 item / bỏ 6 item checklist, map nút Fix per item (FE/const/checklistItems.js), storeScan + recompute, `pruneIssueFixed` đổi ngữ nghĩa issueFixed.

## Trả lời 9 điểm TL

1. **Mức Dev làm**: sửa phân loại theo list trên (≥8 dòng "API đủ" → "một phần", 1 "không có API" → "API đủ"). Ước lượng công: chưa (TL tự chốt).
2. **Service hay MCP HTTP**: gọi tầng tool MCP in-process — `registerTools(server, conn)` với conn nội bộ `connectionId='agent-v2'`. Giữ write guard + `mcpAuditLogs` (registerTools.js:65-102, auditLog.js), tool mới tự có cho client MCP ngoài, tránh `requirePaidPlan` 402 Free. Giá: kiểm plan + credit phải vào trong từng tool handler (cả 2 kênh hiện không kiểm per-feature). Loại: gọi service thẳng (mất audit, tách logic), đi /api bằng internal JWT (thừa hưởng lỗ credit FE).
3. **Thiếu gì**: mục "Note bỏ sót".
4. **Credit**: mục "Sai nặng" #2.
5. **Kiểm riêng 1 hạng mục**: dễ — mỗi issue khai `meta.requiredArtifacts` + `audit(artifacts, shop)` sync (runner.js:211); chỉ cần resolve artifact của item đó. Chưa có API. Nhanh: settings/brokenLinkReport (Firestore). Vừa: crawlPagePuppeteer (thực ra fetch, 4 trang mẫu, 20s), storeResources (cần store scan trước). Chậm: htmlPageContent (Puppeteer). Chậm nhất: resultLightHouse (PSI 45-70s/URL, timeout 120s) — hreflang, imageDelivery, jsLongTime, lcpImage. Store-wide: imageAltReport, onpageScoreReport.
6. **HTML store password**: OK thêm bước POST /password, build trên `fetchHtmlContent` (seoSpeed.js:705, có SSRF guard), không dùng getPageContent/prepareAnalysisPage (fetch trần). **Bảo mật**: `passwordStore` lưu plaintext trên shop doc, trả ngược browser (BannerPassword.js:42), gửi header sang Lighthouse — giữ password + cookie phía server, không vào context LLM/log. Bản chạy JS: chưa cần.
7. **Chính sách store**: scope `read_legal_policies` không có (config/shopify.js:10-30) → luôn rỗng (thực tế trả '' rồi gatherShopData.js:106 thành []). Đồng ý đọc /policies/* công khai; store password cần cùng cookie.
8. **RUM / PSI quota**: code xin scope có sẵn (RumReport.js:71) nhưng page không route — tái dùng được. `device` nội suy raw vào query (seoController.js:1769). Quota PSI không có trong code → check GCP console; app đã gọi PSI ở scan checklist (≤6/scan), speed score, weekly scan.
9. **Save**: #7 ở trên.

## Bug prod phát hiện thêm (ngoài scope note)

- Bulk edit/Optimize URL AI gợi ý: không trừ credit (chỉ redux).
- `/optimize/images` (164) alt AI product/collection/blog không trừ; `/optimize/preview` 168 + `/optimize/ai-preview` isPreview gọi AI không check credit, không rate limit.
- `PUT /sitemaps` 458 lưu Firestore doc id vào excludedIds, rebuild so với Shopify gid → resync huỷ loại-hàng-loạt.
- `POST /revertBackup` 104 (HyperSpeed) không làm gì, trả success.
- "Revert alt to original" (V25) gọi `/dev` → merchant bị từ chối nhưng toast "started".
- `/sitemaps/sync` bị chặn vẫn trả `{success:true}`.
- `/shopify/themes?current=1` vintage theme → success:false thay vì supportAppBlock:false.
