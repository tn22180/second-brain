Title: Remove commented-out code, and write down what a comment is for

---

Two commits: an automated comment cleanup, and the rule meant to stop the noise coming back.

## Cleanup — 99 files, 394 deletions, 0 insertions

A codemod deletes only `//` line comments it can prove carry nothing:

- **303 lines of commented-out code** — a run of `//` lines whose contents parse as JavaScript statements
- **80 banner separators** — lines holding nothing but `----` or `====`
- **11 comments that restate the single line below them**, each read by hand rather than deleted automatically

Left alone: JSDoc, license headers, comments with a URL, eslint/ts/bundler directives, TODO/FIXME/HACK, Vietnamese comments, and anything mentioning why/because/workaround/bug/limit/quota/race.

## Why this is safe to review quickly

Every rewritten file is parsed before and after with `@babel/parser`, and the two ASTs are deep-compared with comments and locations stripped. A single differing node rejects the file, so the diff is provably behaviour-neutral. One file was rejected that way and left untouched.

A commented-out block is kept whole or not at all. Blank lines inside one do not split it, and a run stays when any surviving comment — a `//` line or a `{/* ... */}` JSX block — mentions a name it declares or declares a name it mentions. Three review rounds found four ways an earlier version stranded fragments; the disabled BFCM bundle, the bulk-fix cap, the parallel-batching path and the crm-sql shop sync all survive intact because of it.

## Rule

`CLAUDE.md` gains a `## Comments` section: a comment carries the reason a line exists, longer explanation goes to `docs/features/`, and code is deleted rather than commented out. `scripts/scan-comments.py` reports the noise on demand — no CI gate, no eslint rule.

## Two things broken on master, not by this MR

- **`eslint` v6.8.0 dies on Node 22** before it reads a file: `SyntaxError: Cannot use import statement outside a module` at `node_modules/async-function/require.mjs:1`. The `eslint-fix` script is currently a dead command.
- **`packages/assets` vite build fails**: `Rollup failed to resolve import "falcon-event-tracker/browser"` from `src/pages/BulkGenerator/ListGenX.jsx`. Reproduced on a clean worktree of `origin/master`; the dependency is declared in `packages/assets/package.json` but not installed. That file is not in this diff.

## Verification

```
packages/functions  babel src --out-dir lib   ->  Successfully compiled 1000 files (4087ms)
codemod fixtures    node test.js              ->  21 passed, 0 failed
git diff: deleted lines that are not comments ->  0
```

No CI deploy markers in either commit title, so this does not trigger a worker or selective-function deploy.
