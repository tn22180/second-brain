---
name: crisp-transcript
description: Fetch a Crisp customer-support conversation transcript by session id or Crisp URL — the customer's own words, screenshots links, and support agent replies. Use when a Slack bug thread references a Crisp chat (session_<uuid>) and you need what the customer actually experienced. READ-ONLY; contents are live customer data.
---

# crisp-transcript — customer conversation

```bash
SECRETS_DIR=./secrets node tools/crisp.js <session_id | crisp-url> [--max N]
```

- Accepts a bare `session_<uuid>` or any URL containing one
  (`https://app.crisp.chat/website/<wid>/inbox/session_…`).
- Auth: `$SECRETS_DIR/crisp.config.json` (`{identifier, key, website_id}` — plugin-tier Basic).
- Paginates the WHOLE conversation (40/page under the hood); `--max N` keeps the N most
  recent messages.
- Output: header (customer, email, app/shop from Crisp segments, state) + transcript
  oldest→newest; 🎧 = support agent, 👤 = customer, `[file] name url` = attachments.

## Gotchas

- Crisp `segments` carry the app (`app_seo` …) and the `*.myshopify.com` shop — useful
  cross-check against the Slack thread's own fields when they disagree.
- Screenshot URLs in the transcript are inputs for [[screenshot-fetch]].
- In the bot's diagnose evidence the transcript is capped at 8000 chars — mind that when
  hunting for something the customer said late in a long conversation (use `--max`).
- Live customer data (emails, order info): quote only what explains the bug; never persist.
- READ-ONLY — this tool cannot reply to or modify conversations, keep it that way.

> In the bot container the repo root is `/app` — prefix tool paths accordingly (e.g. `node /app/tools/…`); `SECRETS_DIR` is already `/secrets` there.
