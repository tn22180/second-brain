# Agent Harness step 2 — Graph (B6)

**Goal:** `harness graph run <graph.json>` executes a task DAG unattended: each node is a contract +
prompt run by `cc -p` in its own worktree, supervised by `jev supervise`, gated by `harness verify`,
retried by resuming the same Claude session with the verifier's failure, max 5 rounds. Ends with one
integrated feature branch and a DM. **Does not push** — pushing stays in a Claude session where
`git_guard` enforces it.

**Why not push from the runner:** the runner is a plain bun process; `git_guard.py` only sees Claude's
Bash calls. Anything the runner could push is outside the one enforcement point we have.

## Model

```json
{
  "id": "seo-quota",
  "repoPath": "/abs/main/checkout",
  "base": "master",
  "branch": "feat/seo-quota",
  "maxParallel": 3,
  "nodes": [
    {"id": "t1", "deps": [], "prompt": "…", "contract": {goal, allow, verify, reproduce?, security?}, "meta": {"agent": "general-purpose", "model": "opus"}},
    {"id": "t2", "deps": ["t1"], …}
  ]
}
```

- Node contract omits `id`, `repoPath`, `baseSha` — the runner fills them (`<graph>-<node>`, node worktree, worktree HEAD at dispatch). Goalposts are still fixed before the agent starts.
- **Parallel nodes must have disjoint `allow` sets** (checked at parse, for every pair with no path between them) — so integration merges never conflict and scope checks stay meaningful.

## Execution

1. Parse + validate: ids unique, deps exist, acyclic, disjoint allow for concurrent pairs, `branch` ≠ `base`.
2. Integration branch `branch` cut from `origin/<base>` in worktree `<repo>-wt-<graph>`.
3. Node ready when all deps are ✅. Its worktree `<repo>-wt-<graph>-<node>` is cut from the integration branch tip (so it sees its deps' commits).
4. Dispatch `cc -p --session-id <uuid> --model <m> <prompt+contract>`; stdout/stderr → `~/.cache/agent-harness/graphs/<graph>/<node>.log`.
5. Every 60 s: `jev supervise` on the log tail → `keep_waiting` | `nudge`/`answer_question` (kill, `--resume` with jev's text) | `escalate` (kill, node 🛑, DM) | `collect` (wait for exit).
6. On exit: `harness verify` (claimedDone=true, meta.round). Fail → round++; ≤5 → `cc -p --resume <sid> "<failed checks, redacted>"`. Round 5 fail → node 🛑, dependents never start, graph BLOCKED, DM.
7. Pass → commit exactly the verified index on the node worktree, merge `--no-ff` into integration branch, remove node worktree.
8. All ✅ → DM `<b>graph id</b>` + one line per node + "ready to push". State in ledger table `graph_nodes`.

## Tasks

- [ ] G1 `src/graph.ts` parse/validate (ids, deps, cycle, disjoint allow, branch≠base) — pure, TDD
- [ ] G2 `src/scheduler.ts` ready-set + parallel cap + blocked propagation, executor injected — pure, TDD
- [ ] G3 `src/worktree.ts` integration/node worktrees, commit verified index, merge — TDD on temp repos
- [ ] G4 `src/node.ts` dispatch + supervise + resume loop, `cc`/`jev` injected — TDD with fakes
- [ ] G5 CLI `graph run|status`, ledger `graph_nodes`, DM summary
- [ ] G6 tony-wf: step 4 writes graph.json; §6–§8 become `harness graph run`; push/MR stays in the session
- [ ] G7 pilot on one real brief

Known issue to report upstream: `jev supervise` answered `collect` with reason "the run exited with
status False" for `exited:false`.

## Step 3 — Self-improve (B7), after ≥10 real runs

`harness learn --days 14`: false-done by agent×model×task-shape, checks that fail most, rounds per
node, rejected MRs → proposes edits to tony-wf routing table / skill text as a second-brain MR + DM.
Never applies itself.
