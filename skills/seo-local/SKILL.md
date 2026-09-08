---
name: seo-local
description: Start the Avada SEO app locally in a git worktree and report the URLs that actually answer. Use when Tony says "start local test", "chạy local", "start local", "khởi động local", "test local phát", "dựng local lên", or asks for the local emulator/app links for this repo. Covers seeding the gitignored dev files, building packages/functions and the assets bundle, starting the Firebase emulators, and probing every endpoint before reporting. Only for the avada-seo repo and its worktrees.
---

# Start Avada SEO locally

Run this in an avada-seo worktree. Every step is verified before the next one; report
what actually answered, never what should answer.

## Preconditions

Confirm the worktree first — `git rev-parse --path-format=absolute --git-common-dir` must be
`/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo/.git`. If it is not, stop and say so.

## Steps

### 1. Seed the gitignored dev files

```bash
seo-seed-worktree <worktree-root>
```

Idempotent, never overwrites. Seeds `packages/functions/.env` and
`packages/functions/serviceAccount.development.json` as symlinks to the master checkout, and
`.env`, `.env.seo-tony`, `shopify.app.seo-tony.toml`, `.shopify/project.json` as copies. The
SessionStart hook already runs this, so it is usually a silent no-op.

### 2. Build `packages/functions`

```bash
yarn workspace @avada/functions run development     # babel src -> lib, ~5s, 1198 files
```

Not optional. `packages/functions/package.json` has `main: lib/index.js` and
`firebase.devmacos.json` ignores `**/src/**`, so the emulator loads the babel output. With no
`lib/`, every function fails to load. `seo-seed-worktree --build` does the same thing but skips
when `lib/index.js` is newer than every file under `src/`.

### 3. Build the assets bundle

```bash
yarn workspace @avada/assets run production        # embed + standalone
```

`vite.config.js:275` sets `outDir: '../../static'`, and `firebase.devmacos.json` serves hosting
from `static/`. Without it, `http://127.0.0.1:5002/` returns 404 — the `**` rewrite points at
`/standalone.html`, which does not exist yet. Use `production:embed` alone when only the embedded
admin matters.

### 4. Start the emulators

```bash
yarn emulators-macos                               # run in background
```

Wait for the literal line `All emulators ready`. Watch for `EADDRINUSE`, `not authorized` and
`Error` too — a filter that only matches the success line stays silent through a crash. Ports:
functions 5001, hosting 5002, pubsub 8085, UI 4000.

### 5. Probe before reporting

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5002/
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5002/embed
curl -s http://127.0.0.1:5002/api/settings
```

Expected once steps 2-4 are done: UI 200, `/` 200, `/embed` 200, `/api/settings` **401** with
`Failed to parse session token 'undefined'`. That 401 is the success signal for the backend — the
route is alive and the auth middleware is doing its job; there is no session token in a bare curl.

Report the URLs in a table with the status each one actually returned.

## What this does NOT do

**Ask before starting the tunnel.** `shopify app dev` opens a cloudflare tunnel and rewrites
`application_url` in the Partner dashboard for app `SEO Tony`
(`client_id 30675452782a731fb7358d5cfa2d25b2`) — the same app the master checkout uses. Two
worktrees running it at once fight over that URL, so check `pgrep -f "shopify app dev"` first.

When Tony does ask for it, **`yarn dev-macos` fails in a worktree**:

```
Couldn't find shopify.app.toml in <worktree>
```

The CLI reads the default filename `shopify.app.toml`; the worktree is seeded with
`shopify.app.seo-tony.toml`, and `dev-macos` passes no `--config`. The master checkout's
`shopify.app.toml` is a *different app* (`Tony seo local`, `client_id ac6e5fe0...`,
api_version 2024-07) — do not copy it over. Run the config explicitly instead:

```bash
BACKEND_PORT=5002 yarn shopify app dev --skip-dependencies-installation --config seo-tony
```

It prints `Preview URL: https://admin.shopify.com/store/<store>/apps/<client_id>?dev-console=show`,
a theme-app-extension server on `http://127.0.0.1:9293`, GraphiQL on `localhost:3457`, and Vite on
`http://localhost:3000`.

The app is a Shopify embedded app, so the local URLs alone do not give a usable admin UI: that
needs the tunnel plus opening the app from the dev store's admin, which is where the session token
comes from.

## Traps

- `emulators-macos` runs only `functions,pubsub,hosting` — **no firestore emulator**. Every
  Firestore read and write goes to the real `avad-seo-staging` project. The three firestore
  triggers (`onCreateUserGen2`, `onUpdateShopGen2`, `onCreateCouponUsagesGen2`) are skipped and
  say so in the log; that is expected, not a failure.
- The service account is at `packages/functions/serviceAccount.development.json`, not the repo
  root — the emulator spawns the functions process with cwd `packages/functions`, and both
  emulator scripts pass `GOOGLE_APPLICATION_CREDENTIALS` as a relative path. Its `project_id` is
  `avad-seo-staging`; if a check ever shows `avada-seo`, stop, that is production.
- `packages/assets/vite.config.js:105` writes the live tunnel URL into
  `packages/functions/.env.local`, and the file must already exist or the dev run prints
  `Error changing the env file: ENOENT ... '../functions/.env.local'` and the backend never learns
  the tunnel URL. `seo-seed-worktree` copies it; seeding it after a run has started does not
  retro-fix that run, so restart the dev server (which also mints a new tunnel URL).
- Stop the emulators with `lsof -ti tcp:5001,5002,8085,4000 | xargs kill`. They also die with the
  session that started them.
