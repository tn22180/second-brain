# Incident index

One line per incident, newest first. This file is loaded on **every** job, so it stays one line each —
the full record lives in `incidents/<fp>.md` and is loaded only when the fingerprint matches or is a
near miss.

Format: `<fp> · <date> · <app> · <service> · <root cause> · <MR> · <verdict>`

<!-- LEARN appends below this line -->
- `n7z34s` · 2026-07-31 · BLOG · reviewupdatesschedule · no verified cause · — · inconclusive
- `19t4boc` · 2026-07-31 · SEO · apigen2 · no verified cause · — · inconclusive
- `1npmocs` · 2026-07-31 · BLOG · api · genIdeas requests a plain-text completion (getCompletion default format='text', no zodSchema), so nothing cons · — · deferred
- `1m8run2` · 2026-07-31 · BLOG · apisa · Duplicate of fingerprint 3349gs (MR 802 already open, unmerged): shop fKUMrHXwtJca3KNWMU6X's recentOpenedArtic · https://gitlab.com/avada/blogs/-/merge_requests/802 · mr_open
- `1sob2ko` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `lkawju` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `zd4n21` · 2026-07-31 · SEO · reconcilependingfinalizegen2 · reconcilePendingFinalizeGen2 is declared memory: '512MiB' while the shared src/ import graph every gen2 contai · — · infra
- `1lkslmo` · 2026-07-31 · SEO · reconcilependingfinalizegen2 · reconcilePendingFinalizeGen2 is the only Cloud Function in the repo declared at memory: '512MiB', and loading  · — · infra
- `1xgc0td` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `16ynda3` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `htf1kk` · 2026-07-31 · BLOG · apiv2 · OpenRouter delivers a 429 'temporarily rate-limited upstream' error frame inside the already-200 SSE stream fo · — · deferred
- `1gzakue` · 2026-07-31 · BLOG · api · The shared axios client in packages/functions/src/helpers/api.js is created with no `timeout`, so every Shopif · — · deferred
- `q012sa` · 2026-07-31 · BLOG · api · seoProxyApi's catch decides severity from `e.response?.status`, which is undefined for a socket-level ECONNRES · https://gitlab.com/avada/blogs/-/merge_requests/803 · mr_open
- `ixc1eq` · 2026-07-31 · BLOG · api · Duplicate of fingerprint 1w64e0z (MR 810 already open, unmerged): shopifyRetryGraphQL decides retryability wit · https://gitlab.com/avada/blogs/-/merge_requests/810 · mr_open
- `1w64e0z` · 2026-07-31 · BLOG · api · shopifyRetryGraphQL classifies a retryable failure with `e.statusCode`, a field axios 0.27 never sets, so the  · https://gitlab.com/avada/blogs/-/merge_requests/810 · mr_open
- `1xisexs` · 2026-07-31 · BLOG · api · OpenRouter's provider for google/gemini-2.5-flash-lite aborts generation mid-output (finish_reason=error) on r · https://gitlab.com/avada/blogs/-/merge_requests/809 · mr_open
- `1rbsbcy` · 2026-07-31 · BLOG · apiv2 · The idle ioredis socket from the apiv2 instance to Memorystore 10.68.191.235 was reset once (ECONNRESET) while · https://gitlab.com/avada/blogs/-/merge_requests/808 · mr_open
- `1wkwfie` · 2026-07-31 · BLOG · api · The pooled ioredis socket to Memorystore 10.68.191.235 was reset (ECONNRESET) three times in 24h; ioredis reco · https://gitlab.com/avada/blogs/-/merge_requests/808 · mr_open
- `2dg7th` · 2026-07-31 · BLOG · api · The Firestore Commit RPC behind `collection.add()` in `createArticle` hit its 60s per-attempt deadline on one  · — · infra
- `se28ls` · 2026-07-31 · BLOG · api · Duplicate of fingerprint 1hjewuf: the OpenRouter completion behind /api/gen-ai-suggested/:type comes back as a · https://gitlab.com/avada/blogs/-/merge_requests/804 · mr_open
- `ds0z0c` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `4khzsv` · 2026-07-31 · BLOG · api · getRedirectTracer races trace-redirect against delay(3000), and delay resolves undefined — so every /api/recen · https://gitlab.com/avada/blogs/-/merge_requests/805 · mr_open
- `1hjewuf` · 2026-07-31 · BLOG · api · OpenRouter's provider for google/gemini-2.5-flash-lite aborts generation mid-output with finish_reason='error' · — · inconclusive
- `1j7e5xr` · 2026-07-31 · BLOG · api · no verified cause · — · inconclusive
- `15ca22n` · 2026-07-31 · BLOG · api · The alert is not a user-facing failure: seoProxyApi swallows every upstream error and returns undefined, but l · https://gitlab.com/avada/blogs/-/merge_requests/803 · mr_open
- `3349gs` · 2026-07-31 · BLOG · api · shop.recentOpenedArticles keeps gids of articles that no longer resolve in Shopify, and getShopifyArticleById  · https://gitlab.com/avada/blogs/-/merge_requests/802 · mr_open
- `1oupj7q` · 2026-07-31 · BLOG · api · POST /api/audit-agent/fix-issue returns 500 whenever the OpenRouter completion behind parseJsonCompletion come · https://gitlab.com/avada/blogs/-/merge_requests/801 · mr_open
- `2z6u3r` · 2026-07-31 · BLOG · api · parseJsonCompletion calls bare JSON.parse on the OpenRouter completion, and google/gemini-2.5-flash emitted an · https://gitlab.com/avada/blogs/-/merge_requests/800 · mr_open
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
- `1502okp` · 2026-07-31 · BLOG · api · genSuggested JSON.parses the raw OpenRouter completion with no repair, no re-issue and no parse guard, so ever · — · inconclusive
- `1rzr1j4` · 2026-07-31 · BLOG · subscribesummarynewpublishedarticle · subscribeHandleSummaryNewPublishedArticle logs its normal FREE-plan skip branch at logger.error, so every arti · https://gitlab.com/avada/blogs/-/merge_requests/790 · mr_open
- `1i6gqkt` · 2026-07-30 · BLOG · apisa · The external CRM widget endpoint https://public.avada.io/widget/list intermittently answers HTTP 400 (21 times · — · inconclusive
- `50pvzt` · 2026-07-30 · BLOG · reviewupdatesschedule · no verified cause · — · inconclusive
- `pf3lkx` · 2026-07-31 · BLOG · reviewupdatesschedule · The Shopify App Store review-card markup no longer matches `.tw-order-2.tw-text-fg-tertiary > div:nth-child(1) · — · deferred
- `j3krke` · 2026-07-31 · BLOG · api · genIdeas asks OpenRouter for a free-text completion (getCompletion default format='text', no zodSchema) and th · — · needs_human
- `1th7fsw` · 2026-07-31 · BLOG · api · setupTemplates uses `shopify.asset.get(themeId, {'asset[key]': 'templates/page.avada-articles-tags.liquid'})`  · https://gitlab.com/avada/blogs/-/merge_requests/794 · mr_open
- `1whczpb` · 2026-07-31 · BLOG · api · public.avada.io/widget/list intermittently answers HTTP 400 (30 of ~596 /api/shops loads in 24h, 5.0%); getCrm · https://gitlab.com/avada/blogs/-/merge_requests/793 · mr_open
- `1ph12wf` · 2026-07-30 · BLOG · api · GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file l · https://gitlab.com/avada/blogs/-/merge_requests/789 · mr_open
- `1xqxz29` · 2026-07-31 · BLOG · apiv2 · no verified cause · — · inconclusive
