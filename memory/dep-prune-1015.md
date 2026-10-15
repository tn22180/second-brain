---
name: dep-prune-1015
description: "2026-10-15 prune dep thừa 5 app SEOOn qua harness graph — MR, verifier ở jobs/graphs/dep-prune, bẫy gặp phải"
metadata:
  node_type: memory
  type: project
  originSessionId: 263f020a-8f1c-4bfd-8053-3205a4fe70d4
  modified: 2026-10-15T10:33:26.597Z
---

2026-10-15 gỡ dep không dùng ở 5 app, MR đã merge 2026-10-15 ~11:02 UTC, chưa cắt tag: seo !2424, blogs !931, APC !216, img !300, AEO !155 (target main). Branch `chore/prune-unused-deps`.

Verifier dùng lại được: `second-brain/jobs/graphs/dep-prune/` (check-removed.mjs, check-lockfile.sh offline, integration-build.sh, resolve-imports.mjs).

Bẫy:
- git pathspec `:!**/yarn.lock` KHÔNG loại root yarn.lock → phải `:(exclude,glob)**/…`; lỗi này làm Codex hoàn hết removal (prune thiếu).
- AEO commit `.yarn/install-state.gz` + 3 symlink `node_modules` vào main → yarn install làm bẩn tree; dùng `YARN_INSTALL_STATE_PATH=$(mktemp)`.
- Runner harness: rerun graph blocked cùng branch đụng worktree node `<branch>--<node>` cũ; phải dọn tay + đổi id.
- Worktree runner symlink node_modules về checkout chính — gỡ link trước khi `yarn install` thật.
- seo `packages/scripttag` KHÔNG chết: functions Dockerfile COPY manifest.
- Mỗi install thật ~0.5–2.5G; 5 cái làm đầy đĩa (ENOSPC) — xoá node_modules worktree sau khi verify.

**Why:** lặp lại cho app khác (joy, product-feed, avachat) hoặc lần sau.
**How to apply:** tái dùng graph `jobs/graphs/*-dep-prune-1015*.json` + scripts; xem [[agent-harness-graph-learn]], [[harness-graph-verify-pitfalls]].
