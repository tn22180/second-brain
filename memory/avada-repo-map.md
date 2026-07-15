---
name: avada-repo-map
description: Avada repos live under ~/Documents/SEO-BLOG; repo-to-GCP-project map now lives in ~/.claude/CLAUDE.md
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

All Avada work happens under `~/Documents/SEO-BLOG/` — `seo`, `blogs`, `ai-product-copy`, `llm-ai-search-seo`, `avada-image-optimizer`, `avachat`, plus shared libs. Not a git repo at the parent level; each subdir is its own repo.

The full repo → Firebase/GCP-project → packages table is written into `~/.claude/CLAUDE.md` (global user memory, loads every session). Read that instead of re-deriving from `.firebaserc` files.

Gotcha worth keeping: staging project ids are inconsistent. `seo` staging is `avad-seo-staging` (missing the `a` in "avada") while `blogs` staging is `avada-blog-staging`. Easy to typo into a nonexistent project.

BigQuery billing export and the Firestore export views both live in the `avada-seo` project, even for reports about other apps. Related: [[user-profile]].
