---
name: codex-otel-tracking
description: Codex token usage reaches Grafana only via [otel] in ~/.codex/config.toml (added 2026-10-06); cc wrapper codex branch logs metadata only, harness calls codex exec directly
metadata:
  type: project
---
Avada claude-tracking (cc wrapper + launchd net.avada.claude-telemetry) tracked only Claude. Codex had no `[otel]` block despite TRACK_INSTALL_CODEX=1, and harness runs `codex exec` directly (agent-harness node.ts), bypassing `cc` — so Codex work from 10-06 on was invisible until the block was added 2026-10-06 (backup `config.toml.bak-otel-20261006`).

**Why:** codex 0.160 has no env interpolation for otel headers → ingest token is literal in config.toml (0600). Re-running the installer could overwrite it.
**How to apply:** if Codex usage missing in Grafana, check `grep otel ~/.codex/config.toml` first. Codex inherits global `OTEL_RESOURCE_ATTRIBUTES` with `tool=claude` when not run via `cc` — filter by service.name (codex_exec), not `tool`. Related: [[codex-astra-codes]].
