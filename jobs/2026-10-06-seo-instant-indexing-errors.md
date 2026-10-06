# seo — Instant Indexing: surface Google's real failure reason

Source: Slack https://avadaio.slack.com/archives/G01N5G8D562/p1791189693010899 (shop rugby-heaven-ltd, FAL-1097).
Follow-up to MR !2363 (malformed key → `googleError`). Branch `fix/instant-indexing-google-errors` cut from !2363 head `4dce8ab606c`.

## Gaps left after !2363
1. Valid-shape key but `jwtClient.authorize()` throws (corrupt/revoked private_key → `invalid_grant`) → controller returns `{success:false,error}` → FE `else` branch only tracks, shows NOTHING.
2. Google batch returns per-part 403 (SA not Owner in GSC: "Failed to verify the URL ownership"; Indexing API disabled: "has not been used in project … SERVICE_DISABLED") → `googleError` unset → generic banner.

## Decisions
- Base → branch off !2363 source branch, target master — fix depends on !2363's `googleError` plumbing; MR says "merge after !2363".
- Messages → English strings in `const/googleIndexing.js`, same as !2363's `INVALID_GOOGLE_KEY_MESSAGE` — i18n codes would need every locale; keep consistent with !2363, cheap to change later.
- Repro → jest fixtures (mock JWT/request-promise), no real SA — path uses only the pasted key, not ADC; fixture format from Google docs, needs one real capture to confirm.
- Codex round 1 refused: seo master has a committed `AGENTS.md` (Bullpen "morgan" persona, 16adf2d790f tunglv 09-03 [FAL-440]) that overrides CLAUDE.md fallback → rerun with `-c project_doc_max_bytes=0`; AGENTS.md itself reported, not touched (out of scope).

---

## Progress

Started: 2026-10-06

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | BE parse auth/batch errors → googleError; FE show resp.error | codex / gpt-6-astra | ✅ | 2/5 | clean | r1 refused (AGENTS.md persona); r2 done + inline review fixes |

### Log

#### ✅ Task 1: surface Google failure reason
- Agent: codex (gpt-6-astra)
- Plan:
  - Goal: authorize() throw → results `{isSuccessGoogleIndexing:false, googleError:<auth msg>}` (no throw); batch body with error parts → `googleError` mapped (ownership / API disabled / fallback with Google's message); FE `!resp.success` shows `resp.error`.
  - Files allowed: packages/functions/src/services/instantIndexingService.js, packages/functions/src/const/googleIndexing.js, packages/functions/src/services/__tests__/instantIndexingService.test.js, packages/assets/src/pages/InstantIndexing/InstantIndexing.js
  - Approach: try/catch around authorize + promisifiedRequest in indexingGoogleByType; helper parses first `"message"` from batch body. Rejected: i18n error codes (all locales, scope).
  - Test command: `npx jest packages/functions/src/services/__tests__/instantIndexingService.test.js` → all pass
  - Risk: seoController.get auto-index path also calls this — now returns error result instead of throwing (better). No data writes.
  - Rollback: revert commit.
- Rounds used: 2/5 (r1: Codex refused via committed AGENTS.md; r2: implemented). Inline review: log tag + logger signature, parse e.error on rejected batch, +1 test.
- Security check: clean — git diff 4 files +170/-4; no secret, logs e.message only, no shop-scope change.
- Verify: harness 5/5 pass; jest 14/14; eslint clean (DISABLE_V8_COMPILE_CACHE=1).

**COMPLETE** 2026-10-06 — MR https://git.avada.net/avada/seo/-/merge_requests/2368 (merge after !2363). Rounds 2/5, security clean. Not merged/tagged/deployed.
