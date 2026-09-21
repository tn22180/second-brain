> Chế độ của skill `release`. File này tự đủ — đọc xong là làm được.

# Changelog Skill

Skill để viết changelog định kỳ cho các sản phẩm Avada / SEO On.

Sản phẩm đầu ra: **2 file** cho mỗi product
- `CHANGELOG.md` — nội bộ (dev/PM/QA đọc, có technical details)
- `CHANGELOG-user.md` — public (merchant đọc, publish lên https://docs.avada.io/<app>/product-roadmap/changelog)

---

## Trigger

Khi PO nhắn:
- "viết changelog" / "update changelog" / "cập nhật changelog"
- "viết changelog cho <product>" / "changelog tháng <X>"
- "publish changelog lên docs" → cũng cần generate `CHANGELOG-user.md` trước

**Không dùng chế độ này** khi PO nhắn "release note" / "viết release note" — đó là [chế độ slack-note](slack-note.md) của skill `release` (Slack format, ad-hoc từng feature).

---

## Khác biệt với chế độ `slack-note`

| | chế độ slack-note | chế độ changelog (đang đọc) |
|---|---|---|
| Audience | CS/Support team internal (Slack) | Merchants (public docs) + nội bộ |
| Tần suất | Mỗi feature ship | Định kỳ tháng |
| Output | 1 Slack post | 2 file markdown (internal + user) |
| Scope | 1 feature | Tổng hợp tháng |
| Format | Slack block với emoji `:pepe-...` | Markdown clean |

---

## ⚠️ Rule quan trọng — Phân biệt apply flow giữa 2 file

| File | Audience | Apply flow |
|------|----------|-----------|
| `CHANGELOG.md` (internal) | Dev/PM/QA nội bộ | ✅ **Tự apply ngay** sau khi viết — không cần PO duyệt |
| `CHANGELOG-user.md` (public) | Merchants (live trên docs) | ⚠️ **Draft trong chat trước**, PO chốt mới apply |
| `changelog-raw.md` (intermediate) | Internal dump | ✅ Tự apply, không cần duyệt |

### Flow khi PO nhắn "viết changelog":

1. Pull MRs → phân tích → group theo tháng
2. **Apply ngay** `CHANGELOG.md` (internal) và update `changelog-raw.md`
3. **Show draft `CHANGELOG-user.md` trong chat** — chờ PO review
4. PO confirm (ví dụ "OK apply" / "chốt" / "ghi file đi") → mới Edit/Write vào `CHANGELOG-user.md` thật
5. Sau khi apply user file, show diff cho PO check lại

**Lý do:** Internal changelog là dev artifact, hallucination tech detail ít rủi ro (dev sẽ tự verify khi đọc). User-facing thì mỗi câu chữ merchant đọc → PO phải kiểm soát từng wording.

**Edge case:**
- Nếu PO nói "viết changelog và publish luôn" → apply internal, draft user, chờ chốt, apply user, rồi [publish lên docs](#publish-lên-docs-nextra)
- Nếu chỉ cần update internal (ví dụ "log lại các MR mới vào CHANGELOG.md") → apply, không cần draft trước

---

## ⚠️ Rule quan trọng — Append-only, KHÔNG sửa lịch sử

Changelog là **historical record đã chốt** với PO/team/merchants. Khi viết tiếp:

- **CHỈ append section mới** vào top của `CHANGELOG.md` và `CHANGELOG-user.md`
- **KHÔNG sửa, rewrite, refactor** các tháng cũ đã có trong file — kể cả thấy typo, tone không nhất quán, format hơi khác. Tháng cũ = frozen.
- **KHÔNG re-categorize** MR cũ (ví dụ chuyển 1 mục từ Improvements sang New Features)
- **KHÔNG xóa** entry cũ
- Nếu phát hiện sai sót nghiêm trọng ở tháng cũ → **hỏi PO trước**, không tự sửa

**Xác định range cần viết:**
1. Đọc `CHANGELOG.md` và `CHANGELOG-user.md` hiện tại
2. Tìm section mới nhất (ví dụ `### April 2026`)
3. Chỉ fetch + viết từ **sau ngày cuối cùng của tháng đó** đến hôm nay
4. Ví dụ: tháng 4 đã chốt → khi PO nhắn "viết changelog tháng 5", chỉ fetch MRs merged từ 2026-05-01 trở đi

**Edge case:**
- Nếu tháng hiện tại đã có section nhưng PO muốn bổ sung thêm MR vào tháng đó → **hỏi PO**: "Tháng 5 đã có 3 mục, MR mới này append vào dưới hay tạo entry riêng?" — không tự ý merge
- Nếu file chưa có entry tháng nào → đây là first run, viết từ tháng PO chỉ định

---

## Quy trình

### Bước 0 — Xác định range (BẮT BUỘC làm trước khi fetch)

1. Đọc `products/<product>/changelog/CHANGELOG-user.md` → tìm section tháng mới nhất
2. Xác định **start date** = ngày đầu tháng kế tiếp sau tháng đã chốt
   - Ví dụ file đã có `### April 2026` → start date = `2026-05-01`
3. Tính `<days>` = số ngày từ start date đến hôm nay, **+5 ngày buffer** (tránh sót MR merge cuối tháng)

### ⚠️ Quan trọng — Release month ≠ MR merge month

Một feature có thể được PO/team plan ship trong tháng X, nhưng MRs thực merge trượt sang tháng X+1 do dev kéo dài, polish, hoặc multi-MR sequence. **Đừng chỉ dùng MR merge date làm nguồn duy nhất** để quyết định feature thuộc tháng nào.

**Cross-reference bắt buộc:**
1. Đọc `products/<product>/prd/*.md` — PRD có `Last revised` date + ticket ID (METARANK-xxxx, etc.) cho biết release plan thật
2. Đọc `planning/<product>/roadmap-2026.md` và `tasks.md` — xác định feature nào đang "In Sprint" tháng nào
3. *(PO-only)* nguồn strategy nội bộ của PO — hỏi PO nếu cần biết theme/initiative tháng nào
4. Hỏi PO khi không chắc: "Meta tags revamp có MR merge tháng 5, nhưng PRD revised tháng 4 — release tính tháng nào?"

**Hệ quả:**
- Một số feature trong user changelog tháng X có thể KHÔNG khớp 1-1 với MRs merge tháng X
- Internal CHANGELOG.md vẫn nên reflect actual MR merge dates (cho dev/QA trace), nhưng user changelog reflect release plan (cho merchant)
- Nếu PO nói "feature Y bị thiếu" → kiểm tra PRD trước khi kết luận

**Bài học từ session 2026-05-15:**
Meta tags Revamp (METARANK-2251, PRD revised 2026-04-24) là April release plan, nhưng MR merge !1485 và !1794 trượt sang tháng 5. Initial draft chỉ dựa vào MRs nên drop section này — PO phải nhắc bổ sung. → Luôn cross-ref PRD.

---

### Bước 1 — Fetch MRs từ GitLab

Chạy script:

```bash
./scripts/fetch-gitlab-mrs.sh <days>
```

- `<days>` = tính ở Bước 0 (KHÔNG dùng default 7 trừ khi PO yêu cầu rõ)
- Script đọc `GITLAB_TOKEN` + `GITLAB_PROJECT_ID` từ **biến môi trường** (khối `env` của `~/.claude/settings.json` — cách chính), fallback `.env` trong thư mục skill (xem `docs/setup.md` mục 5)
- Output: ghi vào **thư mục đang mở (cwd)** → `./products/<product>/changelog/gitlab-mrs-latest.{json,md}`
- **Filter sau fetch:** loại bỏ MRs có `merged_at` < start date (script có thể fetch dư do buffer)

**Lưu ý về đường dẫn output:** Output theo **cwd**, không phải thư mục skill — chạy script từ repo product thì file rơi vào repo đó. Đổi đích bằng biến môi trường, **đừng sửa script** (script nằm trong `~/.claude/plugins/`, bị ghi đè mỗi lần `/plugin install`):

```bash
MR_PRODUCT=seo-on-blog ./scripts/fetch-gitlab-mrs.sh 30    # → ./products/seo-on-blog/changelog/
MR_OUTPUT_DIR=/duong/dan/khac ./scripts/fetch-gitlab-mrs.sh 30
```

Product khác cũng cần `GITLAB_PROJECT_ID` khác (xem mapping bên dưới).

### Bước 2 — Update `changelog-raw.md`

File `products/<product>/changelog/changelog-raw.md` là intermediate dump — gom MRs theo tháng, phân loại 3 nhóm:

```markdown
## <Month Year>

### ✨ New Features
- **<MR title>** (YYYY-MM-DD) — <optional short description>

### 💪 Improvements
- **<MR title>** (YYYY-MM-DD) — <optional short description>

### 🐛 Bug Fixes
- **<MR title>** (YYYY-MM-DD)
```

Phân loại dựa trên title/description MR:
- `feat:`, `feature/`, `add `, `new ` → New Features
- `improve:`, `enhance`, `refactor`, `optimize`, `update`, `chore` → Improvements
- `fix:`, `bug`, `hotfix`, `patch` → Bug Fixes

### Bước 3a — Viết `CHANGELOG.md` (internal)

Add section mới ở **top** với format:

```markdown
### [<version>] - YYYY-MM

#### <Feature name — kỹ thuật cụ thể>

<Mô tả vấn đề cũ — context dev cần biết>. <Thay đổi cụ thể: field nào, button nào, behavior gì>:

- **<Sub-component>** — <chi tiết>
- **<Sub-component>** — <chi tiết>

**<Khía cạnh kỹ thuật>** <Mô tả chi tiết implementation user-visible, ví dụ: "Inline `@` variable picker replaces external link. Typing `@` opens popover with caret-position insertion.">

#### Dev Zone

- `<MR title>` (branch: <branch>, author: <author>)

#### <Feature 2>
...

#### Bug fixes

Fixed <list các bug, gom 1 đoạn>.
```

**Nguyên tắc viết:**
- Có **version number** (`[1.78] - 2026-04`) — hỏi PO version hiện tại nếu chưa rõ
- Mô tả **chính xác**: tên field, tên button, default value, credit cost cụ thể, retry count
- Có **Dev Zone** section liệt kê MR refactor / internal tool / không có UX impact (giữ branch name + author)
- Backend behavior nói rõ: "auto-retries up to 5 attempts (typically 2–3 in practice)"
- Credit cost ghi rõ: "Main content: each issue now costs 2 credits (was 1) — total 7 issues need AI fix"

### Bước 3b — Viết `CHANGELOG-user.md` (public)

Add section mới ở **top** với format:

```markdown
### <Month Year>

#### <Feature name — story title, không tech>

<2-3 đoạn văn — merchant POV. Vấn đề → giải pháp → benefit. Có thể dùng câu hỏi mở "Running a Black Friday campaign?">

#### <Feature 2>
...

#### Other Improvements

- <Improvement gọn, 1 dòng>
- <Improvement gọn, 1 dòng>

#### Bug fixes

Fixed <list khu vực fix, gom 1 đoạn ngắn, không tech detail>.
```

**Nguyên tắc viết (QUAN TRỌNG):**
- **Không version number** — chỉ `### April 2026`
- **Merchant POV** — "you", "your store", "your campaigns"
- **Không tech jargon**: bỏ "cron", "pubsub", "useAiCredit hook", "portal rendering", "selectAll pattern"
- **Ẩn hoàn toàn Dev Zone — internal flow, KHÔNG bao giờ xuất hiện trong user changelog**:
  - Không có section "Dev Zone" trong user file
  - Không mention "Dev Zone" trong bất kỳ feature/improvement/bug fix nào
  - Không mention các MR có scope chỉ Dev Zone (access token viewer, force refresh URLs, exclude 404 in devzone, internal API docs, batch size config, password modal, etc.)
  - Không mention "CS screenshot toggle", "support tool", "internal admin" — đây đều là Dev Zone
  - Nếu 1 MR vừa có user impact vừa có Dev Zone change → chỉ viết phần user impact, ẩn Dev Zone
- **Ẩn refactor không có user impact** — nếu MR là pure refactor, đừng đưa vào file user
- **Ẩn internal infrastructure** — Sentry removal, Elasticsearch migration, Pub/Sub refactor (trừ khi user thấy được performance improvement) → ẩn
- **Gộp/đơn giản hóa**: "Main content và FAQs fixes now cost 2 credits per issue (was 1)" thay vì liệt kê chi tiết số lượng issue
- **Backend retry** nói chung chung: "keeps retrying until every AI-fixable issue is resolved" thay vì "up to 5 attempts"
- **Bug fixes** gom 1 đoạn liệt kê khu vực — KHÔNG bullet list từng bug, KHÔNG technical detail
- **Tone**: friendly, câu mở "We've merged…", "Set a rule to…"
- **HẠN CHẾ dùng em-dash (—)**: tối đa 1 em-dash mỗi feature section. Ưu tiên dấu chấm, dấu phẩy, hai chấm (:), hoặc dấu ngoặc đơn:
  - ❌ "Bulk Edit — change SEO fields across many pages at once" (em-dash trong heading)
  - ✅ "Bulk Edit: change SEO fields across many pages at once"
  - ❌ "Versioning — every optimization is saved as a version. Don't like the new alt? Revert any image — or all images at once — back to a previous state."
  - ✅ "Versioning: every optimization is saved as a version. Don't like the new alt? Revert any image (or all images at once) back to a previous state."
  - ❌ "Fixing Main Content issues with AI is now async — the job runs in the background"
  - ✅ "Fixing Main Content issues with AI is now async. The job runs in the background"

### Bước 4 — Review với PO

- Show diff cho cả 2 file
- PO confirm → optional: [publish `CHANGELOG-user.md` lên docs](#publish-lên-docs-nextra)

---

## Mapping: Product → GitLab Project ID → Folder

| Product | GitLab Project ID | Changelog folder |
|---------|-------------------|------------------|
| Avada SEO Suite | 17456707 | `products/avada-seo-suite/changelog/` |
| SEO On Blog | _(TBD)_ | `products/seo-on-blog/changelog/` |
| AEO Optimizer LLMs.txt | _(TBD)_ | `products/aeo-llms-txt/changelog/` |
| AI Product Description | _(TBD)_ | `products/ai-product-copy/changelog/` |
| AP Speed Optimizer | _(TBD)_ | `products/ap-speed-optimizer/changelog/` |

> Khi mở rộng sang product mới, bổ sung Project ID vào `.env` hoặc tạo biến thể script.

---

## Mapping: Product → Live changelog URL

⚠️ **Hai docs domain khác nhau** — Avada-branded apps ở `docs.avada.io`, SEO On suite ở `help.seoon.io`.

| Product | Live URL | Domain |
|---------|----------|--------|
| Avada SEO Suite | https://docs.avada.io/seo-suite-help-center/product-roadmap/changelog | docs.avada.io |
| AEO LLMs.txt | https://docs.avada.io/seo-on-aeo-optimizer/changelog | docs.avada.io |
| AI Product Copy | https://help.seoon.io/ai-product-copy/changelog | help.seoon.io |
| SEO On Blog | _(TBD — verify URL)_ | likely help.seoon.io |
| AP Speed Optimizer | _(TBD — verify URL)_ | likely docs.avada.io |

**Local file ≠ Live.** Viết xong `CHANGELOG-user.md` trong local repo chưa có nghĩa đã publish — cần [deploy lên docs](#publish-lên-docs-nextra). Trước khi update changelog, **luôn check live URL** để biết tháng mới nhất đã thực sự được merchant đọc (live URL = source of truth cho "đã chốt"); local file có thể có draft chưa deploy.

---

## Ví dụ so sánh — cùng 1 feature, 2 phiên bản

### Internal (`CHANGELOG.md`)

```markdown
#### Meta tags UX revamp — unified view, @ variable picker, AI generation

The Meta tags feature previously split into two separate modes — Basic (template) and Rule (conditional) — that merchants had to toggle between via a "Switch to Meta tag rule" button. The mental model was confusing and caused duplicated config across modes. Merged into a single screen with two layers in the same view:

- **Default meta tags** (template for all pages in the selected tab) — replaces Basic mode
- **Custom meta tags** (conditional rules that override the default) — replaces Rule mode
- Page types now surfaced as segmented tabs at the top: Product / Collection / Blog post (Homepage section removed — still configured in Shopify Preferences)

**Inline `@` variable picker** replaces the external "product variables" link. Typing `@` in any meta title/description field opens a popover with all available variables (product/collection/article/shop + custom metafields), inserted at caret on select.

**Generate with AI** button added next to Meta description label. AI generates SEO-ready description based on current tab context, shop data, and selected language. Credit counter shown inline (`Generate with AI (N left)`). Pro: 100 credits, Enterprise: 1,000 credits, Free: disabled with upsell modal.
```

### User-facing (`CHANGELOG-user.md`)

```markdown
#### Meta tags, redesigned: one view, smart rules, and AI writing

Meta tags used to live in two separate modes — Basic and Rule — that you had to switch between. We've merged them into a single, clearer layout: **Default meta tags** (the template for all pages) and **Custom meta tags** (rules for specific pages or conditions) now sit side by side in the same screen, organized by Product, Collection, and Blog post tabs.

Inside the editor, type `@` in any title or description field to pick a variable inline — no more hunting through a separate variable list. A new **Generate with AI** button creates SEO-ready descriptions in one click, using your store's context and language (Pro plan: 100 credits, Enterprise: 1,000 credits).

Managing rules is now drag-and-drop. Reorder priority by dragging rows, flip rules on or off with a quick toggle in the table, and hover any rule to preview exactly how it will render on Google — all without leaving the list.
```

**So sánh:**
- Internal: liệt kê 3 bullet kỹ thuật, mention "Homepage section removed", "caret position", credit cost cụ thể, "upsell modal"
- User: kể câu chuyện liền mạch, dùng "you", bỏ implementation detail, focus benefit

---

## Bug fixes — cách viết

### Internal
```markdown
#### Bug fixes

- Fixed page loader showing white screen on themes with custom liquid wrappers
- Hyper Speed missing domain detection when shop uses non-standard subdomain
- Wrong URL in redirect edit form (regression from MR !1554)
- Image optimization displaying incorrect file format for WebP variants
- Meta fields not persisting on save when shop has >1000 metafields
```

### User
```markdown
#### Bug fixes

Fixed Page Loader white screen on certain themes, Hyper Speed missing domain detection, wrong URL in redirect edit form, image optimize displaying incorrect format, and meta fields saving inconsistency.
```

→ 1 đoạn liệt kê, không bullet, không tech detail.

---

## Checklist trước khi báo PO

- [ ] Đã đọc file changelog hiện tại + xác định đúng start date
- [ ] Các section tháng cũ **giữ nguyên 100%** — không sửa typo, không re-categorize, không xóa
- [ ] Section mới được **append vào top**, không chèn giữa
- [ ] Fetch MRs đủ range (start date → hôm nay, có buffer)
- [ ] Update `changelog-raw.md` theo tháng, phân loại đúng
- [ ] `CHANGELOG.md` có version + Dev Zone section
- [ ] `CHANGELOG-user.md` không có version, không tech jargon, không Dev Zone
- [ ] Bug fixes ở user file gom 1 đoạn, không bullet
- [ ] Credit cost / backend behavior diễn đạt khác nhau giữa 2 file
- [ ] Tone user file friendly, merchant POV ("you", "your store")
- [ ] Refactor-only MRs đã ẩn khỏi user file

---

## Publish lên docs (Nextra)

Trang docs là **Nextra 2.13.4 + Next.js 13.5.6**, ở repo riêng (`product/docs.avada.io` cho app Avada, `product/help.blocko.ai` cho Blocko), **deploy bằng GitLab Pages**: đẩy commit lên nhánh chính là CI tự build và publish. **Không có bước bấm deploy thủ công.**

1. Copy nội dung `CHANGELOG-user.md` (bản PO đã chốt) vào trang changelog tương ứng trong repo docs — đúng đường dẫn `/en/{app}/...` (app: `seo`, `aeo`, `blog`, `apc`, `speed`).
2. Xem thử tại chỗ trước khi đẩy: `./node_modules/.bin/next dev -p 3001`.
3. Commit + push. Cần token GitLab có quyền ghi repo docs (env riêng của bạn, **không commit** token).
4. Đợi CI Pages xanh → **mở live URL kiểm tra thật**. Trang chưa đổi = chưa deploy xong.

Chi tiết quy ước viết trang docs (component MDX, `_meta.json`, sidebar, ảnh) → dùng agent `userguide-writer`.

---

## Dependencies

- **Script**: `scripts/fetch-gitlab-mrs.sh`
- **Credentials**: `.env` → `GITLAB_TOKEN`, `GITLAB_PROJECT_ID`
- **Liên quan**: [chế độ slack-note](slack-note.md) (Slack ad-hoc) · [Publish lên docs (Nextra)](#publish-lên-docs-nextra) ở trên · agent `userguide-writer` (viết/soát trang docs)
- **Reference docs**: existing `products/avada-seo-suite/changelog/CHANGELOG.md` và `CHANGELOG-user.md` là gold standard cho format

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
