---
name: permission-allowlist-rewrite
description: "On 2026-07-09 the user's permission allowlist was rewritten from one-off exact commands to prefix patterns; node/python3 are broadly allowed by his choice"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

On 2026-07-09 `~/.claude/settings.local.json` was rewritten. The old allowlist held ~30 hyper-specific entries (full BigQuery query strings, exact `node query.js --date 2026-04-20 ...` invocations) captured by clicking "always allow" — none ever matched a second time.

Replaced with prefix patterns: read-only shell, git read + add/commit, `bq:*`, read-only `gcloud`, `node:*`, `python3:*`, `cd:*`. Added a `deny` list for `rm -rf`, force-push, `git reset --hard`, and GCP delete ops. Backup at `settings.local.json.bak-20260709-095923`.

**Why:** he explicitly asked to reduce prompts and step count. `cd:*` alone removes ~450 prompts/history; the exact-string entries were dead weight.

**How to apply:** when he clicks "always allow" on a command with embedded arguments (a query, a date, a path), the entry that gets saved is useless — offer to generalize it to a prefix pattern. Note that `node:*` + `python3:*` make the deny list mostly advisory; he accepted that trade-off knowingly, so don't re-litigate it. Related: [[avada-repo-map]], [[user-profile]].
