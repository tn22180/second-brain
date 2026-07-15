# Adaptation Guide — applying the scaffold to a new app

How to go from a fresh `scaffold.mjs` run to a fully-adapted agent layer for an app.

## 1. Dry-run + review

```bash
node ~/.claude/skills/avada-agent-scaffold/scripts/scaffold.mjs \
  --repo "/path/to/app" \
  --domains "domainA,domainB,domainC" \
  --dry-run
```

Check the planned-writes list and the detected placeholders (app name, prod project,
packages). Fix `--domains` until the stub list matches the app's real domains. The
generator prints **auto-detected domain candidates** (non-standard `src/` dirs + worker
config) — use them to choose `--domains`.

## 2. Apply

Drop `--dry-run`. The run:
- writes `.claude/` (source) + `.agent/` mirror + `.cursorrules` + `docs/ai-agent/README.md`
- merges `.claude/settings.json` (hooks unioned, existing untouched)
- **never** touches `CLAUDE.md` or `settings.local.json`

Re-runs are safe: existing files are skipped unless `--force`.

## 3. Fill the domain stubs

Each `skills/<domain>/SKILL.md` is a stub. Fill it from the app's own sources — do NOT
copy another app's domain skill. Good sources:
- `PATTERNS.md` (cited `file:line` examples)
- `packages/functions/src/<domain>/`, `src/jobs/`, `worker.config.yml`
- existing `docs/` for that feature

Write concrete trigger phrases in the `description:` frontmatter (file/function/feature
names) so the skill auto-activates. Keep each < 200 lines.

## 4. Adapt root CLAUDE.md by hand

The generator won't edit `CLAUDE.md`. Add navigation tables so agents discover the scaffold:

```markdown
## Which skill
| Task | Skill |
|------|-------|
| Firestore queries/indexes | firestore |
| Backend / async / pubsub | backend |
| <domain> work | <domain> |

## Which command / agent
| Need | Use |
|------|-----|
| Plan a feature | /plan or planner agent |
| Review a diff | /review or code-reviewer agent |
```

Keep existing security rules, CI/CD notes, and `PATTERNS.md` references intact.

## 5. Write missing per-package CLAUDE.md

The checklist flags `packages/<pkg>/CLAUDE.md` files that don't exist. Add short ones for
the packages agents touch most (`functions`, `assets`).

## 6. Verify

- `bash -n .claude/hooks/*.sh` — hooks parse.
- Grep the generated tree for leaked app-of-origin names (should be none):
  `grep -ri "loyalty\|points\|avada-joy" .claude .agent .cursorrules`
- Open a couple of generated agents/skills — confirm no dangling refs to agents/skills
  that weren't generated.

## Extending the templates (rare)

If a pattern is genuinely Avada-wide and missing, add it to
`templates/claude/<section>/` (source of truth). The `.agent/` mirror is regenerated —
never hand-edit a generated `.agent/` file. See `mapping.md` before adding anything: if
it's domain/integration/org-tool specific, it belongs in an app's stub, not the templates.
