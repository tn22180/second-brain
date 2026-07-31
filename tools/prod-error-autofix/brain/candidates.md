# Candidates

Facts the LEARN stage generalised from one job but that are **not** promoted into `apps/*.md` or
`patterns.md` yet. A candidate needs to recur across **two distinct jobs**, or be promoted by hand
with `autofix brain promote <n>`, before it becomes a fact the agent is told.

Same discipline as `brain.py`: a candidate is never auto-written into the knowledge the agent trusts.
One job's inference is not a fact about an app.

Format: `<n> · <app> · <seen count> · <fingerprints> · <claim>`

<!-- LEARN appends below this line -->
- 1 · BLOG · seen 1 · [1rzr1j4] · subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every article publish by a FREE-plan shop emits severity=ERROR and pages Slack even though nothing failed.
- 2 · BLOG · seen 1 · [19z28dd] · shop.recentOpenedArticles in Firestore holds character-indexed objects instead of gid strings — written by the pre-2026-07-28 formatDateFields, which spread every array item through itself — and articleController.list passes those objects straight into getShopifyArticleById, where `id.includes('gid')` throws TypeError.
- 3 · BLOG · seen 1 · [urawwr] · The alert is not a defect: verifyAppProxySignature correctly rejected one tampered App Proxy request (signature last byte mutated d9→e0 vs a request that succeeded 0.79s earlier with identical query params), but that legitimate 403 rejection path is logged with logger.error, which emits severity=ERROR and trips the prod-error-alerts sink.
- 4 · BLOG · seen 1 · [1whczpb] · public.avada.io/widget/list intermittently answers HTTP 400 (30 of ~596 /api/shops loads in 24h, 5.0%); getCrmWidgets already swallows it and returns an empty widget set, so no request fails — but it logs the swallowed failure at logger.error, which the severity>=ERROR sink turns into a Slack page, and it logs only e.message so the upstream 400 body is discarded and the CRM-side cause is undiagnosable.
- 5 · BLOG · seen 1 · [1th7fsw] · setupTemplates uses `shopify.asset.get(themeId, {'asset[key]': 'templates/page.avada-articles-tags.liquid'})` as an existence probe, and Shopify's Admin REST answers HTTP 404 when the asset is absent — the normal case for a shop that does not yet have the template — but the .catch logs that expected miss via logger.error, which emits severity ERROR and pages the prod-error-alerts sink.
