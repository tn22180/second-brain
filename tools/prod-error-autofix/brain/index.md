# Incident index

One line per incident, newest first. This file is loaded on **every** job, so it stays one line each —
the full record lives in `incidents/<fp>.md` and is loaded only when the fingerprint matches or is a
near miss.

Format: `<fp> · <date> · <app> · <service> · <root cause> · <MR> · <verdict>`

<!-- LEARN appends below this line -->
- `hleb6l` · 2026-07-31 · BLOG · proxy · Shopify's GraphQL `article(id:)` returned `null` for article 560458924077 on glacierfrostco.myshopify.com, and · — · deferred
- `urawwr` · 2026-07-31 · BLOG · proxy · The alert is not a defect: verifyAppProxySignature correctly rejected one tampered App Proxy request (signatur · https://gitlab.com/avada/blogs/-/merge_requests/792 · mr_open
- `19z28dd` · 2026-07-31 · BLOG · api · shop.recentOpenedArticles in Firestore holds character-indexed objects instead of gid strings — written by the · https://gitlab.com/avada/blogs/-/merge_requests/791 · mr_open
- `1a46pf9` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1ce20uv` · 2026-07-30 · BLOG · api · getCompletion's truncation guard only retries when OpenRouter reports finish_reason === 'length'; the gpt-4.1  · — · inconclusive
- `1502okp` · 2026-07-30 · BLOG · api · getCompletion only guards finish_reason==='length' and otherwise returns the raw model string unvalidated, so  · — · inconclusive
- `1rzr1j4` · 2026-07-31 · BLOG · subscribesummarynewpublishedarticle · subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every arti · https://gitlab.com/avada/blogs/-/merge_requests/790 · mr_open
- `1i6gqkt` · 2026-07-30 · BLOG · apisa · The external CRM widget endpoint https://public.avada.io/widget/list intermittently answers HTTP 400 (21 times · — · inconclusive
- `50pvzt` · 2026-07-30 · BLOG · reviewupdatesschedule · no verified cause · — · inconclusive
- `pf3lkx` · 2026-07-30 · BLOG · reviewupdatesschedule · reviewUpdatesSchedule fails on every scheduled run because Chrome is absent from the deployed function artifac · — · inconclusive
- `j3krke` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1th7fsw` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1whczpb` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1ph12wf` · 2026-07-30 · BLOG · api · GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file l · — · inconclusive
- `1xqxz29` · 2026-07-30 · BLOG · apiv2 · The fire-and-forget analytics call `void logCreateBlogByGenAIEvent(shop)` in langGraphController.generate crea · — · inconclusive
