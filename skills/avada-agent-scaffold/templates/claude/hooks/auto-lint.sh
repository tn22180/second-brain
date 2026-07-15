#!/usr/bin/env bash
# PostToolUse(Write|Edit): eslint --fix the edited file.
# Monorepo: per-package .eslintrc.js, and eslint v6 resolves plugins from CWD,
# so run eslint FROM the nearest eslintrc dir (mirrors the repo's `--prefix` pattern).
# Non-blocking by contract: always exits 0, never fails the tool call.

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] || exit 0

case "$f" in
  *.js|*.jsx|*.ts|*.tsx) ;;
  *) exit 0 ;;
esac

root=$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null) || exit 0

# Walk up from the file to the nearest eslintrc, stopping at the repo root.
dir=$(dirname "$f")
cfg=""
while :; do
  for rc in .eslintrc.js .eslintrc.cjs .eslintrc.json .eslintrc; do
    if [ -f "$dir/$rc" ]; then cfg="$dir"; break 2; fi
  done
  [ "$dir" = "$root" ] && break
  parent=$(dirname "$dir"); [ "$parent" = "$dir" ] && break; dir="$parent"
done
[ -n "$cfg" ] || exit 0

bin="$root/node_modules/.bin/eslint"
[ -x "$bin" ] || exit 0

( cd "$cfg" && "$bin" --fix "$f" ) >/dev/null 2>&1
exit 0
