# prod-error-autofix

Watches the `#prod-errors` Slack channel. For each new error fingerprint: reads the GCP logs,
works out the cause with evidence, fixes it, proves the fix with a test, opens an MR, and replies
in the alert's thread.

Design: `docs/specs/2026-07-30-prod-error-autofix-design.md`. Brief: `../../jobs/product-error-auto-fix.md`.

## What it will and will not do

- **Will** open an MR on its own, one per fingerprint, only when the smoke gate passes.
- **Will not** merge, deploy, or touch `package.json`, any lockfile, `.gitlab-ci.yml`,
  `firebase.json`, `.firebaserc` or any `.env`.
- **Will not** auto-fix infra errors (OOM, `no available instance`, `memory limit`). Those are
  capacity and cost decisions; it measures them, suggests a tier, and stops.
- **Will not** touch your working trees. Every fix happens in a worktree under
  `~/.cache/prod-autofix/wt`, cut from `origin/<base>`.

## Setup

Two things are needed before `daemon` does anything useful.

**1. Slack app.** Bot scopes `channels:history`, `channels:read`, `chat:write`. For Socket Mode
also an app-level token with `connections:write` and `message.channels` subscribed under Event
Subscriptions. For a private channel add `groups:history` and `groups:read`.

**2. `.env`** in this directory — gitignored, `chmod 600`:

```
SLACK_ERROR_CHANNEL_ID=C...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...       # optional; without it the daemon polls instead
```

Without `SLACK_APP_TOKEN` the transport falls back to polling `conversations.history` every 60s.
That is a supported mode, not a degraded one — the backfill path uses the same API either way.

**3. gcloud.** `gcloud auth login`, with read access to all five prod projects. A job that hits an
auth error is parked as `blocked` and replies without spending a model call.

**4. Nothing to do for GitLab.** MRs are opened with git push options over SSH. `glab` has no token
on this machine and none is needed.

## Running it

```
bun run bin/autofix.ts status                 # queue, remaining caps, last 10 incidents
bun run bin/autofix.ts dry-run alert.json     # what a given alert would resolve to, no model call
bun run bin/autofix.ts replay <fingerprint>   # rerun a stored incident, replies printed not posted
bun run bin/autofix.ts brain budget           # token size of each app's brain slice
bun run bin/autofix.ts daemon                 # the listener
```

As a service:

```
cp launchd/com.tn22180.prod-error-autofix.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tn22180.prod-error-autofix.plist
tail -f ~/.cache/prod-autofix/daemon.log
```

`launchctl unload` to stop. The plist sets `KeepAlive`, so a crash restarts after 60s.

## What a job does

```
alert → parse → registry → fingerprint → state machine → caps
      → gcloud logs (3 reads) → worktree from origin/<base>
      → ANALYZE (strong model, ≤5 rounds, every citation and log query verified)
      → jest baseline → FIX (cheaper model, must add a reproduce test)
      → smoke gate (no new failures, and the test fails with the fix reverted)
      → git push -o merge_request.create → reply in thread → LEARN
```

Everything a job writes lives in `~/.cache/prod-autofix/`: `state.db`, `wt/`, and
`jobs/<fingerprint>/<attempt>/` holding `logs.json` and `analysis.json`. Nothing of that is in git.

## The brain

`brain/` is the knowledge this project keeps so a job does not re-derive an app's layout every
time. `CORE.md` plus `patterns.md` plus **one** app file plus `index.md` are loaded per job, capped
at 6000 tokens — `brain budget` fails the build if that is exceeded.

`incidents/<fp>.md` is written after every job and loaded again only for the same fingerprint or a
near miss on the same service. `candidates.md` holds generalisations that need a second sighting
from a different fingerprint before `brain promote` will move them into an app file.

Worth knowing when reading a reply: **only `blogs` emits `severity` from its logger.** In `seo`,
`ai-product-copy`, `llm-ai-search-seo` and `avada-image-optimizer` the `prod-error-alerts` sink is
still blind to application errors, so an empty `errors` read there is expected and the alerts that
do arrive are mostly infra — which this tool reports and does not fix. Until that logger fix is
ported, expect MRs from BLOG and little else.

## Caps

One job at a time, 5 MRs an hour, 3 MRs per repo per day, 3 fix attempts per fingerprint. A cap
never suppresses the reply — the analysis still lands in the thread with the cap named, and the
next alert for that fingerprint tries the MR again.

Repeat alerts are the normal case, since a fix sits unmerged and undeployed for a while. A
fingerprint with an open MR gets one line per 24h, not a new job. Only
`merged_at < deployed_at < alert_ts` — the fix demonstrably shipped and the error outlived it —
starts another attempt.

## Tests

```
bun test ./test                                        # hermetic, no network
AUTOFIX_INTEGRATION=1 bun test ./test/integration.*    # real gcloud, git, jest, Slack reads
```

Run `bun test ./test`, not `bun test` — from the repo root the latter walks `projects/` and hangs.

The integration tests are read-only: they never post to Slack, never push, and never open an MR.
