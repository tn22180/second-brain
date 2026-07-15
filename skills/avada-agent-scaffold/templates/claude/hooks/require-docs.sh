#!/usr/bin/env bash
# PreToolUse(Bash): remind to run /docs before pushing a branch that touches feature code
# but has no docs/ file yet. Non-blocking — "is this feature-sized" stays a model judgment
# call; the hook just guarantees the reminder fires on every push.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
branch=$(git -C "$repo" branch --show-current 2>/dev/null)
[ -n "$branch" ] && [ "$branch" != "master" ] || exit 0

base=$(git -C "$repo" merge-base HEAD origin/master 2>/dev/null) || exit 0
files=$(git -C "$repo" diff --name-only "$base"..HEAD 2>/dev/null)
[ -n "$files" ] || exit 0

# Already documented this branch — don't nag on every subsequent push.
printf '%s\n' "$files" | grep -q '^docs/' && exit 0

# Only remind when the diff touches real feature code — not just tests or lockfile.
feature_files=$(printf '%s\n' "$files" \
  | grep -E '^(packages/[^/]+/src/|extensions/)' \
  | grep -vE '(__tests__/|\.(test|spec)\.jsx?$)')
[ -n "$feature_files" ] || exit 0

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"This branch touches feature code (packages/*/src or extensions/) with no docs/ file yet. If this introduces a new feature, API, or breaking change, run /docs before this push."}}'
exit 0
