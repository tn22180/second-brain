# Incident index

One line per incident, newest first. This file is loaded on **every** job, so it stays one line each —
the full record lives in `incidents/<fp>.md` and is loaded only when the fingerprint matches or is a
near miss.

Format: `<fp> · <date> · <app> · <service> · <root cause> · <MR> · <verdict>`

<!-- LEARN appends below this line -->
- `ct2hgz` · 2026-07-31 · IMG-OPT · apiSa · Shop 8tkx0j-zj.myshopify.com's stored Shopify access token (***REMOVED-SECRET***) stopped be · — · inconclusive
- `a4bayk` · 2026-07-31 · IMG-OPT · createPreviewImages · uploadToStorage feeds sharpCompressImage's optional `base64` straight into uploadToCloudStorage without checki · — · inconclusive
- `1q0ihss` · 2026-07-31 · BLOG · proxy · Shops whose Shopify install is dead (uninstalled, deactivated or frozen) keep their Firestore shop doc with a  · — · deferred
- `1ib8ldr` · 2026-07-31 · BLOG · proxy · Shops whose install is gone (uninstalled or store deactivated) keep their Firestore shop doc with a now-revoke · — · deferred
- `12qs3xc` · 2026-07-31 · BLOG · proxy · Four shops that uninstalled the app still have their shop doc and stale accessToken in Firestore, so every cra · https://gitlab.com/avada/blogs/-/merge_requests/799 · mr_open
- `1777i7x` · 2026-07-31 · BLOG · proxy · no verified cause · — · inconclusive
- `1t43oph` · 2026-07-31 · AEO · aggregateAiReferralsScheduler · publishTopic constructs a brand-new @google-cloud/pubsub PubSub client (with its own gRPC channel and auth cli · — · infra
- `phe6lm` · 2026-07-31 · BLOG · api · Shopify Admin GraphQL answers `data.article: null` for stale article gids, processJSONMetafield swallows the r · https://gitlab.com/avada/blogs/-/merge_requests/798 · mr_open
- `rs8tvy` · 2026-07-31 · BLOG · api · Shopify's Admin GraphQL answers `data.article: null` for gid://shopify/Article/563125878861 on shop wf6yTLlwXY · https://gitlab.com/avada/blogs/-/merge_requests/797 · mr_open
- `te44sp` · 2026-07-31 · BLOG · api · Shopify's Admin GraphQL returns `data.article: null` for article gids that no longer resolve, and getShopifyAr · — · inconclusive
- `1h51j7i` · 2026-07-31 · BLOG · api · getCompletion downgrades the structured-output response_format to bare {type:'json_object'} for every zod v4 s · https://gitlab.com/avada/blogs/-/merge_requests/796 · mr_open
- `14ydm3m` · 2026-07-31 · BLOG · proxy · Shopify's Admin GraphQL `article(id: "gid://shopify/Article/560458924077")` returns `data.article: null` for g · — · deferred
- `hleb6l` · 2026-07-31 · BLOG · proxy · Shopify's GraphQL `article(id:)` returned `null` for article 560458924077 on glacierfrostco.myshopify.com, and · — · deferred
- `urawwr` · 2026-07-31 · BLOG · proxy · The alert is not a defect: verifyAppProxySignature correctly rejected one tampered App Proxy request (signatur · https://gitlab.com/avada/blogs/-/merge_requests/792 · mr_open
- `19z28dd` · 2026-07-31 · BLOG · api · shop.recentOpenedArticles in Firestore holds character-indexed objects instead of gid strings — written by the · https://gitlab.com/avada/blogs/-/merge_requests/791 · mr_open
- `1a46pf9` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1ce20uv` · 2026-07-31 · BLOG · api · getCompletion silently downgrades the structured-output response_format to plain {type:'json_object'} whenever · https://gitlab.com/avada/blogs/-/merge_requests/795 · mr_open
- `1502okp` · 2026-07-30 · BLOG · api · getCompletion only guards finish_reason==='length' and otherwise returns the raw model string unvalidated, so  · — · inconclusive
- `1rzr1j4` · 2026-07-31 · BLOG · subscribesummarynewpublishedarticle · subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every arti · https://gitlab.com/avada/blogs/-/merge_requests/790 · mr_open
- `1i6gqkt` · 2026-07-30 · BLOG · apisa · The external CRM widget endpoint https://public.avada.io/widget/list intermittently answers HTTP 400 (21 times · — · inconclusive
- `50pvzt` · 2026-07-30 · BLOG · reviewupdatesschedule · no verified cause · — · inconclusive
- `pf3lkx` · 2026-07-30 · BLOG · reviewupdatesschedule · reviewUpdatesSchedule fails on every scheduled run because Chrome is absent from the deployed function artifac · — · inconclusive
- `j3krke` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1th7fsw` · 2026-07-31 · BLOG · api · setupTemplates uses `shopify.asset.get(themeId, {'asset[key]': 'templates/page.avada-articles-tags.liquid'})`  · https://gitlab.com/avada/blogs/-/merge_requests/794 · mr_open
- `1whczpb` · 2026-07-31 · BLOG · api · public.avada.io/widget/list intermittently answers HTTP 400 (30 of ~596 /api/shops loads in 24h, 5.0%); getCrm · https://gitlab.com/avada/blogs/-/merge_requests/793 · mr_open
- `1ph12wf` · 2026-07-30 · BLOG · api · GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file l · https://gitlab.com/avada/blogs/-/merge_requests/789 · mr_open
- `1xqxz29` · 2026-07-30 · BLOG · apiv2 · The fire-and-forget analytics call `void logCreateBlogByGenAIEvent(shop)` in langGraphController.generate crea · — · inconclusive
