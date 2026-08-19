tạo 1 cron hàng ngày lúc 6 giờ cho tất cả agent ra scan tất cả các app trong 1 job của 1 app sẽ gồm :
1 agent scan security app
1 agent scan code app, các code k dùng + thiếu import hàm hay biến các file
1 agnet theo dỗi 2 cái trên rồi xong report cho t vào telegram, nếu có mr fix luôn thì tạo 2 mr riêng 1 security + 1 clean code nhé

---

## Progress

Started: 2026-08-19
Spec: `tools/prod-error-autofix/docs/specs/2026-08-19-repo-audit-design.md`
Plan: `tools/prod-error-autofix/docs/plans/2026-08-19-repo-audit.md`

Scope changes since the brief, both from Tuan on 2026-08-19:
- The prod-error daemon's own auto-MR is switched off (task 1). 58 sat unreviewed as of 2026-08-04.
- The audit keeps both MR lanes. `AUDIT_MR_ENABLED=false` until a few runs have been read.

Tracking is this table only — this harness has no TaskCreate tool.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Switch off the daemon's MR opening | general-purpose / sonnet | ⬜ | 0/5 | — | Touches the live pipeline. `!allowMr` currently falls into the infra branch (pipeline.ts:438) — needs its own status, not that one |
| 2 | Registry `auditLintPaths` + `auditKnip` | cavecrew-builder / haiku | ⬜ | 0/5 | — | |
| 3 | eslint runner | general-purpose / sonnet | ⬜ | 0/5 | — | Config must be written inside the worktree; read machine output from a file, not stdout |
| 4 | Ledger `audit_findings` + fingerprint | general-purpose / sonnet | ⬜ | 0/5 | — | Line number deliberately not in the fingerprint |
| 5 | Security lane | general-purpose / opus | ⬜ | 0/5 | — | Read-only tools; drop citations that do not resolve; redact secret values |
| 6 | Triage lane | general-purpose / sonnet | ⬜ | 0/5 | — | |
| 7 | Supervisor + report render | general-purpose / sonnet | ⬜ | 0/5 | — | Code fallback so a prose failure never loses a finding |
| 8 | MR lanes | general-purpose / opus | ⬜ | 0/5 | — | The only task that pushes. Every gate fails closed |
| 9 | `audit` command + orchestration | general-purpose / sonnet | ⬜ | 0/5 | — | |
| 10 | 06:00 plist + doctor checks | general-purpose / sonnet | ⬜ | 0/5 | — | Calendar one-shot, never KeepAlive |
| 11 | README + this table | inline | ⬜ | 0/5 | — | README:61 claims SSH; the remotes are HTTPS across two hosts |

### Log

Nothing executed yet. Spec and plan committed; awaiting the execution-mode choice.
