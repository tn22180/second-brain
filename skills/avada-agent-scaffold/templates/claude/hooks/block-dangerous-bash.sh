#!/usr/bin/env bash
# PreToolUse(Bash): DENY clearly destructive commands.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# 1. Catastrophic rm -rf on a root/home target (subdirectories like /tmp/foo are allowed).
if printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[A-Za-z]*[rf][A-Za-z]*[[:space:]]+(-[A-Za-z]+[[:space:]]+)*(/|~|/\*|\$HOME|/Users)([[:space:]/]|$)'; then
  deny "Refusing destructive rm -rf on a root/home target. If you truly intend this, run it yourself outside the agent."
fi

# 2. Force push (--force-with-lease is allowed).
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push' \
   && printf '%s' "$cmd" | grep -qE '(--force([[:space:]]|=|$)|(^|[[:space:]])-f([[:space:]]|$))' \
   && ! printf '%s' "$cmd" | grep -q 'force-with-lease'; then
  deny "Refusing git push --force. Use --force-with-lease, or push manually. (Project rule: do not auto-push.)"
fi

# 3. sudo DIRECTLY invoking the dev server -> creates root-owned CLI files, the EACCES cycle.
# (Adjacency required so doc/commit/PR text mentioning "sudo ... yarn dev" is not flagged.)
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])sudo[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+|-[A-Za-z]+[[:space:]]+)*(yarn[[:space:]]+(run[[:space:]]+)?dev|npm[[:space:]]+run[[:space:]]+dev|shopify[[:space:]]+app[[:space:]]+dev)'; then
  deny "Never sudo the dev server — it leaves root-owned CLI files that force more sudo (the EACCES cycle). Run yarn dev / yarn dev:all without sudo; on EACCES, chown the root-owned files once (see CLAUDE.md / memory)."
fi
exit 0
