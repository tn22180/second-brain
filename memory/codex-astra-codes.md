---
name: codex-astra-codes
description: Since 2026-10-06 delegated coding runs on Codex gpt-6-astra; Claude Code only plans, reviews, tracks.
metadata:
  type: feedback
---
Code giao đi (harness graph node, tony-wf task, subagent edit) chạy `codex exec -m gpt-6-astra -c 'sandbox_mode="workspace-write"'`; Claude Code giữ plan / dispatch / review diff / verify / MR.

**Why:** Tuan có gói Codex, muốn Codex Astra code thay Opus (2026-10-06).

**How to apply:** harness `node.ts` mặc định codex (`meta.executor: 'claude'` để quay về `cc -p`); resume qua thread_id đầu tiên trong log JSONL. Gọi `codex` trực tiếp — wrapper `cc codex` chết trên macOS (`date +%N`). `~/.codex/config.toml` có `project_doc_fallback_filenames = ["CLAUDE.md"]` nên Codex đọc CLAUDE.md của repo. Verified e2e 10-06: tạo file + `bun test` trong sandbox + resume giữ thread. Related [[agent-harness-graph-learn]] [[agent-autonomy-mr-not-merge]].
