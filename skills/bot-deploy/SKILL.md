---
name: bot-deploy
description: What falcon-fix-bot IS and how to deploy / move / reinstall it on ANY machine in one run — natively under launchd (the default since 2026-09-22) or in Docker (the rollback) — sync its .env + secrets/ via GitLab CI/CD variables (push-env.sh / pull-env.sh), and the host watchdog that alerts when the daemon stops. Read when installing the bot on a new device, moving it between machines, rotating secrets, or when you just need to know what this project is and where it lives.
---

# falcon-fix-bot — what it is & how to deploy it

## What it is (30 seconds)

An Avada team **bug-fix bot**, one hourly loop. Hourly it scans the Avada
Slack support channels (seo-suite-support + blog-support), and for the 5 tracked
apps (`seo`, `blogs`, `ai-product-copy`, `llm-ai-search-seo`, `image-optimizer`):
diagnoses each reported bug from real evidence (Slack thread, Crisp transcript,
live Shopify data, Firestore prod logs, the app's code + FSD), then **auto-fixes
high-confidence bugs** (branch → MR → techlead review/merge → gated production
deploy) or **tags the responsible dev** for everything else. A deterministic Node
orchestrator owns all control flow; `claude -p` is called only for 4 bounded jobs
(select / diagnose / fix / learn) and never drives git/merge/deploy — code gates do.

- Source of truth for behaviour: sibling skills [[falcon-fix-bot]] (overview),
  [[bot-safety-gates]], [[bot-pipeline-internals]], [[bot-edge-cases]].
- Full flow in Vietnamese for reviewers: `docs/FLOW-VI.md`.

## Where it lives

- **Code + history**: GitLab `avada/seoon-team/falcon-bug-fix-agent` (main), on
  the self-hosted **https://git.avada.net** — the whole `avada` group moved off
  gitlab.com on 2026-08-18. Project PATHS were unchanged by the move; only the
  host differs, and it now lives in exactly one place: `config/config.json`'s
  `gitlabHost` (env override `GITLAB_HOST`), resolved by `src/gitlab-host.js`.
  Clones already on disk are re-pointed automatically at startup
  (`git.js#syncRemoteUrl`), so a host move needs no `rm -rf data/repos`.
- **Runs as**: a **native launchd daemon** on the operator's Mac
  (`com.falcon-fix-bot.daemon`), one hourly loop. Docker is kept as the rollback
  path, not the default — see "Runtime" below.
- **Secrets/.env**: gitignored on disk; the canonical copy lives in that repo's
  **GitLab CI/CD variables** (see env-sync below).

## Runtime: native launchd (default) vs Docker (rollback)

The container had `node`, `git` and `curl` and nothing else — no yarn, no
installed dependencies — so a **fix session could never run the test suite it
was supposed to prove the fix with**. That, plus the 2026-08-23 outage where the
macOS Docker VM wedged and took the bot down for 2.5 days unnoticed, is why the
default runtime is now the host itself.

What the move does NOT do is hand the sessions the operator's credentials:

- The daemon runs with **its own `HOME`** (`<runtime>/home`), not the operator's.
  Measured 2026-09-22: under the real `HOME` every session inherits the
  operator's SessionStart hooks and memory files — unrequested prompt on every
  diagnose and every fix, steering a session whose output a fail-closed regex
  parses. With its own HOME the same probe comes back clean.
- Each session runs under a **default-deny allowlist** (`src/permissions.js`),
  not `--dangerously-skip-permissions`. See [[bot-safety-gates]].
- The bot's own tools keep using the service accounts in `secrets/`, unchanged.

## Install on ANY machine — one run

**macOS (native, default):**

```bash
git clone https://git.avada.net/avada/seoon-team/falcon-bug-fix-agent.git ~/Projects/falcon-fix-bot
cd ~/Projects/falcon-fix-bot
GITLAB_TOKEN=<read_api-token> bash scripts/pull-env.sh
bash scripts/install-native.sh            # add --start to launch it too
```

`install-native.sh` preflights (TCC, node ≥22, the real `claude` binary, yarn,
secrets, `.env`), builds `bin/` symlinks for the toolchain, `npm install`s, runs
the **test suite and refuses to install if it is red**, renders both launchd
plists from their templates, and refuses to start while the Docker container is
still up (two daemons on one `data/state` double-post and double-MR).

**The runtime must not live under `~/Documents`, `~/Desktop` or `~/Downloads`.**
launchd gets no TCC access to those, and the grant is lost whenever the binary is
replaced by an update — the installer fails fast on this rather than letting it
surface weeks later as EPERM.

**Docker (rollback / non-macOS):**

```bash
GITLAB_TOKEN=<read_api-token> bash scripts/install.sh --start
```

`install.sh` checks Docker → (if secrets missing AND `GITLAB_TOKEN` set)
**auto-pulls .env + secrets/ from GitLab CI/CD variables** → creates `.env` from
the safe example if still absent → `docker compose build` → installs the host
watchdog → `docker compose up -d`. Idempotent; re-run any time.

## Env / secrets sync (GitLab CI/CD variables)

The whole `.env` + `secrets/` tree is mirrored into the repo's CI/CD variables so
no machine ever needs a manual `scp`:

```bash
GITLAB_TOKEN=<maintainer-token> bash scripts/push-env.sh   # upload from a machine that HAS the secrets
GITLAB_TOKEN=<read_api-token>   bash scripts/pull-env.sh   # restore on a new machine (0600, byte-perfect)
```

- Variables are `file`-type, `protected` (only main-branch pipelines can use
  them; the API pull reads them with a token), `masked=off` (multi-line SA JSONs),
  `raw` (a `$` in a token is never expanded). Naming: `FFB_DOTENV`, `FFB_FILE_<n>`,
  and `FFB_MANIFEST` (maps `<n>` → `secrets/<relpath>`).
- After **rotating any secret**, re-run `push-env.sh` so the store stays current.
- **SECURITY**: this concentrates every bot secret (Slack/GitLab/Claude tokens,
  Shopify AES keys, Firestore SAs) in the project's CI/CD variables — anyone with
  Maintainer+ on the repo, or a leaked `read_api` token, can read them. Keep the
  repo's member list tight; prefer a scoped project-access token for pulls.

## Host watchdog (daemon-death alert)

The bot can't report its own death, so a separate 5-minute job does — outside the
bot's own process on purpose. `install-native.sh` / `install.sh` install it:

- macOS: launchd `com.falcon-fix-bot.watchdog`.
- Linux: a `*/5 * * * *` crontab line running `scripts/watchdog.sh`.

Natively there is no `docker ps` to ask, and **launchd answers the wrong
question** — a job wedged inside node is still "loaded". Liveness is proven by
two files the daemon touches itself, either one being fresh:

| file | written by | while |
|---|---|---|
| `data/state/daemon-heartbeat` | `daemonLoop` (`main.js`) | sleeping between runs |
| `data/state/LOCK` | `startLockHeartbeat` | a run is in flight, every 60s |

Both are needed: the beat stops during a run, the lock only exists during one. A
long legitimate run (big backlog, 15-min deploy polls) must not read as dead.
States: `loop-dead` (job loaded, nothing beating — or the beat's recorded pid is
gone) and `job-unloaded` (launchd has never heard of it) — a changed reason
re-alerts, because it changes the fix. A marker file dedupes the rest.

The plists are **rendered from `*.plist.template`** by the installer. The old
committed watchdog plist carried a previous operator's home directory, which
loads without error and then watches a directory that does not exist.

## Operate (once installed)

```bash
touch data/state/PAUSED                  # emergency stop, no unload (rm to resume)
launchctl kickstart -k gui/$(id -u)/com.falcon-fix-bot.daemon   # restart, e.g. after a code change
launchctl bootout   gui/$(id -u)/com.falcon-fix-bot.daemon      # stop
tail -f data/logs/daemon.out.log         # what it is doing
npm test                                 # must stay green
```

A code change needs `git pull` + a `kickstart`; there is no image to rebuild.
Rollback to Docker: `launchctl bootout gui/$(id -u)/com.falcon-fix-bot.daemon &&
docker compose up -d` — never both at once, they share `data/state`.

`.env` starts at whatever was pushed (currently production). On a fresh machine
meant for testing, edit `.env` (DRY_RUN=1 / TEST_MODE=1) after pull, before
`--start`. Rollout phases + every flag: [[falcon-fix-bot]] §phases.
