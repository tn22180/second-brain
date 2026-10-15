#!/usr/bin/env bash
# yarn 4 refuses --immutable with --mode=update-lockfile, so compare hashes instead. Offline on purpose:
# the lockfile must already match the manifests, resolving only from entries it holds plus the global cache.
set -euo pipefail
before=$(shasum yarn.lock)
# Some repos (AEO) commit .yarn/install-state.gz; writing it would put the tree outside the allow list.
YARN_INSTALL_STATE_PATH=$(mktemp) YARN_ENABLE_NETWORK=0 yarn install --mode=update-lockfile >/tmp/dep-prune-lock.$$ 2>&1 || { tail -20 /tmp/dep-prune-lock.$$; exit 1; }
after=$(shasum yarn.lock)
if [ "$before" != "$after" ]; then
  echo "yarn.lock out of sync with package.json — run: YARN_ENABLE_NETWORK=0 yarn install --mode=update-lockfile"
  git diff --stat -- yarn.lock
  exit 1
fi
echo "yarn.lock consistent"
