---
name: slack-thread-watch
description: Replaced falcon-fix-bot 2026-10-06 — launchd poller opens one Orca worktree + Claude session (/support-handoff) per new support thread; NOT bypass mode.
metadata:
  type: project
---

`second-brain/tools/slack-thread-watch` (bun), launchd `com.tn22180.slack-thread-watch`, every 2 min. Reads top-level posts in #seo-suite-support (G01N5G8D562) + #blog-support (C08928RK00H) with the retired falcon-fix-bot's Slack token (`~/Projects/falcon-fix-bot/secrets/slack-bot.token`). Every new thread → `orca worktree create --repo name:<app>` then `orca terminal create --command 'claude "/support-handoff <permalink>"'` + Telegram DM. No tag needed (Tuan's call 2026-10-06). State/ledger: `~/.cache/slack-thread-watch/state.json`; cap 5 spawns/hour; first run starts from "now", no backlog.

**Why not `--agent claude`:** Orca launches its agents with `--dangerously-skip-permissions`; these sessions start from customer-written text. Plain `claude` runs in his default (auto) mode, risky writes still ask.

**How to apply:** app comes from the CS post's `App:` line (aliases copied from falcon-fix-bot parse.js); another team's app (e.g. Avada Product Feed) is skipped silently. Orca app must be running (`orca status`). Volume measured: ~20 threads/week. Listed in harness/loops.yml. See [[falcon-fix-bot-mac-runtime]], [[personal-loop-health]].

2026-10-06: thêm #system-alert (C0BGRTWUE8Y); session chạy `claude --permission-mode auto` (Tuan chọn auto thay bypass, máy harness chạy không người trông). Test cô lập: SLACK_WATCH_STATE_DIR + SLACK_WATCH_ONLY_CHANNEL.
2026-10-06: team-ops cài thành plugin `falcon@falcon` (marketplace gitlab.com/avada/falcon/team-ops) → watcher gọi `/falcon:support-handoff`; 5 skill copy cũ trong ~/.claude/skills đã gỡ. Token cho session ở ~/.config/slack-thread-watch/session.env (0600, SLACK_TOKEN=xoxp cá nhân + JIRA_TOKEN). `jira-create` upstream đã thành `falcon:jira`; bản cũ giữ dạng thư mục thật ở ~/.claude/skills/jira-create.
2026-10-07: thêm product-feed (git.avada.net/avada/blocko-team/product-feed, clone ở projects/Falcon/product-feed, Orca repo `product-feed`); CS ghi "App: Avada Product Feed".
