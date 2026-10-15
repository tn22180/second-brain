# SEOOn daily

Python 3.11+, standard library only. Reports Jira activity, GitLab commits and prompt-based AI grades for six SEOOn members to Slack #system-alert (`C0BGRTWUE8Y`), with one detail reply per member.

From this directory:

```sh
python3 team_daily.py collect [--date YYYY-MM-DD]
python3 team_daily.py post [--date YYYY-MM-DD] [--dry-run] [--force]
python3 team_daily.py run [--date YYYY-MM-DD] [--dry-run] [--force]
python3 -m unittest discover -v -p 'test_*.py'
```

Schedule `collect` at **00:10 Asia/Ho_Chi_Minh (+07)** daily, followed by `post` at the desired morning report time; `run` performs both immediately. No scheduler is installed by this tool. Date defaults to yesterday in +07. Atomic cache files live in `~/.cache/team-daily/YYYY-MM-DD.json`. Missing post data is collected immediately and marked “thu thập muộn”. Dry run renders without reading the Slack token or posting; missing data still triggers collection. Posted reports are skipped unless `--force`; partial posts resume from saved message progress. Run only one instance per date at a time.

Sources: Jira FAL (JIRA_TOKEN or jira-create skill env), GitLab avada via authenticated `glab`, prompt-audit using `~/.claude.json`, and grading through authenticated `claude` CLI. Slack exclusively reads `~/Projects/falcon-fix-bot/secrets/slack-bot.token`; a personal token would trigger slack-thread-watch support sessions. Source failures are independent; diagnostics retain only exception types to avoid exposing credentials. Raw prompts are not cached.

Known gaps: audit has a rolling 24h window ending at collection, not historical date filtering. The report records exact bounds; late collection or historical `--date` cannot reconstruct past audit data. dungtt/tranggt may be outside audit scope; prompts cap at 200/person with no pagination. Grades use prompt evidence, not observed tool execution. Jira board is a current snapshot; GitLab attribution uses author email local parts. A crash after Slack accepts a message but before the cache checkpoint may duplicate that message on retry. Concurrent runs are not locked.
