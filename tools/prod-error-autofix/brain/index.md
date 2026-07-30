# Incident index

One line per incident, newest first. This file is loaded on **every** job, so it stays one line each —
the full record lives in `incidents/<fp>.md` and is loaded only when the fingerprint matches or is a
near miss.

Format: `<fp> · <date> · <app> · <service> · <root cause> · <MR> · <verdict>`

<!-- LEARN appends below this line -->
- `1ph12wf` · 2026-07-30 · BLOG · api · GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file l · — · inconclusive
- `1xqxz29` · 2026-07-30 · BLOG · apiv2 · The fire-and-forget analytics call `void logCreateBlogByGenAIEvent(shop)` in langGraphController.generate crea · — · inconclusive
