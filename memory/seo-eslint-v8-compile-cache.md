---
name: seo-eslint-v8-compile-cache
description: seo eslint-fix crash "Cannot use import statement outside a module" = eslint 6 v8-compile-cache vs Node 22 require(esm); fix DISABLE_V8_COMPILE_CACHE=1
metadata:
  type: project
---

`seo` repo, 2026-08-27. Two separate breakages in `npm run eslint-fix`, both fixed in
`packages/{assets,functions}/package.json`:

1. Script hardcoded `./node_modules/.bin/eslint`, but yarn 4 (`nodeLinker: node-modules`)
   hoists eslint to the repo root — `packages/*/node_modules/.bin/` has no eslint.
   Fix: bare `eslint`, resolved via PATH.
2. `SyntaxError: Cannot use import statement outside a module` at
   `node_modules/async-function/require.mjs`. eslint 6 preloads `v8-compile-cache`, which
   monkeypatches `Module._compile`; Node 22's `require(esm)` + the `module-sync` export
   condition in `async-function@1.0.0` then feeds an ESM file to the CJS compiler.
   Fix: `cross-env DISABLE_V8_COMPILE_CACHE=1 eslint --fix .`.
   `git-hooks/pre-commit:3` already had this export — same root cause, hit earlier.

Not an eslint config problem. Remaining `no-unused-vars` errors (180 assets / 104 functions)
are real lint debt, unrelated. Same pattern will hit any Avada repo on eslint 6 + Node 22.
