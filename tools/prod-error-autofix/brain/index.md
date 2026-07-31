# Incident index

One line per incident, newest first. This file is loaded on **every** job, so it stays one line each —
the full record lives in `incidents/<fp>.md` and is loaded only when the fingerprint matches or is a
near miss.

Format: `<fp> · <date> · <app> · <service> · <root cause> · <MR> · <verdict>`

<!-- LEARN appends below this line -->
- `1a46pf9` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1ce20uv` · 2026-07-30 · BLOG · api · getCompletion's truncation guard only retries when OpenRouter reports finish_reason === 'length'; the gpt-4.1  · — · inconclusive
- `1502okp` · 2026-07-30 · BLOG · api · getCompletion only guards finish_reason==='length' and otherwise returns the raw model string unvalidated, so  · — · inconclusive
- `1rzr1j4` · 2026-07-30 · BLOG · subscribesummarynewpublishedarticle · subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every arti · — · inconclusive
- `1i6gqkt` · 2026-07-30 · BLOG · apisa · The external CRM widget endpoint https://public.avada.io/widget/list intermittently answers HTTP 400 (21 times · — · inconclusive
- `50pvzt` · 2026-07-30 · BLOG · reviewupdatesschedule · no verified cause · — · inconclusive
- `pf3lkx` · 2026-07-30 · BLOG · reviewupdatesschedule · reviewUpdatesSchedule fails on every scheduled run because Chrome is absent from the deployed function artifac · — · inconclusive
- `j3krke` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1th7fsw` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1whczpb` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive
- `1ph12wf` · 2026-07-30 · BLOG · api · GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file l · — · inconclusive
- `1xqxz29` · 2026-07-30 · BLOG · apiv2 · The fire-and-forget analytics call `void logCreateBlogByGenAIEvent(shop)` in langGraphController.generate crea · — · inconclusive
