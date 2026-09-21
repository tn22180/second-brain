---
name: bot-deploy
description: What falcon-fix-bot IS and how to deploy / move / reinstall it on ANY machine in one run, sync its .env + secrets/ via GitLab CI/CD variables (push-env.sh / pull-env.sh), and the host watchdog that alerts when the container dies. Read when installing the bot on a new device, moving it between machines, rotating secrets, or when you just need to know what this project is and where it lives.
---

# falcon-fix-bot — what it is & how to deploy it

## What it is (30 seconds)

An Avada team **bug-fix bot in ONE Docker container**. Hourly it scans the Avada
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
- **Runs as**: a Docker daemon (`docker compose up -d`), one hourly loop.
- **Secrets/.env**: gitignored on disk; the canonical copy lives in that repo's
  **GitLab CI/CD variables** (see env-sync below).

## Install on ANY machine — one run

```bash
git clone https://git.avada.net/avada/seoon-team/falcon-bug-fix-agent.git falcon-fix-bot
cd falcon-fix-bot
GITLAB_TOKEN=<read_api-token> bash scripts/install.sh --start
```

`install.sh` does everything: checks Docker → (if secrets missing AND
`GITLAB_TOKEN` set) **auto-pulls .env + secrets/ from GitLab CI/CD variables** →
creates `.env` from the safe example if still absent → `docker compose build` →
installs the host watchdog for the OS → `docker compose up -d`. Idempotent; re-run
any time (doubles as a repair tool). Without `--start` it stops before launching.

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

## Host watchdog (container-death alert)

The bot can't report its own death, so a host-side watchdog does — it lives
OUTSIDE Docker on purpose. `install.sh` installs it per OS:

- macOS: launchd `com.falcon-fix-bot.watchdog` (every 5 min).
- Linux: a `*/5 * * * *` crontab line running `scripts/watchdog.sh`.

Container missing → one Slack alert to `OPS_CHANNEL`; back up → a recovery note
(a marker file dedupes). Re-install manually with
`scripts/com.falcon-fix-bot.watchdog.plist` (macOS) or the cron line (Linux).

## Operate (once installed)

```bash
docker compose up -d                     # hourly daemon
touch data/state/PAUSED                  # emergency stop (rm to resume)
docker compose build && docker compose up -d   # after ANY code change
npm test                                 # must stay green
```

`.env` starts at whatever was pushed (currently production). On a fresh machine
meant for testing, edit `.env` (DRY_RUN=1 / TEST_MODE=1) after pull, before
`--start`. Rollout phases + every flag: [[falcon-fix-bot]] §phases.
