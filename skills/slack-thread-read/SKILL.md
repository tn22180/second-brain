---
name: slack-thread-read
description: Read an Avada support Slack thread from its URL — full messages (parent + replies) plus structured fields (app mapped to repo name, shop domain, Crisp session id, issue text). Use whenever given a slack.com/archives link, to check whether a bug is already claimed/resolved in replies, or to hand structured bug context to another step. READ-ONLY — never posts.
---

# slack-thread-read — thread → structured JSON

```bash
SLACK_USER_TOKEN=... SLACK_USER_COOKIE=... \
node tools/get-thread.js "<slack-thread-url>" --json [--replies N]
```
**This CLI is a standalone MANUAL tool** — it still reads via a personal Slack user token
(xoxc, USELESS without its companion `SLACK_USER_COOKIE`). **The bot itself no longer uses it
or any user token** (bot-token-only migration 2026-07-24): at runtime the same thread→JSON
comes from `slack.threadJson(url)` in `src/slack.js` over the **bot token**
(`conversations.replies`), which is what the pipeline/diagnose actually consume. Use this CLI
only for ad-hoc reads from a machine that has your user token; it is not on the bot's path.

Output fields: `app` (repo name via alias mapping), `app_display`, `supported`, `repo`,
`shop_domain`, `crisp_url`, `crisp_session_id`, `issue_text` (trailing `CC:` routing line
stripped), `reply_count`, `messages[{time,author,text}]`, `channel_id`, `thread_ts`,
`permalink`.

## The app mapping (in `tools/lib/parse.js` — exact-then-longest-alias, NEVER naive substring)

| Slack `App:` | → repo |
|---|---|
| SEO Suite / Avada SEO | `seo` |
| SEO On AEO / AEO optimizer | `llm-ai-search-seo` |
| SEO On AI Product Copy | `ai-product-copy` |
| Blog | `blogs` |
| Image Optimizer / Avada Image Optimizer / Plaza Image Optimizer | `image-optimizer` (tracked since 2026-07-23) |
| anything else | `unknown` |

("SEO On AI Product Copy" contains "SEO" — longest-match is mandatory.)

## Gotchas

- A URL copied from a REPLY carries the reply ts in the `/p…` path and the PARENT ts in
  `?thread_ts=` — the parser prefers `thread_ts` (slk needs the parent). Don't "simplify"
  that away.
- Accepts a link to parent or reply, or work from channel_id+ts via the permalink format
  `https://avadaio.slack.com/archives/<channel>/p<ts-no-dot>`.
- Two header formats exist in the channels: human-posted (AEO style) and bot-posted
  (`App plan:`/`Ticket:` lines, bare `<url>`); both covered by tests (`test/parse.test.js`).
- READ-ONLY: only ever `slk thread` under the hood. Never send/react from this tool.
- Replies decide "already resolved/claimed" — read them before acting on the parent.

> In the bot container the repo root is `/app` — prefix tool paths accordingly (e.g. `node /app/tools/…`); `SECRETS_DIR` is already `/secrets` there.
