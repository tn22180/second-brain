Title: Remove commented-out code, and write down what a comment is for

---

Two commits: an automated comment cleanup, and the rule meant to stop the noise coming back.

## Cleanup — 40 files, 184 deletions, 0 insertions

A codemod deletes only `//` line comments it can prove carry nothing:

- **157 lines of commented-out code** — a run of `//` lines whose contents parse as JavaScript statements
- **27 comments that restate the single line below them**, each read by hand rather than deleted automatically

Left alone: JSDoc, license headers, comments with a URL, eslint/ts/bundler directives, TODO/FIXME/HACK, Vietnamese comments, and anything mentioning why/because/workaround/bug/limit/quota/race.

**`packages/avadaseo` is out of scope.** It is a Yoast fork and holds about half the repo's comment lines on upstream's JSDoc conventions; the same goes for `packages/editor` and the `EditorJs` tool forks under `packages/assets`. Measuring comment density without excluding them overstates the problem by roughly double.

## Why this is safe to review quickly

Every rewritten file is parsed before and after with `@babel/parser`, and the two ASTs are deep-compared with comments and locations stripped. A single differing node rejects the file, so the diff is provably behaviour-neutral.

A commented-out block is kept whole or not at all, and stays when any surviving comment still mentions a name it declares or declares a name it mentions — otherwise deleting part of a block strands the rest, referring to names then defined nowhere.

An independent review of this diff found no stranded references, no non-comment deletions, and no altered JSX, template-literal or string content. The 16 deleted `// For X block` comments in `NavigationContainer.jsx` were each checked to sit above exactly one `useTargetBlockEvent(...)` call — restatements, not section headings.

## Rule

`CLAUDE.md` gains a `## Comments` section: a comment carries the reason a line exists, longer explanation goes to `docs/features/`, and code is deleted rather than commented out. `docs/features/` did not exist, so its README states what a feature doc carries. `scripts/scan-comments.py` reports the noise on demand — no CI gate, no eslint rule.

## Verification

```
packages/functions  babel src --out-dir lib      ->  Successfully compiled 422 files (2463ms)
packages/assets     jest                          ->  4 suites, 26 tests passed
packages/assets     vite build (production)       ->  6566 modules transformed, built in 22.76s
codemod fixtures    node test.js                  ->  21 passed, 0 failed
git diff: deleted lines that are not comments     ->  0
```

No dependency added, so no `yarn.lock` change is needed. No `[deploy-changed]` marker in either commit title.
