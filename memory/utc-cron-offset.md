---
name: utc-cron-offset
description: "Any daily job reporting \"yesterday UTC\" must run after 00:00 UTC (07:00 Saigon), or it silently reports data from two local days ago"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

Tuan's machine is UTC+7 (Asia/Saigon). Firestore `creditHistories` doc ids are UTC days, so the credit scripts all compute `d_day = datetime.now(timezone.utc).date() - timedelta(days=1)` — the last *complete* UTC day. That expression is correct. What breaks is running it at the wrong hour.

The `com.avada.billing-report` LaunchAgent used to fire at 06:00 local, which is **23:00 UTC the previous day** — one hour before the UTC date rolls over. At that moment the last complete UTC day is two calendar days back locally, so `daily.html` and the daily Telegram credit message both reported stale numbers while labelling them with the correct (older) date. Nothing looked wrong. Found 2026-07-10: the page showed 2026-07-08 while BigQuery already held a complete 2026-07-09 (30,355 credits, 76 shops).

Moved to **08:00 local = 01:00 UTC**, which leaves an hour of margin for the firestore-bigquery-export extension to settle after midnight UTC. 07:00 local (00:00 UTC) is the true minimum and has no margin. Verify what launchd actually loaded, not just the plist on disk:

```
launchctl print gui/$(id -u)/com.avada.billing-report | grep -A4 calendarinterval
```

Editing the plist does not change the loaded job — `launchctl bootout gui/$UID/<label>` then `bootstrap gui/$UID <plist>`.

No code change can fix this: at 23:00 UTC the data for that UTC day does not exist yet. Any new daily job that reports "yesterday UTC" from a UTC-keyed source inherits the same trap. Related: [[daily-manager-page]], [[credit-report-bigquery-cost]], [[credit-not-tokens]].
