---
name: bot-safety-gates
description: Every safety gate in falcon-fix-bot — what it protects, where it's enforced, which test guards it, and the reasoning. Read BEFORE touching gate.js, deploy.js, git.js, gitlab.js, pipeline.js's FIX path, or any env flag semantics. Also documents the deploy fence and why each gate fails CLOSED.
---

# Safety gates — the contract that makes unattended auto-fix acceptable

The bot merges AI code to master and (phase 4) deploys production. These gates are why that's
tolerable. **Every gate is code, not prompt.** Prompts are advisory; code is the contract.

## The decision gate (`gate.js#decide`) — pure, tested by a truth table

```
verdict !== "FIX"                                  → SKIP   (includes null = unparseable)
app ∉ autoFixApps (or allowlist not an array)      → TAG
confidence !== "high"                              → TAG    (strict lowercase match)
counters/caps missing or non-finite                → TAG    (fail CLOSED — undefined >= n is
                                                             false in JS; we treat missing as
                                                             "cap hit", never "no cap")
fixesThisRun >= 3  OR  fixesToday >= 10            → TAG
else                                               → FIX
```
Guard test: `test/gate.test.js` (8-branch truth table + fail-closed cases). If you change the
order of checks, update the table — order is part of the spec.

## Verdict parsing feeds the gate — fail-closed rules (`claude.js#parseVerdict`)

- `VERDICT:` / `CONFIDENCE:` must match **exactly once**, anchored to **end of line**
  (`^\s*VERDICT:\s*(FIX|SKIP)\s*$`). Zero or 2+ matches → null. Why: models restate the
  format ("VERDICT: FIX or SKIP depending…") and self-correct mid-answer; first-match parsing
  fabricated a FIX in testing. A lone restatement line can't match (trailing prose kills it).
- Fields are extracted by a line scanner (label line → until next label/``` fence), CRLF-safe
  (`/\r?\n/` — a plain "\n" split regressed this once).
- Ambiguity ALWAYS lands on SKIP/TAG, never FIX.

## Git/GitLab layer — what is structurally impossible

- `git.js` has **no tag function**; `gitlab.js` has **no tag-creating function** and its raw
  `api()` is **not exported** (an exported api() bypassed the allowlist once — reviewed and
  closed). Guard tests assert both.
- `pushBranch` refuses any branch not matching `^falcon-bot\/` and pushes a literal
  `refs/heads/<b>:refs/heads/<b>` refspec. Crafted branch names that try to smuggle
  `refs/tags/...` were tested against a real remote — git's own ref validation rejects them
  at TWO layers (branch creation + refspec).
- Every gitlab.js function calls `assertAllowed(project)` FIRST — rejects before any network.
- The HOST those URLs point at comes only from `gitlab-host.js` (config `gitlabHost` / env
  `GITLAB_HOST`, default `https://git.avada.net` since the 2026-08-18 move off gitlab.com) and
  is validated as a plain **https** origin — no path, no userinfo, no plaintext http. The
  token is embedded in the clone/push URLs built from it, so a malformed or hostile host would
  hand a live write token to a third party: it throws at config load instead. A guard test
  keeps the literal out of every other `src/` module.
- Merging is ONLY `merge_when_pipeline_succeeds:true` (PUT). The direct-merge API is never
  called anywhere. Red pipeline ⇒ nothing lands.
- Tokens: trimmed at source AND scrubbed from every thrown error (`<redacted>`), because a
  token with a stray newline leaks verbatim through fetch's Headers TypeError (reproduced).
  git.js wraps all token-bearing ops in `withRedacted`.

## Shopify is READ-ONLY (`tools/shop-token.js`)

`assertReadOnlyQuery` **parses** the GraphQL document with graphql-js (no regex sniffing —
two regex bypasses were demonstrated: leading-comment + `mutation(`, and a multi-op document
where a stray quote in a comment swallowed the mutation). Rules: unparseable → throw
(fail closed); ANY OperationDefinition with operation !== "query" → throw. A field literally
named "mutation" false-positives — intentional. Fragments typed `on Mutation` pass the guard
but are inert by GraphQL's mandatory PossibleFragmentSpreads validation (proven with the
reference implementation) — optional hardening only.

## The deploy fence (`deploy.js`) — the most dangerous 200 lines in the repo

Tag push = PRODUCTION deploy for these apps. Protections, in order:

1. `canDeploy`: `DRY_RUN` on → deny (added after review — deploy must never be the one writer
   DRY_RUN misses) → `AUTO_DEPLOY` off → deny → MR not verified merged → deny → daily cap
   (4, fail-closed on non-finite) → allowlist.
2. **Fence BEFORE push:** every entry in the batch transitions to `deploying` (+ a virtual
   `deploy:<app>:<tag>` marker) BEFORE the tag push. A crash anywhere after that leaves
   `deploying` orphans which are NEVER auto-resumed — checkPending posts ONE idempotent ops
   alert ("verify tag on GitLab manually") using a marker file. This closes the
   crash-window double-deploy (entries used to stay pending-merge through the 15-min
   pipeline poll — a restart would have re-tagged).
3. **Stale-tag cleanup:** a failed push deletes the just-created local tag; a pre-existing
   stale local tag is cleared before creating. Without this, one transient push failure
   permanently wedged an app ("tag already exists" forever — reproduced).
4. Failed/timed-out deploy → ops alert + `deploy-error`, **never retried by the bot**. A tag
   may exist on GitLab — humans own recovery. Do not "improve" this with auto-retry.
5. One deploy batches ALL merged bot fixes for that app since the last tag (natural batching;
   `countToday("deploy")` counts only post-success `action:"deploy"` records, so failed
   attempts don't consume the cap).
6. `nextTag` = patch+1 of the FIRST `vX.Y.Z` in GitLab's `order_by=updated` list — NEVER the
   numeric max, NEVER local tags (local tag lists are stale in these repos; e.g. seo showed
   v1.84.x locally while the active line was v1.78.x).

## DRY_RUN / TEST_MODE semantics (be precise when touching slack.js/pipeline.js)

- `DRY_RUN=1`: slack.post prints; pipeline skips push/MR/merge (applyFix + local commit still
  run — that's the point); reactions print; deploy denied via canDeploy. Ledger records
  `dry-run` state.
- `TEST_MODE=1`: posts are REDIRECTED to `TEST_CHANNEL` with a "[TEST — would post to …]"
  prefix — EXCEPT posts whose destination already IS the test channel (no prefix; it was
  confusing noise). Empty `TEST_CHANNEL` while TEST_MODE=1 → post() throws a clear config
  error BEFORE any network (an operator turning DRY_RUN off with the default TEST_MODE on
  must not post to channel "").
- **Reactions bypass TEST_MODE** (they can't be redirected; user-approved as the one visible
  signal). They still respect DRY_RUN. Never make reactions throw — best-effort only. This now
  covers TWO reactions, not one: 👀 at the "checking" touchpoint (`processOneHandoff`, before
  `diagnose`) and 🤖 at the top of `runFixPath` — both go straight to the real thread in every
  mode.
- The **checking/skip comments** (`report.checkingReply()` / `report.skipReply()`) are NOT
  reactions — they're normal `slack.post` calls via the same `postBestEffort` helper as every
  other reply, so they follow the ordinary rules above: DRY_RUN prints them, TEST_MODE
  redirects them to `TEST_CHANNEL`. Only the reaction half of each touchpoint is
  TEST_MODE-exempt.

## Caps & concurrency

- `MAX_FIXES_PER_RUN=3`, `MAX_FIXES_PER_DAY=10`, `MAX_DEPLOYS_PER_DAY=4` — beyond → TAG/hold.
- Cross-app pool = `CONCURRENCY` (3). **Per-app FIX path is serialized** by
  `withMutex("fix:"+app)` — same-app fixes queue; each next fix branches from freshly fetched
  `origin/<default>` (contains the previous fix if merged). Eliminates git plumbing races and
  MR conflict cascades. The `decide()`→`count+=1` pair is synchronous (no await between) —
  atomic under the pool; keep it that way.

## Post-fix asserts (`fixer.js#checkFixResult`) — the model is never trusted

After the fix session: model committed anything (`rev-list` changed) → `MODEL_COMMITTED`
error, fix rejected. Empty diff → `EMPTY_DIFF`. Model replied `MISMATCH: …` (code no longer
matches diagnosis) → propagated. Only then does CODE commit (author `Falcon Fix Bot
<falcon-fix-bot@avadagroup.com>`) and push.
