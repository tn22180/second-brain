# second-brain

Personal knowledge + backup harness for Tuan (Avada). One repo aggregates skills,
memory, daily learnings, and a project index; a daily job self-summarizes the day's
work and pushes to git.

Remote: `git@github.com:tn22180/second-brain.git`

## Layout

```
harness/
  brain.py          entrypoint CLI: sync | learn | mirror | push | status
  config.yml        paths, repo list, source toggles, schedule
  sources/          per-source daily collectors
    sessions.py     Claude Code session logs (today)
    gitlog.py       git commits across Avada repos (today)
    daily.py        daily-manager open-loops.yml + daily.html
    inbox.py        manual jots from daily/inbox.md
skills/             mirror (copy) of ~/.claude/skills — backup
memory/             mirror (copy) of the memory dir — backup
daily/
  YYYY-MM-DD.md     generated daily learning note
  inbox.md          you jot here; brain files it. Also holds memory-fact candidates.
projects/
  index.md          repo + Firebase project pointer table
launchd/
  com.tn22180.secondbrain.plist   daily @ 20:00 local -> brain.py sync
```

## Usage

```
python3 harness/brain.py status    # show config + last run
python3 harness/brain.py mirror     # rsync skills + memory into repo
python3 harness/brain.py learn      # collect today's raw signal (stdout)
python3 harness/brain.py sync       # mirror -> learn -> summarize -> commit -> push
```

## Daily flow

`launchd` runs `brain.py sync` at 20:00 local:

1. **mirror** — rsync `~/.claude/skills` + memory dir into `skills/` `memory/` (copies).
2. **learn** — each source module collects today's raw signal.
3. **summarize** — pipe signal to `claude -p` (headless) -> `daily/YYYY-MM-DD.md`.
   Durable facts become candidates in `daily/inbox.md` (never auto-written to memory).
4. **commit + push** to the remote.
