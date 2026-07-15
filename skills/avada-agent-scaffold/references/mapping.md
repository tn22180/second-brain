# Mapping: joy files → generic vs app-specific

Reference for maintaining `avada-agent-scaffold` templates. Classifies what came out of
the `joy` repo so future edits keep the generic/app-specific split clean.

## Generic — ported into templates (Avada-wide, de-joy'd)

### Agents (`templates/claude/agents/`)
`planner`, `code-reviewer`, `debugger`, `tester`, `security-auditor`,
`performance-reviewer`, `backend-implementer`, `frontend-implementer`
(from joy `admin-frontend-implementer`), `shopify-app-tester`.

### Commands (`templates/claude/commands/`)
`plan`, `review`, `refactor`, `test`, `typedoc`, `impact`, `fix`, `debug`, `commit`,
`docs`, `security`, `learn-from-mr`, `lint-mr`, `mr`.

### Skills (`templates/claude/skills/`)
`backend`, `frontend`, `firestore`, `polaris`, `shopify-api`, `scripttag`, `security`,
`api-design`, `cloud-tasks`, `layer-architecture`, `technical-writer`,
`software-architect`, `skill-creator`.

### Rules (`templates/claude/workflows/`)
`development-rules`, `orchestration-protocol`, `primary-workflow`,
`documentation-management`.

### Hooks (`templates/claude/hooks/`)
`auto-lint`, `block-dangerous-bash`, `block-tunnel-url`, `recursion-guard`, `require-docs`.
Dropped `require-translate` (joy had an i18n translate-gate; enable per-app only if needed).

## App-specific — NOT ported (leave as stubs per target app)

- **joy loyalty domain:** `point-assign`, `reissue-order-points`, `public-webhooks`,
  `analytics-v2`, `shopifyql`, `email-template-builder`, `imagine`, `imagine-onboard`,
  `ai-agent-ui`.
- **joy tooling/integrations:** `notion-tasks`, `joy-my-tasks`, `avada-tickets`,
  `prod-troubleshoot`, `billing-monitor`, `deploy-staging`, `creating-images`.
- **AI-framework skills** (only where the app actually uses them): `langchain*`,
  `langgraph*`, `deep-agents-*`, `framework-selection`, `redis-caching`, `redis-debug`,
  `bigquery`, `shopify-bulk-operations`, `shopify-functions`, `theme-extension`,
  `web-components`, `storefront-data`.
- **joy agents:** `data-implementer`, `integrations-implementer`,
  `storefront-widget-implementer`, `theme-extension-implementer`,
  `built-for-shopify-reviewer`, `analytics-ux-evaluator`, `support-triage`,
  `ui-ux-reviewer`, `feature-reviewer`.

> Rule of thumb: if a file encodes a business domain (loyalty, SEO, image-opt), a paid
> integration, or an org tool (Notion/Crisp/tickets), it's app-specific — stub it, don't
> port it. If it encodes Avada engineering practice (layers, Firestore, Shopify API,
> Polaris, security, testing, planning), it's generic.

## SEO app stubs (first target)
`worker-fleet`, `sitemap`, `image-optimization`, `anchor-text`, `url-redirects`,
`speed-score`, `elasticsearch`, `selective-deploy`, `bigquery-billing`.
