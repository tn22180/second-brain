#!/usr/bin/env bash
# SubagentStart: per-session spawn budget — a backstop against runaway subagent fan-out.
# Caps TOTAL subagents per session (width, not just depth — "23 agents at depth 1 is still depth 1").
# exit 2 = blocking error (stderr is fed back to the model). Tune MAX below.

MAX=40

input=$(cat 2>/dev/null)
sid=$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)
[ -n "$sid" ] || sid="default"

dir="${TMPDIR:-/tmp}/claude-spawn-guard"
mkdir -p "$dir" 2>/dev/null
find "$dir" -type f -mtime +1 -delete 2>/dev/null   # drop stale session counters
f="$dir/$(printf '%s' "$sid" | tr -c 'A-Za-z0-9_.-' '_')"

count=$(cat "$f" 2>/dev/null || echo 0)
case "$count" in ''|*[!0-9]*) count=0 ;; esac
count=$((count + 1))

# atomic write: tmp then mv, so concurrent spawns don't corrupt the counter
tmp="$f.$$.$RANDOM.tmp"
printf '%s' "$count" > "$tmp" 2>/dev/null && mv -f "$tmp" "$f" 2>/dev/null

if [ "$count" -gt "$MAX" ]; then
  echo "BLOCKED: spawn budget exceeded ($count > $MAX subagents this session). Likely runaway fan-out — consolidate the work, or raise MAX in .claude/hooks/recursion-guard.sh." >&2
  exit 2
fi
exit 0
