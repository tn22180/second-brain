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
- **Fix lane is off by default** (`AUTOFIX_FIX_ENABLED` unset, since 2026-08-19). The daemon
  still triages every alert and still replies in its thread with the full analysis; it does
  not push a branch or open an MR. 58 MRs sat unreviewed as of 2026-08-04 — an MR nobody reads
  is worse than no MR. Set `AUTOFIX_FIX_ENABLED=true` to turn the MR path back on.

## Install

```bash
git clone <this repo> && cd prod-error-autofix
bun install
bun run bin/autofix.ts init          # .env, cache dirs, brain skeleton, launchd plist
$EDITOR .env                         # the two Slack keys; everything else has a default
bun run bin/autofix.ts doctor        # says exactly what is still wrong
```

`doctor` is the contract. It checks the five things outside this codebase that the daemon
depends on — `claude`, `gcloud`, `git` and its credential helper, the Slack app, and a checkout
of every app repo — and refuses to say "ready" until each one answers. Every check in it is a failure that
has actually happened here; when one of them is wrong the symptom is always the same, alerts
coming back `blocked` or `inconclusive` hours later in a log nobody is reading.

`init` never overwrites: a filled-in `.env`, or a brain file LEARN has been writing to for
weeks, is kept. Re-running it is safe and reports only what it added.

### What has to exist outside this repo

**1. A Slack app, and it must be the SAME app that posts the alerts.** Bot scopes
`channels:history`, `channels:read`, `chat:write` (`groups:*` for a private channel). Verified
2026-07-30: alerts in the channel carry this bot's own user id, so "is this message from us"
cannot be answered by comparing user ids — the daemon remembers the ts of what it wrote. Two
separate apps would make its own replies look like new alerts.

**2. gcloud, authenticated as a service account.** Read access to every prod project in
`src/registry.ts`: `roles/logging.viewer`, plus `cloudfunctions.viewer` and `run.viewer` for the
deploy probes. It must be a service account, not a user credential — a user credential expires
on the org's session-length policy, and a daemon cannot answer a reauth prompt. On 2026-07-31
four alerts came back `blocked · gcloud auth` inside one half-hour window for exactly that.
Pass it to `init --service-account <email>` and it is pinned per-job in the plist, so an
interactive `gcloud` in a terminal still runs as you.

**3. A checkout of each app repo**, all under one directory, named as in `src/registry.ts`.
Point `AUTOFIX_REPOS_ROOT` at it.

**4. The alert wiring in each app.** The app must publish prod errors through
`avada-prod-error-alert` into the Slack channel — `doctor` reports which repos have the handler
and which do not. An app without it belongs out of `src/registry.ts`.

**5. Nothing for GitLab — but the remotes are HTTPS, not SSH.** MRs are opened with git push
options; no API token is used. This section used to say "over SSH", which was true before the
`git.avada.net` cutover and is not true now. Read on 2026-08-20:

| repo | `origin` (push) |
|---|---|
| `seo` | `https://git.avada.net/avada/seo.git` (`gitlab-old` still points at gitlab.com) |
| `ai-product-copy` | `https://git.avada.net/avada/ai-product-copy.git` |
| `llm-ai-search-seo` | `https://git.avada.net/avada/llm-ai-search-seo.git` |
| `blogs` | `https://gitlab.com/avada/blogs.git` |
| `avada-image-optimizer` | `https://gitlab.com/avada/avada-image-optimizer.git` |

Two of the five legitimately still live on gitlab.com, so nothing here asserts a single correct
host — `doctor` records each repo's host and flags a *change*. A checkout left pointing at a host
its project has migrated away from fetches a mirror that stopped receiving merges: pushes appear
to succeed and never reach prod, and any sweep of that tree reads last month's code with nothing
in the run looking wrong.

Authentication is the ambient credential helper's job; nothing in this codebase handles a token.
`credential.helper` resolves to `osxkeychain` then `store` — under launchd only the second is
usable without a GUI session.

### Onboarding another app

1. Wire `avada-prod-error-alert` into the app and create the prod-error log sink.
2. Add an `AppSpec` to `src/registry.ts` — `test/registry.disk.test.ts` re-derives every field
   from the repos on disk and fails if one is wrong, so a guess does not survive.
3. `bun run bin/autofix.ts init` seeds `brain/apps/<APP>.md`; leave it empty of claims. LEARN
   earns those, and `autofix brain budget` is what stops the file growing past its slice.
4. `bun run bin/autofix.ts doctor` — the new app gets its own section.

### Transport

**Polling is the chosen transport; there is no app-level token and none is wanted.** Socket Mode
would need one — a bot token gets `not_allowed_token_type` from `apps.connections.open`, checked
2026-07-30 — but it buys nothing here:

- a job takes minutes (log fetch, up to five analysis rounds, a fix, two full jest runs), so 60s of
  polling latency is noise
- polling has fewer failure modes. A dropped socket loses events, which is why the cursor backfill
  exists at all; with polling the cursor *is* the mechanism
- 1 call/60s is 1440/day against a Tier 3 method that allows 50+/minute

If Socket Mode is ever wanted, adding `SLACK_APP_TOKEN=xapp-...` (scope `connections:write`, with
`message.channels` subscribed) switches the transport with no code change. Both paths are tested.

## Running it

```
bun run bin/autofix.ts doctor                 # is this machine able to run it?
bun run bin/autofix.ts init                   # (re)generate config, dirs and the launchd plist
bun run bin/autofix.ts status                 # queue, remaining caps, last 10 incidents
bun run bin/autofix.ts dry-run alert.json     # what a given alert would resolve to, no model call
bun run bin/autofix.ts replay <fingerprint>   # rerun a stored incident, replies printed not posted
bun run bin/autofix.ts brain budget           # token size of each app's brain slice
bun run bin/autofix.ts verify                 # did the shipped fixes hold? read-only
bun run bin/autofix.ts verify --apply         # ... and write fix_verified / fix_failed
bun run bin/autofix.ts daemon                 # the listener
```

As a service. `init` writes the plist for this machine into `launchd/`; it is gitignored,
because a real one carries a home directory, a username and a service-account email.

```
cp launchd/<label>.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/<label>.plist
tail -f ~/.cache/prod-autofix/daemon.log
launchctl stop <label> && launchctl start <label>     # restart after a code change
launchctl unload ~/Library/LaunchAgents/<label>.plist # stop for good
```

**The daemon loads the code once, at start.** Editing a file changes nothing until it is
restarted — a `stop`/`start` is part of shipping, not an afterthought.

`KeepAlive` is set, so a crash restarts after 60s. **While loaded the daemon opens real merge
requests** on the next alert it does not already know about.

**On a first start, set the cursor** or it will replay the whole channel history — with ~20 alerts an
hour that is a dozen or more full pipeline runs on the strong model before it catches up. To start
from now instead:

```
bun -e 'import {buildConfig} from "./src/config"; import {Store} from "./src/state/store";
const c = buildConfig(); const s = new Store(c.paths.stateDb);
s.setCursor(c.errorChannelId, String(Date.now()/1000), Date.now()); s.close()'
```

That was done at install. Deleting the `cursor` row makes it process the backlog on next start.

## What a job does

```
alert → parse → registry → fingerprint → state machine → caps
      → gcloud logs (3 reads) → worktree from origin/<base>
      → ANALYZE (strong model, ≤5 rounds, every citation and log query verified)
      → jest baseline → FIX (cheaper model, must add a reproduce test)
      → smoke gate (no new failures, and the test fails with the fix reverted)
      → security gate (patterns over the diff, then a read-only model review)
      → git push -o merge_request.create → reply in thread → LEARN
```

Everything a job writes lives in `~/.cache/prod-autofix/`: `state.db`, `wt/`, and
`jobs/<fingerprint>/<attempt>/` holding `logs.json` and `analysis.json`. Nothing of that is in git.

## Security gate

The smoke gate answers *does it work*. Nothing before this asked *is it safe to merge with
nobody watching*, and that is a different question: a fix can pass every test while hardcoding a
token, widening an authorization check, or deleting the webhook signature verification that was
throwing in the first place. That last one is the realistic failure — the cheapest way to stop an
endpoint erroring is to stop it validating.

Two layers, both blocking, run between the smoke gate and the push:

**1. Patterns over the diff** (`scanDiff`, free, deterministic). Added and removed lines are read
separately, because they mean opposite things — scanning them together would block a diff whose
whole purpose is deleting a hardcoded key.

| on added lines | on removed lines | on paths |
|---|---|---|
| credential formats (`xoxb-`, `sk-ant-`, `AKIA…`, private key blocks, `postgres://u:p@`) | signature/HMAC verification | `.env`, service-account json |
| `rejectUnauthorized: false`, `eval`, shell interpolation | auth/authorization calls | `.gitlab-ci.yml`, `.github/workflows/` |
| `allow …: if true`, wildcard CORS, `algorithms: ['none']` | `shopId` scoping — a tenant boundary | `firestore.rules` |

Only rules with a near-zero false-positive rate are here; a gate that fires on every job gets
turned off. Nothing matches `password = …` or a name, and a control that was *rewritten* (still
present on the added side) is not counted as removed.

**2. A model review** of the same diff, read-only tools, given the root cause so it can judge
intent. The prompt sets a high bar — "would a reviewer refuse to merge this" — and says out loud
that an empty result is expected, because a reviewer that invents findings to look useful parks
every fix.

**Both fail closed.** A review that timed out, or answered with prose instead of
`{"findings": []}`, blocks — an unanswered question is not a passed review. Same stance as the
smoke gate's `no_baseline`. A blocked job parks at `inconclusive` with the work committed to its
branch, exactly like a smoke-gate failure; nothing is lost and nothing is pushed.

Tuned with `AUTOFIX_SECURITY_MODEL` (default `claude-opus-5` — a weak reviewer here costs more
than it saves) and `AUTOFIX_SECURITY_TIMEOUT_MS` (default 6m).

## Did the fix work?

The pipeline only ever hears about a fix that *failed*, and only when the same error alerts again
(`stateMachine.afterMr`). Silence is the ambiguous case: a fingerprint that stops firing looks
exactly like one whose MR was never merged. On 2026-08-04 all 58 `mr_open` rows were in that state —
unmerged, undeployed, and indistinguishable from success.

`verify` measures instead of waiting. Per fingerprint with a pushed fix:

```
probeMerge  → merged?  mergedAt?
probeDeploy → deployedAt?           (a Cloud Run job has none — it stops here, on purpose)
count(error signature, [deployedAt, now])          = after
count(error signature, equal window ending at mergedAt) = before
```

The two windows are the same length and the merge→deploy gap falls in neither: over that stretch the
fix is in git and not in prod, so it is neither a clean baseline nor a test of the fix.

| verdict | means | writes |
|---|---|---|
| `verified` | `after == 0`, `before >= 3` | `fix_verified` (terminal) |
| `regressed` | fix is live and the error is still firing | `fix_failed` → next alert re-runs |
| `improved` | cut to ≤10% of baseline but not gone | nothing — a human's call |
| `unproven` | quiet, but the baseline was too thin to mean anything | nothing |
| `too_soon` | deployed under 6h ago | nothing |
| `not_deployed` / `not_merged` / `no_signature` / `probe_failed` / `count_failed` | cannot answer | nothing |

`unproven` is the one that matters most: without it every rare bug gets filed as fixed for having
been quiet for a day.

The counted signature is the longest stretch of the alert message carrying no id, uuid, url or
number — `HTTP 500 POST /proxy/save404` counts as `POST /proxy/save404`. It is stored in
`alerts.signature` (the fingerprint is a one-way hash and cannot be inverted); rows written before
that column recover it from `brain/incidents/<fp>.md`. A message that is all identifiers yields
`no_signature` rather than a filter that would count some other error.

The daemon sweeps every `AUTOFIX_VERIFY_INTERVAL_MS` (default 6h), skipping while a pipeline is in
flight. It never posts to Slack — a sweep is a measurement, and a regression notice arriving on a
long-dead thread helps nobody.

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
