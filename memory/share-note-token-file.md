---
name: share-note-token-file
description: share-note needs NOTES_API_KEY but it is not exported in any shell profile; the token lives in ~/.config/avada/notes-token
metadata:
  node_type: memory
  type: reference
  originSessionId: abea53b9-0765-4c75-aa35-2264a8b7276f
  modified: 2026-10-01T10:22:37.208Z
---

`NOTES_API_KEY` is not set in env/zshrc/zshenv/settings.json. Token file: `~/.config/avada/notes-token`. Run:
`NOTES_API_KEY="$(tr -d '\n' < ~/.config/avada/notes-token)" bun ~/.claude/skills/share-note/index.ts <file> [...]` — never cat/echo the token.
