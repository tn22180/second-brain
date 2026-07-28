# harness/permissions

Keeps the Claude Code permission allowlist honest: derived from what Claude has
actually run across every past session, not from guesses.

Built 2026-07-28 from 753 transcripts / 18,811 Bash tool calls under
`~/.claude/projects/`.

## Layers

Claude Code merges permission rules from four files, later ones layering on top:

| File | Holds |
|---|---|
| `~/.claude/settings.json` | **canonical global allowlist** — file inspection, git read + add/commit, node/npm/yarn/pnpm/npx, gcloud & bq & firebase read-only, glab read, docker read-only, `curl -s`. Plus `ask` (push / deploy / sudo) and `deny` (destructive). |
| `~/.claude/settings.local.json` | scratch. Claude Code appends one-off "always allow" picks here. Kept empty on purpose — fold durable rules up into `settings.json`. |
| `second-brain/.claude/settings.json` | **project layer** — worker-fleet SSH (`ssh`, `sshpass -e/-f`, `gcloud compute ssh`), `redis-cli`, `docker exec/build/compose`, `glab`, repo-local binaries, Avada skills, the read-loop `SessionStart` hook. |
| `second-brain/.claude/settings.local.json` | scratch, same rule as the global one. |

Nothing is duplicated between layers — a rule lives in exactly one file. The
read-loop hook used to be declared in both project files, so it fired twice per
session; it is now only in `settings.json`.

## Three buckets, not two

- **allow** — read-only, or cheap and reversible. No prompt.
- **ask** — always prompt, even under a permissive mode. Everything that leaves
  the machine or touches prod: `git push`, `gh/glab mr create`, `firebase deploy`,
  `npm|yarn|pnpm run deploy`, `gcloud functions|run deploy`, `npm publish`, `sudo`.
  This is where `~/.claude/CLAUDE.md`'s "deploy is manual, never run it unprompted"
  is actually enforced rather than merely written down.
- **deny** — never, no prompt offered: `rm -rf`, `sudo rm`, force-push, `reset --hard`,
  `git clean -fd`, `bq rm`, `gcloud * delete`, `firebase *:delete`, `docker system prune`,
  `shutdown`, `diskutil`.

Precedence is deny > ask > allow, so a broad allow like `Bash(gcloud config:*)`
cannot re-open anything the deny list closes.

## Prefix patterns, never exact commands

`Bash(git log:*)` — not the specific `git log --oneline -20 -- packages/functions`
that happened to be approved once. Exact-command entries pile up, never match the
next invocation, and turn the allowlist into landfill. When Claude Code appends
one to a `.local.json`, generalize it and move it up a layer.

## Deliberately still prompting

Frequent in the transcripts but left out on purpose:

`bash` / `sh` (921 calls — allowing them allows everything), `perl`, `kill` / `pkill`
(project layer allows only `pkill -f`), `chmod`, `mv`, `rsync` (a stray `--delete`
is unrecoverable), `tar`, `nohup`, `crontab`, `launchctl`, `git rebase|merge|pull|
cherry-pick|rm|mv`, `docker push`, `firebase functions:secrets:access` (prints the
secret straight into the transcript).

`sshpass -p` is in the project **deny** list: it puts the password in the process
table and in the transcript. The transcripts contain ~540 of them, along with
`redis-cli -a <password>`. Use `sshpass -f <file>` or `-e` with `SSHPASS` instead.
Those already-recorded credentials should be treated as leaked and rotated.

## Regenerating

```bash
python3 ~/Documents/second-brain/harness/permissions/mine_permissions.py            # uncovered families, count-ranked
python3 .../mine_permissions.py --all --min 5   # everything, incl. what a rule already covers
python3 .../mine_permissions.py --json > report.json
```

The script re-reads all four settings files each run, so its "uncovered" column is
always measured against the live config. It only reads — applying a rule stays a
human decision.

`snapshot-2026-07-28.md` is the state on the day this layer was built; diff a fresh
run against it to see what new tooling has crept in.
