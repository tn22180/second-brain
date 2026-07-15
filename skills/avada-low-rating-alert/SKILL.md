---
name: avada-low-rating-alert
description: Use when the user asks to apply, port, or install the one-star / low-rating review login alert (Crisp + App Store reviews → Slack CS alert) into an Avada Shopify app repo (BLOG, APC, AEO, image-optimizer...). Triggers: "apply one-star alert", "port low-rating alert", "cài one-star alert", "áp dụng alert 1 sao vào repo này", "thêm cảnh báo khách 1 sao".
---

# Apply Low-Rating Login Alert to an Avada App

## Overview

Ports the feature built in `~/Documents/SEO-BLOG/seo` (MR avada/seo!1862): a daily cron pulls Crisp `1-star`+`2-star` segment conversations (90d, filtered by this app's segment) and App Store 1/2-star reviews (store name → domain via shops collection), saves `crispSegments/oneStarShops` `[{url, sessionId, segment, source}]`; on login, `checkOneStarShopLogin` Slack-alerts CS with shop name, plan, segment, source, Crisp link, mention.

**Source of truth = the SEO repo files. Always copy from there, never rewrite from memory.**

## Step 1 — Dependency audit of the TARGET repo (do this FIRST)

The naive port fails on missing dependencies. Grep the target repo for each; copy from SEO if absent:

| Needed | Check in target | If missing, copy from seo `packages/functions/src/` |
|---|---|---|
| Crisp client | `services/crisp/initCrisp.js`, `services/config/crisp.js`, `services/crisp/getData.js`, `services/crisp/api/**` | same paths (+ `crisp-api` in package.json) |
| `getDaysAgo` | `helpers/getYesterday.js` | add the function (4 lines, same file or equivalent) |
| `getShopsByField(field, value, limit=2)` | `repositories/shopRepository.js` | add the function (returns array; used to detect ambiguous store names) |
| axios | package.json | add dep |
| `@functions/` alias + `onSchedule` cron exports file | how existing crons register | mirror that file's style |

## Step 2 — Copy 6 feature files verbatim

From seo `packages/functions/src/` → same paths in target:
`config/lowRatingAlert.js`, `config/slack.js`, `services/slack/slackService.js`, `services/appstore/getOneStarReviewStores.js`, `repositories/crispSegmentRepository.js`, `handlers/cron/syncCrispOneStarShops.js`

## Step 3 — Edit ONLY `config/lowRatingAlert.js` (4 values)

- `appName` — alert tag, e.g. 'Avada Blog'
- `appStoreSlug` — VERIFY: `curl -sI "https://apps.shopify.com/<slug>/reviews" | head -1` must be 200, never guess
- `appSegment` — VERIFY against live Crisp data: fetch segment `1-star` conversations, inspect `meta.segments` for this app's tag (e.g. `app_blog`). Crisp website is SHARED by all Avada apps — wrong/missing segment = alerts for other apps' customers
- `mention` — Slack member ID `<@U...>` (find via `users.list` with bot token, or Slack profile → Copy member ID)
- `excludeSegment` — Crisp tag CS adds to a conversation to opt the shop OUT of the alert (default `cs-skip-alert`, shared across apps). Cron drops tagged convs from the Crisp list AND filters App Store matches against their domains. Caveat: opt-out only works for shops that HAVE a Crisp conversation (App Store-only shops have nothing to tag). Takes effect next daily sync (≤24h), not instant.

## Step 4 — Wire in

- Splice `checkOneStarShopLogin(shop)` from seo `services/loginService.js` into the target's after-login service (find where post-login tasks run; must never throw — keep its internal try/catch). Follow the target file's existing patterns.
- **Embed-only gate**: alert must fire ONLY for embedded-app logins — standalone OAuth logins are usually CS/internal. In seo this is `Boolean(ctx.state.shopify.sessionToken)` (only embed logins carry sessionToken). Port the gate, verify the same field distinguishes the paths in the target repo.
- Register cron next to existing ones: `onSchedule({timeoutSeconds: 540, memory: '256MiB', schedule: '30 0 * * *'}, syncCrispOneStarShops)`.
- Env (local `.env` + staging/prod function config, never committed): `SLACK_BOT_TOKEN` (scope `chat:write`), `SLACK_CS_CHANNEL_ID`. **Bot must be invited to the channel** — `channel_not_found` on a valid `C…` id means not invited.

## Step 5 — Verify (all of these, evidence before claiming done)

1. Build passes (`yarn development` or target's build).
2. Cron locally: `APP_ENV=production` override + dev serviceAccount; run compiled handler; check Firestore doc `crispSegments/oneStarShops` — entries are **bare lowercase domains** (code normalizes Crisp's `https://` URLs), crisp entries have sessionId, counts logged (`crisp: N, appstore: M, unmatched, ambiguous`).
3. Slack send test message → appears in channel.
4. Simulated login: inject test entry `{url: <dev store domain>, sessionId: '', segment: '1-star', source: 'appstore'}` into the doc, call compiled afterLogin with that domain, expect alert, then remove the entry.

## Common mistakes

- Guessing the App Store slug or Crisp app segment → silent empty syncs or cross-app alerts. Verify both live.
- Skipping the dependency audit → import errors for `services/config/crisp` etc. at build time, or worse at cold start.
- Forgetting bot invite → `channel_not_found` despite valid channel ID.
- Local cron run hits the dev Firestore: App Store names resolve to ~0 matches there — expected, not a bug; prod resolves against real shops.
