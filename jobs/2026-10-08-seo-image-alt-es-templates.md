# seo FAL-837: Image alt from the search index + per-template storefront alt check

Asked by Tuan on 2026-10-08, in the round-3 review of !2270. Ships on !2383 (`fix/FAL-837-review-round3`).

## Why

The "Image alt" checklist item (`services/audit/issues/emptyImageAlt.js`) does not read the
search index. `artifacts/imageAltReport.js` starts a second Shopify bulk operation
(`startMissingAltScan`, `bulkOperationService.js:437`) and the result reaches the checklist
through the bulk webhook (`applyImageAltResult.js`, `runner.js:72`). Three problems:

1. Shopify allows one bulk operation per shop. A scan during a store-data sync fails to start the
 count (`logger.warn` and nothing more), so the count goes stale. A count that is running
 blocks the sync.
2. Every other whole-store item reads ES from the same sync. Image alt is a different source
 with a different age, and the pages modal cannot list the resources missing alt.
3. Shops with `useOptImageV25` count every image in Files, not the images on resources.

The store's rendered HTML is never checked for alt. Theme sections (hero banners, image-with-text
blocks, etc.) carry their own images, and Shopify renders each resource through its template
(`product.json`, `product.alt-x.json`, …). Tuan wants the homepage and **every template that is
actually assigned** checked.

## Decisions

- **Resource images: ES.**
  - The bulk export adds the image alt data.
  - `transformDocument` stores `imageCount` and `missingAltCount` per doc and adds `emptyImageAlt`
  to `checklistIssues` when `missingAltCount > 0`, so `listStoreIssuePages` and the modal work
  unchanged.
  - The item counts images via an ES `sum` aggregation.
  - Products: all media images. Collections: `image`. Articles: `image`. Pages have no image.
- **No separate bulk op for the checklist.** Remove the checklist's `startMissingAltScan`
trigger and its webhook→checklist wiring. Keep `optimizeReport` counts and anything the
Image optimizer page itself uses.
- **`CHECKLIST_INDEX_VERSION` 3 → 4.** It does not exist on master; FAL-837 introduces it. Every
merchant syncs once at release anyway, so the bump costs prod nothing. It also stops an old
index without the new fields from reading as "0 missing" (a false pass).
- **Alt rule:**
  - Missing `alt` attribute = fail.
  - `alt=""` = decorative, a pass (WCAG H67).
  - For Shopify media, `alt` null or empty = missing: Shopify has no "decorative" flag on media,
  and the theme renders an empty alt as the product title or as `alt=""`.
- **Templates: from ES.**
  - Export `templateSuffix` for products, collections, pages and articles.
  - Group published docs by `resourceType` × `templateSuffix` (null → default).
  - Take one sample URL per group.
  - Unassigned theme templates are unreachable, so they are skipped.
  - Cap: home + 15 template pages. Order: default template per type first, then alternates by
  doc count.
- **Fetch:** plain HTTP fetch (the `htmlPageContent` `fetchAllWithFetch` path), not Puppeteer.
  - Concurrency 4, 10 s timeout per page.
  - Parse `<img>` with cheerio.
  - A password-protected store → the template part is notChecked.
- **One item, two parts.** `emptyImageAlt` fails if resource images miss alt **or** any sampled
template page has an `<img>` without `alt`.
  - Summary: the existing resource count sentence.
  - Expanded: one row per template page (page type, template name, link, missing / total).
  - New strings go in all 14 locales.

## Nodes

- `es-image-alt`: export + transform + count + remove the separate bulk op + version bump.
- `template-html-alt` (after `es-image-alt`): `templateSuffix` export, sample picker, fetch and
parse, merged into the item, FE rows.

## Progress

- [x] graph run: both nodes done. Integration branch `fix/FAL-837-image-alt` in worktree

  `seo-wt-seo-image-alt-es-templates`, on top of `42fac3f0a17`.
- [x] review diff (52 files). Fixes on top (`304ffdb173f`): `TemplatePageRows` rewritten in JSX

  (Codex used `React.createElement` to dodge jest's JSX gap; the test now compiles it with
  `transformFileSync`), and the stale Sidekick comment fixed. Checked:
  - `groupExportResources` keeps articles (top-level in the export, no `__parentId`), and
  metafields have no `id`.
  - The picker query runs on local ES: `id.keyword` exists, and an unmapped `templateSuffix`
  falls back to `default`.
  - jest: only the 4 baseline suites fail; `installStatus` is a flake (passes 4/4 alone).
- [ ] local verify (sync + scan on linhnguyen11). Blocked: the Playwright extension stopped

  answering (even `browser_tabs` hung for 15 min).
  - Backend smoke run on lib passed. Home: 12 images, 0 missing.
  - Fetch + parse of product, collection, page and article samples is correct, and a 404 is
  reported notChecked.
  - The local Mac drops `node-fetch` connects at random: Node's `autoSelectFamily` gives each
  connect attempt only 250 ms, and the error reason is empty. With
  `--no-network-family-autoselection` it is 4/4 stable. This is environmental; GCF reaches
  Shopify in a few ms.
  - Still to see after a re-sync: the ES docs carry `imageCount` / `missingAltCount` /
  `templateSuffix`, and the item UI shows the template rows.
- [ ] push to !2383 + MR description

## Round 2 (Tuan, 2026-10-09)

Tuan: "sao mất page này koi fetch được vậy + t cần show những ảnh nào đang thiếu ra, cần url của
từng page + phân chia rõ ảnh thiếu của image trong product và ảnh ngoài site or template ra 2 card
nhưng chung 1 card tổng".

**Why pages were "Not checked".** After a real sync the picker chose 9 template pages:

- products: default
- collections: default
- articles: default, `avada-sidebar-ads`, `article`
- pages: default, `alireviews-request-review`, `avada-articles-tags`, `gp-template-…`

Every `/blogs/*` URL got **HTTP 429** from the storefront, with no `Retry-After` header and still
429 after 20 s. A browser User-Agent did not help. Products, collections and pages returned 200 the
whole time. This is Shopify's bot throttle on the blog path for this IP. `fetchWithTimeout` returns
'' on `!response.ok` without logging anything, so a 429, a 404 and a password page all looked the
same: "Not checked".

**Changes:**

1. **Fetch outcome per page.**
   - Record `status` (HTTP code) and `reason`: `rateLimited` (429), `httpError` (other non-2xx),
    `password`, `network` (timeout or connect).
   - On 429, retry up to 2 more times with backoff (2 s, then 6 s; honor `Retry-After` when it is
   present, capped at 10 s).
   - Log a warn with the status.
   - The UI shows the reason, e.g. "Shopify temporarily blocked our request (429). Rescan later."
2. **Name the missing images.**
   - Resources: the product export adds `image { url }` on each `MediaImage`. The doc stores
    `missingAltImages: [url]`, capped at 10 per doc. Collections and articles take their `image.url`
    when its alt is missing.
   - Template pages: store `missingAltImages: [src]` per page (absolute URL, capped at 20) next to
   `imageCount` / `missingAltCount`.
3. **Layout: one Image alt item, two sub-cards inside when expanded.**
   - **Product, collection &amp; blog images** (search index):
     - "N of M images missing alt".
     - Up to 5 resources inline: thumbnail, title, storefront URL, count, and small thumbnails of the
     images missing alt.
     - "View all" opens the existing pages modal; its rows show those thumbnails too.
   - **Site &amp; template pages** (rendered HTML), one row per page:
     - label (Homepage / Product · default / Page · alireviews-request-review);
     - the full URL as an external link;
     - "N of M images missing alt", then the missing images as thumbnails with their src;
     - or the not-checked reason.
   - The header summary still reads the total.

## Round 3: rescan one template (Tuan, 2026-10-09)

Tuan: "có thể cho rescan lại từng template được không, thay vì toàn bộ đỡ mất chi phí nhiều".

A full rescan reruns every artifact (Lighthouse, Puppeteer crawl, ES reads, …). Rescanning one
template page costs one storefront GET plus a cheerio parse, then one Firestore write.

- **Route:** `POST /seo-checklist/image-alt/rescan-template`, body `{pageType, template}`, next to
`GET /seo-checklist/pages` (`routes/api.js:292`).
- **The URL comes from the stored `templatePages` entry, never from the request (SSRF).** An entry
that is not in the shop's stored checklist → 404.
- **Fetch:** the same `fetchWithTimeout` (429 retry, reasons) and `countHtmlImages` as the scan.
A password store → reason `password`, no fetch.
- **Write:**
  - Replace that one entry in `avada-seo-checklist.issues.emptyImageAlt.templatePages`.
  - Recompute the item status: resource part from the stored failedCount, plus every template entry.
  - Recalculate the checklist score the way `applyStoreResourcesResult` does
  (`recalcChecklistScore`).
  - Scope everything by the session's shopId.
- **Guard:** reject while a full scan is running (`checklist.scanning`). A 10 s per-entry cooldown
(`rescannedAt` on the entry) → 429 to the caller.
- **FE:** a refresh icon button on each template row, with a spinner while it runs. Update the
row and the item in place from the response; no full reload. Toast on error. `trackEvent` per
`docs/features/product-analytics-tracking.md`.

## Round 4: rescan one checklist item (Tuan, 2026-10-09)

Tuan: "từng issue trong checklist cũng cho rescan lại tránh mấy tgian".

- **Runner:** `Runner.auditIssues(shop, types)` (`services/audit/runner.js`).
  - Filter `getIssuePath().listIssueDefault` to `types`, and resolve only their
  `requiredArtifacts`.
  - Run the audits.
  - Merge the results into the stored checklist issues: replace those types, leave the rest. Then
  `prepareIssue`, `calcScoreDependOnIssues` over the merged list, and `pruneIssueFixed`, the
  same way a full `audit()` does.
  - Does not touch `scanning` or `lastScanAt`.
- **Async.** `POST /seo-checklist/rescan-issue` `{type}`:
  - The type must be a known issue type and not disabled.
  - 409 while a full scan is running.
  - 30 s cooldown per type (`rescanStartedAt`) → 429.
  - Sets `issues.<type>.rescanning = true`, then `dispatchWork` to the existing scan subscriber
  with `{types: [type]}`. Check `worker.config.yml`: if that topic runs on the fleet, the worker
  handler must take the same payload.
  - The handler runs `auditIssues` and clears `rescanning` in `finally`.
  - A `rescanning` flag older than 10 minutes counts as dead (it can be restarted).
- **FE:** a refresh icon button on each item row header, with a spinner while
`issue.rescanning`. The result arrives through the existing checklist snapshot listener. Hide
the button while the full scan or the sync runs. `trackEvent`, scope single.

## Round 5: one rescan flow per data source (Tuan, 2026-10-09)

Tuan: "audit lại những issue nào cần rescan lại giúp t từ đó làm luồng rescan riêng".

### Audit (tree c3670730234)

Round 4 sends every type through the same path: `getAuditParams`, then the item's artifacts, then
merge. Measured against where each item's data comes from, four problems:

1. **Storefront items never see a fix.** `crawlPageData`/`htmlPageContent`/`templatePages` bypass
 the CDN cache only for URLs in `shop.forceRefreshUrls`. A merchant who edits the theme and hits
 rescan gets Shopify's cached HTML and the same verdict.
2. **Store-wide items re-read a stale index.** `storeResources` reads ES as of the last sync. ES is
 refreshed only by the sync and by app metafield writes (`refreshChecklistAfterWrite`). A fix made
 in Shopify admin is invisible, so rescan reprints the same count.
3. **PSI items waste the run.** `resultLightHouse` runs PSI mobile on every sampled URL (\~4 URLs,
 30-60 s each) and feeds 4 items. Rescanning one keeps 1 result and throws away 3.
 `lighthouseScore` returns the cached `shop.scoreMobile/scoreDesktop` or `avada-speed-score`
 whenever one exists, so its rescan never calls PSI at all.
4. **App-state items pay for a storefront round trip.** `googleSearchConsole`, `speedUp`,
 `brokenLinks` read only Firestore, yet rescan runs `getAuditParams` (redirect trace, 50-product
 GraphQL, 2 REST collection lists, blog lookup) and a fleet job.

`onpageSeoScore` is computed by the store sync into ES. Nothing a rescan can do changes it.

### Decision: strategy per type

One table, `packages/functions/src/const/checklistRescan.js` (pure constants, the FE imports it via
`@functions/const/checklistRescan`):


| strategy         | types                                                                                                                                                                                                           | how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | cooldown |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `appState`       | googleSearchConsole, speedUp, brokenLinks                                                                                                                                                                       | inline in the request: resolve only `settings` / `brokenLinkReport` with `{shopId, shop}`, no `getAuditParams`, no dispatch; merge + rescore; respond with the updated issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 5 s      |
| `storefront`     | password, duplicateTitle, favicon, h1TagLength, nofollowLinks, openGraph, organizationStructuredData, productStructuredData, lazyLoad, preload, appBlog, afterListContent, canonical, ratingAndReviewStructured | worker `auditIssues` with the shop's `forceRefreshUrls` set to `['regex:.*']` for this run only (in memory, never persisted), so every fetch busts the CDN cache; `crawlReviewSnippet` gets the same cache-bust                                                                                                                                                                                                                                                                                                                                                                                                                                              | 30 s     |
| `storeIndex`     | metaTitle, metaTitleLength, metaDescription, metaDescriptionLength, noindexTag, emptyImageAlt                                                                                                                   | worker: first re-read from Shopify the resources ES currently lists as failing that type (`listIssueResourceIds` per tab, paged, cap 250 ids per type) through `refreshChecklistDocs`, then `auditIssues` with the cache-bust above. `refreshChecklistDocs` today keeps `missingAltCount` from the last export because its query fetches no media: extend `checklistRefreshNodes.graphql` with the same image fields the bulk export reads (product media `MediaImage {alt image{url}}`, collection/article `image{altText url}`) and compute `imageCount/missingAltCount/missingAltImages` with the same helper the export path uses, so a fixed alt clears | 60 s     |
| `pageSpeed`      | imageDelivery, jsLongTime, lcpImage, hreflang                                                                                                                                                                   | rescanning any one marks **all four** `rescanning` and runs `auditIssues` on all four (one PSI pass, four results)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 10 min   |
| `pageSpeedScore` | lighthouseScore                                                                                                                                                                                                 | `lighthouseScore` artifact gets a `fresh` param that skips the `shop.score*` and `avada-speed-score` caches and calls PSI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 10 min   |
| none             | onpageSeoScore                                                                                                                                                                                                  | not rescannable: controller 400, FE hides the button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —        |


- The cooldown is per group (the `pageSpeed` four share one `rescanStartedAt` check), from the table.
- The 429 response carries `retryAfterMs`. The 200 response carries `types` (every type that went into `rescanning`).
- The dead-flag rule (a `rescanning` older than 10 min can be restarted) stays.
- FE:
  - The rescan button shows only for types the table lists.
  - The `pageSpeed` four all spin, which happens automatically through each one's `rescanning` flag.
  - The tooltip for `pageSpeed`/`pageSpeedScore` says it takes about a minute.
  - New strings go in `issue.json` + 14 locales.  
  
- NOTE: nhưng phần như meta title, description issue của nó gồm products, collections..., t muốn khi nhấn nút fix thì nó sẽ gom những sản phẩm cânf fix ra 1 batch để chạy thay vì sang màn fix xong chọn lại, vẫn ra page meta nhưng sẽ chọn sẵn, chỉ cho khách tick haowjc bỏ tick nhưng sp hay page không muốn sửa   
Phần **Onpage SEO score cũng như trên**  
  

## Round 6: Fix opens a pre-selected batch (Tuan, 2026-10-12)

Tuan's note above: for the meta items (and Onpage SEO score), Fix should land on the fix page with
exactly the failing resources already selected as one batch; the merchant only unticks the ones
they do not want, then runs.

### What exists (tree a0307969b9)

- **Meta.**
  - Fix goes to `/ai-content?section&metaIssue&tab`. `GeneratorSetting.jsx` lists the issue-filtered rows (`extraQuery={metaIssue, metaIssueKind}`) in a selectable table (`useOnPageTable.js`).
  - A hand-picked run already works: `POST /genFaqBulk` `{selectAll:false, selectedResources:[gid…]}`, the worker runs exactly those ids, 1 credit each.
  - Missing today: nothing seeds the selection, and select-all across pages is off while `extraQuery` is set.
  - FE cap: 500 selected (`GeneratorSetting.jsx:275`). The credit check runs before the run.
- **Onpage.**
  - Fix sets the tab + `scoreBelow` in QueryContext and goes to `/seo-audit/seoOnPage`. The audit table is selectable, with a **Bulk AI Fix** action (estimate → `POST /audit-agent/bulk-fix`).
  - The payload is either an explicit `products:[{id,title,handle,image,scoreBefore}]` + `pageType` (product|collection|article|page), or `selectAll`.
  - `selectAll` resolves through `resolveSelectAllProducts`, which ignores `scoreBelow` and caps at `BULK_FIX_MAX_PRODUCTS = 50`. The explicit array has **no cap** in the controller.
  - Up to 27 credits per product.
- **Failing ids server-side.**
  - Meta: `listIssueResourceIds` (ES `checklistIssues`, paged, `metaIssueTypesFor(section, kind)`).
  - Onpage: `AnalysisService.searchByScore` with `scoreBelow = ONPAGE_SCORE_PASS (60)`.

### Decision

- **One read endpoint.** `GET /seo-checklist/issue-resources?type=<checklist type>&tab=<product|collection|blog|page>`, scoped by `shopId`.
  - Meta types → `listIssueResourceIds` with that type's issue kind.
  - `onpageSeoScore` → `searchByScore` below 60.
  - Returns `{ids, total, capped}`. The cap is per type: **500 for meta** (the FE run cap) and **50 for onpage** (`BULK_FIX_MAX_PRODUCTS`).
  - Onpage rows also return what the bulk-fix payload needs (`id, title, handle, image, score`).
  - `needsChecklistSync` → `{ids: [], needsSync: true}`.
- **Fix carries `preselect=1`.**
  - Meta: `/ai-content?…&preselect=1`.
  - Onpage: the existing QueryContext seed plus a `preselect` flag (QueryContext or URL, whichever the page reads).
  - On mount with the flag, the page fetches the endpoint and seeds the table selection: persisted selected ids, `selectAll:false`.
  - The merchant can untick rows on any page, because the selection persists across pages. Run uses the existing explicit-ids payloads.
  - The flag is consumed once. A refresh or tab switch does not re-seed over the merchant's unticks.
- **Over the cap:** select the first N and show an info banner, e.g. "Selected the first 500 of 1,240 pages with this issue. Run again for the rest."
- **Credits:** unchanged. The existing pre-run credit check and the onpage estimate step run as today, so the merchant sees the cost before spending.
- **Backend hardening found on the way:** `POST /audit-agent/bulk-fix` and `/estimate` reject an explicit `products` array longer than `BULK_FIX_MAX_PRODUCTS` (400). Today it is unbounded.
- **Rules:**
  - `trackEvent` on the preselected landing: element `checklist_fix_preselected`, payload `issue_type`, `page_type`, count.
  - New strings in their component JSON + 14 locales.
  - The home row (Shopify preferences) is unchanged.

### Outcome (Tuan's follow-ups, 2026-10-12; merged into !2383 @ 07d9c04114)

Changes to the decision above, in the order Tuan asked:

- **Pass threshold is 80**, not 60 (`ONPAGE_SCORE_PASS`).
- **The onpage batch has no cap.** "có bao nhiêu thì chọn bấy nhiêu", and only for the checklist landing.
  - `listAllBelowScore` reads ES worst-first (10k window) and drops nodes deleted on Shopify.
  - Select all and MCP keep `BULK_FIX_MAX_PRODUCTS = 50`.
- **The "backend hardening" above was wrong and is reverted.** The explicit-list 400 broke Report → Optimize, which sends every page below the chosen score. Master never had that cap.
  - Also fixed: `createProductDocs` now writes in 500-write batches, the Firestore batch limit. Runs over 500 failed before, on master too.
- **The popup opens by itself after seeding.** Each popup has a "selected from the SEO checklist" banner.
  - Onpage → Bulk AI Fix estimate, all four fields ticked (body content included).
  - Meta → new "Confirm AI generation" popup in `GeneratorSetting`: language, instructions, credits.
- **Image alt (admin) follows the same flow without a selection.** The optimizer runs shop-wide.
  - Fix → `?fromChecklist=1&missing=<admin failedCount>`, which opens the **missing alt** confirm popup.
  - Credit cards show only in AI mode. They use `optimizeReport.missingAltCount`, because a V25 run covers Files and that differs from the checklist's published-resource count (dev store: 5 vs 12).
- **Actions are locked while the batch loads.** The `QueryContext` request is pending until consumed; the image page waits for its settings to load. A loading banner shows in the meantime.
- **Second FAL-837 merge** (c7248b7f4d, Rescan re-syncs the index). The resolution is in the MR description.

Verified on the dev store with Playwright: onpage 281/281, meta 27, image alt popup. AI-mode image credits were not seen in a browser.
