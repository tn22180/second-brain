# Projects index

Pointers only — repo code stays in each repo's own git. Workspace root:
`~/Documents/Falcon workspace/`. Source of truth: `~/.claude/CLAUDE.md`.

## Repo → Firebase/GCP project

| Repo | Production | Staging | Packages |
|------|-----------|---------|----------|
| `seo` | `avada-seo` | `avad-seo-staging` (+ `avada-seo-staging-2..8`) | assets, copyright, dashboard, docker, fleet-control, functions, scripttag |
| `blogs` | `avada-blog-app` | `avada-blog-staging` (+ `seoon-blog-staging-2..6`) | assets, avadaseo, editor, functions |
| `ai-product-copy` | `ai-product-copy` | `ai-product-copy-staging` | assets, functions, scripttag |
| `llm-ai-search-seo` (AEO) | `seo-on-aeo` | `seoon-llm-ai-search` | assets, copyright, functions |
| `avada-image-optimizer` | `app-plaza-image-optimizer` | `seoon-image-optimizer-staging` | assets, copyright, functions, scripttag |
| `avachat` | `seo-chat-bot-99cc0` | `avada-seo-staging-8` | admin, chat-ui, functions |
| `avada-apps-cdn` | — | — | (flat) |

Libs (no firebase): `avada-core`, `avada-components`, `avada-editor-js-core`,
`worker-sdk`, `axyseo`, `avada-feature-request`.

Separate: `~/Documents/Falcon-Notification/falcon-notification`.
BigQuery billing export + Firestore export live in `avada-seo`.

## Stack

Shopify app: Polaris v12 frontend (`packages/assets`) + Firebase Functions backend
(`packages/functions`). Firestore primary DB. Pub/Sub for fan-out.

## Skills → when to use

| Need | Skill |
|------|-------|
| GCP cost / per-app spend | `avada-billing-report` |
| AI credit usage | `credit-history-report` |
| 1-star review alert port | `avada-low-rating-alert` |
| Firestore queries/indexes | `firestore` |
| Functions, async, pubsub, cron | `backend` |
| Polaris components | `polaris` |
| Agent scaffold for a repo | `avada-agent-scaffold` |

Full mirror of all skills: `../skills/`. Memory backup: `../memory/`.
