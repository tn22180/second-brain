#!/usr/bin/env bash
# PreToolUse(Bash): DENY a git commit / broad add that would include a dev tunnel URL.
# `shopify app dev` bakes *.trycloudflare.com into extension api.js; committing it breaks prod.
# This is the guardrail for the foot-gun hit repeatedly during harness development.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0
repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
# Match a REAL tunnel URL (https://<hyphenated-subdomain>.trycloudflare.com),
# not a bare mention of the domain in docs/scripts (avoids flagging this hook itself).
pat='https?://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com'

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# git commit -> scan the staged diff (and unstaged too when -a/-am auto-stages).
if [[ "$cmd" == *"git commit"* ]]; then
  scan=$(git -C "$repo" diff --cached 2>/dev/null)
  if [[ "$cmd" =~ (^|[[:space:]])-a(m)?([[:space:]]|$) ]]; then
    scan="$scan"$'\n'"$(git -C "$repo" diff 2>/dev/null)"
  fi
  if printf '%s' "$scan" | grep -qE "$pat"; then
    deny "Refusing commit: a dev tunnel URL (*.trycloudflare.com) is in the changes to be committed. The dev server bakes it into extension api.js. Unstage/restore first: git restore --staged extensions/ (and git checkout -- extensions/ after stopping dev), then commit only your real changes."
  fi
fi

# broad git add -> deny when tracked working-tree files carry the URL.
case "$cmd" in
  *"git add -A"|*"git add -A "*|*"git add --all"|*"git add --all "*|*"git add -u"|*"git add -u "*|*"git add ."|*"git add . "*)
    if git -C "$repo" diff 2>/dev/null | grep -qE "$pat"; then
      deny "Refusing broad git add: tracked files contain a dev tunnel URL (*.trycloudflare.com) — a broad add would stage extension artifacts. Stop dev, run git checkout -- extensions/, or add only your real files explicitly."
    fi
    ;;
esac
exit 0
