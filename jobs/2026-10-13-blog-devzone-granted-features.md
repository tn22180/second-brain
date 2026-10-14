# Blog DevZone: CS-granted features (MCP first)

Source: Slack #dich-vu-5-seo, Ricky (U08A3VC53S5), 2026-10-13 14:34 —
"thêm một option no limit trong dev zone cho app blog, hoặc grant feature như SEO, để khách nào cần
mình apply cho, ngoài ra CS cần test thì có cái mà test, hiện tại MCP connection đang ko test được ở free".
Tuan replied "ok". No Jira (CS request, small).

## Why

Blog MCP (AI assistant connection) is Pro-only, hard-coded in two gates:
- `packages/functions/src/mcp/mcp.admin.controller.js` `eligibility()` — `proPlans.includes(shop.plan)`
  (startConnect, listTokens, issueToken all use it)
- `packages/functions/src/mcp/mcp.middleware.js:58` — `ctx.state.mcpBlocked = !proPlans.includes(shop.plan)`

CS has no way to unlock it per shop, so a free test store can't test MCP and a merchant who needs
it can't be granted it. SEO solved the same problem with `grantedFeatures`
(seo `packages/functions/src/config/subscription/grantedFeatures.js` + DevZone
`GrantedFeaturesContainer`). Blog has nothing equivalent (0 hits for grantedFeatures/noLimit on master).

## Decisions (binding)

1. Port SEO's pattern, not a blanket `noLimit`. A blanket flag would have to be wired into every
   plan gate in the app; a registry lets CS grant one feature and grows by one line per feature.
2. New `packages/functions/src/config/subscription/grantedFeatures.js`: `GRANTABLE_FEATURES`
   (start with `mcp: {label: 'AI assistant (MCP) connection'}`), `hasGrantedFeature(shop, key)`,
   `sanitizeGrantedFeatures(value)`. Use hasOwnProperty, never bare lookup (prototype keys).
   Unknown keys never persisted.
3. Both MCP gates become `proPlans.includes(shop.plan) || hasGrantedFeature(shop, 'mcp')`.
   Factor into one helper so the two can't drift.
4. DevZone: new `update` case `granted-features` that writes `{grantedFeatures: sanitize(data.grantedFeatures)}`
   to the shop doc via `updateShopData`. Shop doc already flows to FE? verify; FE needs current
   `grantedFeatures` to render checkboxes.
5. FE: a DevZone section "Granted features" — one checkbox per GRANTABLE_FEATURES key, Save button,
   toast on success/fail. Mirror the existing DevZone section style (CardCollapse etc.).
6. Revoking (unticking) must re-block MCP on the next request — no caching of the grant beyond the
   shop read the gates already do.
7. Do not change MCP_BLOCKED / UPGRADE_MESSAGE copy. Do not touch the internal-key whitelist for
   dev_zone types (TS AI) — CS AI owner (Fennic) asked to be told before route/auth changes;
   adding a new dev_zone type without whitelisting it changes nothing for the bot.

## Done when

- free shop + grant `mcp` → listTokens `canConnect: true`, startConnect/issueToken pass, middleware
  not blocked; ungrant → blocked again. Pro shop unchanged.
- Unknown key in PUT body is dropped.
- docs/features/mcp.md (plan gate section) + a short note in the DevZone doc if one exists.

## Log

- 2026-10-13: harness run done (Codex). Review: reverted out-of-scope eslint shim (eslintCompatibility.js + 2 .eslintrc.js) and 3 unrelated test edits; switch→if. 96/96 tests, eslint clean. MR !923 open, not merged/deployed. No Slack reply (per Tuan).

## Phase 2 (2026-10-14): every Pro/Advanced feature grantable

Tuan: "tất cả các tính năng pro với advanced đi thấy mỗi MCP". Inventory (Explore, file:line below is
relative to packages/) found almost every paid gate is FE-only, via PricingModalContext flags
(`isPaidPlan`, `isLimitFreeNew`, `isLimitAdvancedFeatures`, `isOnTrialAdvEls`, `isLimitProNew`) computed in
assets/src/components/PricingModal/PricingModal.jsx:24-35, plus ~10 ad-hoc `shop.plan === FREE` reads.
BE gates: middleware/validatePlan.js:23, controllers/articleController.js:662, mcp/tools/publishArticle.js:122,
handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:37, helpers/allowedTextModel.js:6, mcp.eligibility.js.

### Decisions (binding)

8. Registry keys (label → gate sites). A grant only ever WIDENS: each site keeps its original predicate and
   adds `|| granted`. Never change behaviour for shops without a grant.
   - `mcp` — done.
   - `aiSummary` "AI Summary" — BE articleController.js:662, publishArticle.js:122, subscribeHandleSummaryNewPublishedArticle.js:37,
     validatePlan.js:23 (storefront /settings + vote, routes/proxy.js:41,48); FE pages/AISummary/AISummary.jsx:199,218-222,287,294,
     components/AISummary/SummaryManager/SummaryManager.js:93,364,435,512,519, EditSummaryModal.js:74.
   - `advancedAiModel` "Advanced AI models (GPT-5.2)" legacyFlag `isUseGPT5` — BE helpers/allowedTextModel.js:6, FE helpers/hasGpt5Access.js:7.
   - `advancedElements` "Advanced elements & element settings" (legacy: `enableFeature`+`trialAdvEndAt` trial stays as is, NOT a legacyFlag) —
     EditorProvider.jsx:811 (+ :191-192), useElementPermissions.js:17-18,39,56-57,101, ElementsTab.js:60,180,198,209,226,
     ElementListModal.js:35, and every `isLimitFreeNew={isLimitAdvancedFeatures}` element settings panel (list in inventory: DecorationSetting,
     CheckoutButtonSetting, ProductDetailSetting, ProductCardSetting, CustomHtmlTab, TabImageGallery, RelatedBlogsTab, TabImageCompare,
     TabSettingEventCountDown, TabSettingCTABanner, TestimonialTab, TextAndImageTab, RecipeTab, TabSettingCTAButton, FaqTab, TabProductDynamic,
     LeftTableOfContentTab, GoogleMapTab, TabTextProduct; rendered via pages/Blog/layouts/LayoutContainer.jsx:57) and FaqTab.jsx:216,315.
     Prefer fixing at the source: make `isLimitAdvancedFeatures` (PricingModal.jsx:34) false when granted, instead of editing 20 files.
   - `assets` "Saved components / assets & element defaults" — AssetsTab.js:45,61, LeftElementsTab.jsx:26, LayoutSettingsRight.jsx:183,206-208,
     ElementSettingCard.js:31-44, AssetItem.js:136 (the legacy-pro 10 cap too).
   - `aiTranslate` "AI translate" — AutoTranslateBtn.js:38-40,62,97,100,113.
   - `aiWriter` "AI writer, AI SEO title/description, AI tags, AI assistant" legacyFlag `isUnLockLimitAI` — AiWriterContainer.jsx:32,71-73,95,102,
     SEOSetting.jsx:181-264, AiGenerateTagsButton.jsx:60, AIAssistantModal.jsx:93.
   - `sidebarAds` "Sidebar ads" — SidebarAds.jsx:150-426, AdsOption.jsx:150-197.
   - `videoToBlog` "Video to blog (unlimited)" legacyFlag `unLimitToolYoutube` — SettingGenAiYouTube.jsx:105,177-182,306,314,319-321.
   - `seoAnalysis` "SEO analysis (unlimited)" legacyFlag `isUnlimitedAnalytics` — NavigationContainer.jsx:70-74,227, SeoOverview/index.js:243-316,
     components/HeadingSection.jsx:70-79.
   - `authors` "Authors (unlimited)" — pages/Author/Author.jsx:227,232-233.
9. One predicate, shared by BE and FE: `hasFeature(shop, key)` in grantedFeatures.js = grant OR legacyFlag. Sites read
   `originalPredicate || hasFeature(shop, key)`. FE: expose it through PricingModalContext (e.g. `hasFeature(key)`) so components that already
   use the context need no new redux wiring; components reading redux shop call the helper directly.
10. Out of scope: AI token quota (credits, has `set-token`), pricing tables/upsell banners/BFCM promos/growth-hack CTAs (useGhSurface), dead
   gates (LeftPostTab publishBlog `&& false`, ModalImport commented, ManageTable export label, autosave `|| true`), plain behaviour toggles
   (isCustomizeCss, isTemplateAI, isRemoveBranding, structured-data flags). Do not reconcile the disagreeing paid-plan predicates.
11. DevZone UI stays the generic checkbox list from GRANTABLE_FEATURES; add a "Grant all" / "Clear all" pair. Sanitizer unchanged.
12. Shop `grantedFeatures` must reach the storefront proxy path for validatePlan — check what shop object validatePlan reads.

- 2026-10-14: phase 2 done (Codex, harness). Review OK, eslint-forced unused-import removals accepted. jest 155/155 suites (13 base-failing excluded), eslint clean, vite build OK. Pushed ff to MR !923. Playwright on tuannv-seo-3 (staging, plan temporarily free): Grant all → 11 keys saved, AI Summary unlocked (toggle enabled, no Pro notice), MCP canConnect true; Clear all → AI Summary locked again. Plan restored to advanced.
- 2026-10-14: full Playwright matrix on tuannv-seo-3 (staging, plan free, all legacy flags off), dedicated Chrome via playwright-core + saved Shopify storage state. Baseline: all 11 locked. Grant one key at a time: each key unlocks only its own feature, the other 10 stay locked; revoke → locked again. Notes: advancedElements grant → 0 half-opacity elements (24 at baseline); seoAnalysis stays open after revoke for an article already analysed while granted (appended to analyticsBlogs, master behaviour, not a grant leak; resetting analyticsBlogs → locked); aiTranslate tested with English injected as non-primary (store publishes no second locale): label "AI translate Attention Pro" + no modal → with grant, options modal; videoToBlog (isYoutubeSlotActive 5): "Generate blog post (0 uses left)" disabled → with grant enabled, no counter. Shop restored (advanced, flags on, analysisBlogNumber removed), 4 seeded authors + MCP token pw-grant-test deleted.
