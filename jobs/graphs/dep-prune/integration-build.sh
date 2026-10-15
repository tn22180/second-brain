#!/usr/bin/env bash
# Real install + production builds on a dep-prune integration worktree: `integration-build.sh <worktree>`.
# The runner symlinks node_modules to the main checkout; installing through that link would rewrite the
# main checkout's deps, so the link is dropped first and the worktree gets its own install.
set -uo pipefail
W=$1
cd "$W" || exit 1
[ -L node_modules ] && rm node_modules
for d in packages/*/node_modules; do [ -L "$d" ] && rm "$d"; done
echo "### install"
yarn install 2>&1 | tail -5 || exit 1
rc=0
for ws in packages/*/; do
  name=$(node -p "require('./${ws}package.json').name" 2>/dev/null) || continue
  script=$(node -p "const s=require('./${ws}package.json').scripts||{};s.production?'production':''")
  [ -z "$script" ] && continue
  echo "### build $name"
  if yarn workspace "$name" run "$script" >"/tmp/dep-prune-build.$$.log" 2>&1; then
    echo "ok"
  else
    rc=1
    tail -30 "/tmp/dep-prune-build.$$.log"
  fi
done
exit $rc
