---
name: aeo-llms-txt-override-coverage
description: "AEO app overrides Shopify's auto llms.txt via templates/llms.txt.liquid on main theme (opt-in toggle); 2026-10-01 probe — 82% of live installed shops still serve Shopify's template"
metadata:
  node_type: memory
  type: project
  originSessionId: abea53b9-0765-4c75-aa35-2264a8b7276f
  modified: 2026-10-01T02:45:50.599Z
---

Shopify auto-serves `/llms.txt`, `/llms-full.txt`, `/agents.md` (template "# Agent Instructions — <shop>") on every Liquid store. AEO app (`llm-ai-search-seo`) overrides by upserting `templates/llms.txt.liquid` / `llms-full.txt.liquid` (+ snippet chunks) into the **published theme only** — `const/llmsTxt.js:17-18`, `llmsTxtThemeController.js`. Opt-in per kind (`PUT /llms-txt/:kind/mode {isCustom}`); state = "file exists in theme", nothing in Firestore.

Probe 2026-10-01, 2000 `isActiveInstall` shops (limit hit, more exist): 1193 Shopify template, 261 non-template, 296 "# Store Unavailable" (closed store, Shopify's own response), 130 password, ~120 4xx. Of 1454 live: **82% template**, 88 (6%) carry app signature (`- [title](url): … Price:` from `buildLlmTxt.js:126`), 173 other (edited header / other app / hand-written — not attributable).

Code comment `const/llmsTxt.js:2` "Shopify redirects /llms.txt -> /agents.md" is stale: 0/2000 redirected.

**Why:** feature works technically but default-off + theme-bound → most merchants who installed for llms.txt are not getting it.
**How to apply:** before claiming llms.txt reach, re-run probe (`curl -sL https://<shop>/llms.txt`, grep "Agent Instructions"). Theme switch silently drops the override — check that path before blaming sync. Related [[seo-auto-features-dead]].
