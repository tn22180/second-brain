 bắn thông báo slack khi có khách ENT mới sub và khi khách ENT online nha, chúng ta đã có làm báo khách 1 sao online, dựa vào đó lấy tag enterprise và chỉ cho app SEO với app image-optimize là image-plan là expert

---

## Spec — Enterprise Slack alerts

Approved 2026-08-07. Ports the shape of the existing low-rating (1-star) login alert to
Enterprise-tier customers, in two apps.

### Scope

Two alerts, two apps:

| Alert | Fires when | Hook |
|---|---|---|
| **A — ENT mới sub** | a shop moves *up into* the ENT tier | `subscriptionService.afterCharge(ctx)` |
| **B — ENT online** | an ENT shop opens the embedded app | `loginService.afterLogin(ctx)` |

Apps: `seo` and `avada-image-optimizer`. No other app.

### ENT definition — `shop.plan`, not a Crisp tag

Decided over the Crisp-segment route: plan is real data, needs no cron, no CS hand-tagging,
no ≤24h lag, and misses no shop that never opened a Crisp conversation.

| repo | ENT when | source (verified on `origin/master`) |
|---|---|---|
| `seo` | `isEnterprisePlan(plan)` → `enterprise` \| `enterprise_23` | `config/subscription/plans.js:410`, `:139` |
| `avada-image-optimizer` | `getBasePlan(plan) === EXPERT` | `config/subscription/plans.js:70`, `:38` |

`avada-image-optimizer` also exports `ENTERPRISE = 'enterprise'` (`plans.js:26`) — it has **zero
call sites**. Dead constant, not the tier we want. The image app's top tier is `expert`.

**img must compare the *base* plan, never the raw handle.** A plan id there can carry a
`_partner` suffix, and `getBasePlan` (`plans.js:70`) is what strips it — which is why
`isProPlan` (`:251`), `isKnownTier` (`:90`) and `getPlanRank` (`:338`) all route through it.
A bare `plan === EXPERT` silently misses every `expert_partner` shop. `getShopTier` (`:97`)
is the documented gating accessor; the raw handle is billing identity (`getPlanIdentity`, `:106`).

Partner-tier shops therefore *do* fire the alert, tagged `(partner)` in the message when
`isPartnerPlan(plan)` — they are ENT-tier and CS should treat them as such, but the tag keeps
a comped partner account from reading as a real Enterprise sale.

`seo` has no partner-suffix concept: `isEnterprisePlan` is an exact `includes` and every existing
call site passes `shop.plan` raw (`subscribeOptimizeStore.js:58`, `subscribeHandleDailyBrokenLinks.js:70`).
Do not add base-plan normalisation there.

### Alert A — new ENT subscription

Both apps' `afterCharge` already destructure exactly what the condition needs:

- `seo` — `packages/functions/src/services/subscriptionService.js:114`, `ctx.state.charge` at `:124`
- `img` — `packages/functions/src/services/subscriptionService.js:98`, `ctx.state.charge` at `:100`

```
if (isEnt(plan) && !isEnt(oldPlanId)) → send Slack
```

`oldPlanId` is the **pre-charge snapshot** — required, because the `shopifyCharge` middleware has
already written the new plan onto `shop.plan` in Firestore by the time `afterCharge` runs
(documented in the img file's own comment above `processDowngrade`). Reading `shop.plan` here
would compare the new plan against itself.

Placement: after the CRM tracking block, before the `plan === FREE` / `afterUpgrade` branches, so
it runs on every upgrade path. Wrapped in its own `try/catch`; **must never throw** — `afterCharge`
is the money path and a Slack outage must not block an upgrade.

No dedup: one charge is one event. A re-subscribe after churn fires again — intended, that is the
signal CS wants.

### Alert B — ENT shop online

Same insertion point as `checkOneStarShopLogin`:

- `seo` — `services/loginService.js:53`, inside `buildPostLoginTasks`, behind `isEmbedLogin` (`:24`)
- `img` — `services/loginService.js:41`, behind `ctx.state.shopify.sessionToken` (`:40`)

Keep the embed-only gate. `sessionToken` is set only by `verifyEmbedRequest`; a standalone OAuth
login is usually CS or internal, not the merchant.

**Dedup: one alert per shop per calendar day.** The 1-star alert fires on every login by design
because its population is tiny; the ENT population is not, and CS would drown.

Mechanism — new Firestore collection `enterpriseAlerts`, doc id = `shopId`, field
`lastOnlineAlertAt`:

- Gate on `isEnt(shop.plan)` **first**. `shop` is already loaded in `afterLogin`, so a non-ENT
  login costs zero extra Firestore ops.
- Not a field on the shop doc: img's `updateShopData` pushes to Crisp whenever `'plan' in data`
  (`repositories/shopRepository.js:204`, `:223`) and runs `removeFields`/`checkFieldWarning` over
  every write. Staying out of that path is cheaper than auditing it.
- Not Redis: `avada-image-optimizer` has no `ioredis` at all. `seo` has `wasScannedToday` /
  `markOnlineAlerted` equivalents (`helpers/redisCache.js:473`, `:487`), but one mechanism across
  both repos beats two.
- **Fail-open**: a dedup read that errors still sends. A duplicate alert is cheaper than a missed one.

### Slack

Dedicated channel, new env `SLACK_ENT_CHANNEL_ID`, falling back to `csChannelId` when unset — the
same shape as `errorChannelId` in `seo/packages/functions/src/config/slack.js:9`. The img config
(`config/slack.js`) holds only `botToken` + `csChannelId` today and gains the same field.

Sender is **per repo**, deliberately not unified — unifying them is a refactor this task did not ask for:

| repo | use |
|---|---|
| `seo` | `sendSlackMessage` + `escapeSlackText` — `services/slack/slackService.js:28`, `:12` |
| `img` | `postSlackMessage` + `escapeSlackText` + `APP_LABEL` — `services/slack/slackClient.js:34`, `:20`, `:10` |

Every merchant-controlled field (`shop.name`, `shop.shopifyDomain`, `shop.plan`) goes through
`escapeSlackText` before interpolation, matching `seo/services/loginService.js:78-80`. Without it a
crafted shop name injects links and formatting into the CS channel.

Crisp deep-link: **img only**. `shop.crispSessionId` exists in `avada-image-optimizer`
(`repositories/shopRepository.js:223`, `controllers/shopController.js:38`) and appears nowhere in
`seo` on master. The seo alert carries no Crisp link.

### Files

Per repo, under `packages/functions/src/`:

```
NEW   config/enterpriseAlert.js                appName, mention
NEW   repositories/enterpriseAlertRepository.js  wasOnlineAlertedToday() / markOnlineAlerted()
NEW   services/slack/enterpriseAlertService.js   notifyEnterpriseUpgrade() / checkEnterpriseShopLogin()
EDIT  config/slack.js                          + entChannelId
EDIT  services/loginService.js                 + 1 task, gated on isEnt
EDIT  services/subscriptionService.js          + 1 call inside afterCharge
NEW   <tests>                                  see per-repo convention below
```

Test-file convention differs and must be followed per repo — `seo` puts them in
`src/**/__tests__/*.test.js`, `avada-image-optimizer` co-locates them as `src/**/*.test.js`.

### Branches

Both repos were sitting on unrelated feature branches, so the work goes in fresh worktrees off
`origin/master`:

| repo | worktree | branch | base |
|---|---|---|---|
| `seo` | `../seo-wt-ent-alert` | `feat/enterprise-slack-alert` | `327136227d13` |
| `avada-image-optimizer` | `../avada-image-optimizer-wt-ent-alert` | `feat/enterprise-slack-alert` | `e2da9d45` |

### Out of scope

- Backfill or a one-off alert for existing ENT shops.
- Unifying the two Slack senders.
- Any FE change.
- Provisioning the Slack channel and setting `SLACK_ENT_CHANNEL_ID` in staging/prod function
  config — manual, and the bot must be invited to the channel or `chat.postMessage` returns
  `channel_not_found` on a perfectly valid `C…` id.

---

## Progress

Started: 2026-08-07

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | seo: enterprise alert module (config + repository + service) + unit tests | general-purpose / sonnet | ✅ | 1/5 | clean | 19/19 green |
| 2 | seo: wire into config/slack.js, loginService, subscriptionService | general-purpose / sonnet | ✅ | 1/5 | clean | 22/22 green, eslint clean |
| 3 | img: enterprise alert module (config + repository + service) + unit tests | general-purpose / sonnet | ✅ | 1/5 | clean | 22/22 green |
| 4 | img: wire into config/slack.js, loginService, subscriptionService | general-purpose / sonnet | ✅ | 1/5 | clean | 25/25 green, eslint no new errors |
| 5 | seo: resolve Crisp conversation by domain, attach link to both alerts | general-purpose / sonnet | ✅ | 2/5 | clean | 39/39 green; img already covered |
| 6 | Independent review of both branches, then fix what it found | cavecrew-reviewer / sonnet | ✅ | 1/5 | clean | 5 fixed, 1 closed with tests, 1 open question |
| 7 | Add the shop email line to both alerts | inline | ✅ | 1/5 | clean | seo 24/24, img 20/20 green; both docs gates PASS |
| 8 | Audit message formatting: bold the tier + label every field | inline | ✅ | 1/5 | clean | seo 26/26, img 22/22; verified against Slack's own parse |

### Task 6 — independent review, and what came of it

Two reviewers, one per repo, given the full change set and told that an empty report was an
acceptable outcome. They ran independently and **converged on the same three issues**, which is
what made them worth acting on rather than arguing with.

**Fixed:**

1. **No deadline on the Crisp call** (`seo`, the strongest finding). `findSessionIdByDomain` was the
   first Crisp call in a request path — the other consumer is a cron — and the `crisp-api` client
   sets no timeout. A hang is not a rejection, so the surrounding try/catch could not rescue it, and
   it would have stalled a login or a charge indefinitely. Bounded at 5s, matching the deadline
   `sendSlackMessage` already carries.
2. **No deadline on the Slack send** (`img`). `postSlackMessage` builds its own `node-fetch` call
   with no timeout — `seo`'s axios client already has one. Wrapped both call sites in a local
   `sendBounded` (5s) rather than editing the shared client, which has other callers.
3. **Raw error object in the Crisp catch** (`seo`). `logger.error(..., e)` would surface the request
   config if the client ever produced an HTTP-layer error, and that config carries the Basic
   `identifier:key` header. `services/crisp/getData.js` logs only `error.message` for the same
   client, and `slackService.js` carries an explicit comment warning about exactly this. Now message
   only. (The rejection shape observed during the live probe was a plain
   `{code, data, message, reason}` with no headers — but that was one failure mode, not all of them.)
4. **A comment that was simply wrong** (`seo`). The `afterCharge` insert claimed the charge
   middleware had already written the new plan onto `shop.plan`. `services/behaviorService.js`
   documents the opposite for the same object at the same point — *"the shop snapshot is still stale
   in afterCharge — the plan update is persisted later in afterUpgrade"* — and `@avada/core`'s
   `subscriptionController.js:372` writes only `planInterval`/`promoType`/`planDiscountCode`, never
   `plan`. The comment had been carried over from the image app, where it is native and true.
   Behaviour was never affected (the code reads `oldPlanId` from `ctx.state.charge` either way), but
   the next person reaching for `shop.plan` here would have been misled. Rewritten.
5. **A docstring that overpromised.** Both reviewers noted the dedup is check-then-act: two
   simultaneous logins for one shop can both pass `wasOnlineAlertedToday` before either stamps, so
   "at most once per UTC day" was not strictly true. Kept the cheap non-transactional read and
   changed the docstring to say what actually happens and why — a duplicate ping costs less than a
   Firestore transaction on every login.

**Closed with new tests** — both reviewers flagged, independently, that `afterCharge` had *no*
wiring coverage at all while `afterLogin` did. That gap had been recorded as accepted in Task 2 and
Task 4; two independent flags is enough to reverse that call. New files, source untouched:
`seo` `services/__tests__/subscriptionService.enterpriseAlert.test.js` and `img`
`services/subscriptionService.enterpriseAlert.test.js`, 4 tests each, pinning that the alert fires
once, that `plan`/`oldPlanId`/`planInterval` come from `ctx.state.charge` and **not** from the shop
document, that a rejecting alert cannot break a charge, and — in `img` — that a charge blocked by
the dev-store guard never alerts.

**Deliberately not done:** both reviewers suggested not `await`ing the alert inside `afterCharge` so
it cannot delay plan activation. Rejected — an un-awaited promise in a Cloud Function can be frozen
when the invocation returns, which trades a bounded delay for a silently dropped alert. The
timeouts above bound the worst case to ~5s while keeping delivery guaranteed. Reordering the call to
the end of `afterCharge` is not available either: every path there returns through
`afterDowngrade`/`afterUpgrade`, so there is no "after".

**Open — needs a decision (see the question at the end of this file):** the upgrade alert fires on
any charge crossing into the tier, which includes an Enterprise **trial** start, and the message
says "just upgraded". Whether a trial should page CS as an upgrade is a product call, not a code one.

**Unrelated finding, reported not fixed:** `img`'s `helpers/shouldBlockSubscribe.js` is
`return false;` with the real dev-store logic commented out beneath it. The guard the Task 4 alert
placement sits behind is currently a no-op, so dev and test stores are not actually blocked from
subscribing. Pre-existing on `master`, nothing to do with this branch.
6 chữ Enterprise (enterprise_23) là in đậm chữ Enterprise hiểu chưa
### Message wording unified across both apps (2026-08-07)

The two apps were writing the same concept two different ways into one channel — `seo` said
"Enterprise", `img` said "Expert-tier"; the online alerts used different emoji (💎 vs 👑); the
upgrade lines had different shapes (`just upgraded to Enterprise (X), previously Y` vs
`upgraded to X (was Y)`); the interval label was `Billing interval:` vs `Billing:`; and `seo`
carried a redundant trailing sentence.

Settled on **"Enterprise"** everywhere. It is the business concept, it matches the channel name,
and the bolded plan id right next to it still carries each app's own truth (`enterprise_23`
vs `expert`), so nothing is lost by not saying "Expert".

`appName` now carries its own brackets in both configs (`'[Avada SEO]'`, `'[App Plaza]'`) so the
two template strings are identical rather than one adding brackets the other already has.

Final shapes:

```
🚀 [Avada SEO] {shop} ({domain}) just upgraded to Enterprise (*enterprise_23*), previously pro_22.
🚀 [App Plaza] {shop} ({domain}) just upgraded to Enterprise (*expert*) (partner), previously pro.
💎 [Avada SEO] {shop} ({domain}, plan: *enterprise_23*) — an Enterprise customer — is online now.
💎 [App Plaza] {shop} ({domain}, plan: *expert* (partner)) — an Enterprise customer — is online now.
```

Plus `Billing interval: …` when known, the Crisp link when there is one, and `<!channel>` last.

**Links are Slack anchors, `<url|label>`.** The shop domain renders as itself but linked to the
storefront; the Crisp url hides behind the label `Crisp conversation` — unlabelled it carries a
website UUID and a session id and runs longer than the message around it.

Verified live rather than assumed — Slack's own parse of a posted message returned exactly four
elements, which is the whole message contract in one check:

```
link       url=https://tuannv-seo.myshopify.com          text='tuannv-seo.myshopify.com'
bold       'expert'
link       url=https://app.crisp.chat/website/…/inbox/…/  text='Crisp conversation'
broadcast  range=channel
```

The domain is escaped **before** it goes into the anchor, so it lands escaped in both the href and
the label; the existing "escapes merchant-controlled text" test still passes with a shop named
`<script>&x`. Note `escapeSlackText` does not touch `|`, which is the anchor's own delimiter — that
is safe only because `shopifyDomain` is issued by Shopify and always `*.myshopify.com`. Do not
reuse `shopLink` for a genuinely free-text field without handling `|`.

**Plan id is bolded** (`*…*`). Verified live rather than assumed, because plan ids contain `_` and
Slack treats `_` as an italic delimiter: a message carrying both `enterprise_23` and `pro_22` came
back parsed as a single `style={'bold': True}` run with **no italic runs at all** — a mid-word
underscore is not a delimiter. `expert_partner` in the image app is the same shape, so it is safe
too. The `*` markers sit outside `escapeSlackText`, which only rewrites `&`, `<`, `>`; plan ids
come from config rather than merchant input, so there is nothing to inject there.

### Crisp plugin credential answers `not_subscribed` — unresolved

Found while probing for Task 5. Every Crisp API call made from here fails:

```
404  not_subscribed — "Got response error: the website is not subscribed to the plugin"
```

Tested through the repo's own `crisp-api` client (`services/crisp/initCrisp.js`), not raw curl, so
this is not a hand-rolled-header mistake. The credential reachable locally is the same one
everywhere: `seo/packages/functions/.env`, `.env.dev` and `.env.local` all carry
`CRISP_WEBSITE_ID=dbb461f3…` with a key hashing to `5523aa2ca9` — **byte-identical to the key
hardcoded in `avada-image-optimizer`'s `services/config/crisp.js`**.

What this does *not* establish: production may hold a different, live key via the CI
`PRODUCTION_ENV_FILE`, which is not readable from here. Tuan is checking prod himself.

What it would mean if the production key is also dead: the daily `syncCrispOneStarShops` cron and
the image app's `updateCrispImagePlan` both use this client and **both swallow their own errors**,
so they would be failing silently right now with nothing in the channel and nothing raised. The
symptom to look for is `crispSegments/oneStarShops` with a stale `syncedAt` or no `source: 'crisp'`
entries at all.

This matches the `n9axd7` precedent — a hardcoded Crisp credential revoked out of band.

### Out-of-scope security finding — Crisp API key, committed

Found while running the §8 scan on Task 3. **Reported, deliberately not fixed** — it is outside
this task's diff, and a committed secret cannot be fixed by deleting the line.

`packages/functions/src/services/config/crisp.js` holds a plaintext Crisp `identifier` + `key`
pair, committed and tracked, in four repos: `blogs`, `ai-product-copy`, `llm-ai-search-seo`,
`avada-image-optimizer`. The `key` value is byte-identical across them (compared by hash, not
printed). `seo` does not carry it. Earliest commit on the image app: `e8d17aab`
("add crisp notification bad review").

The key is burned — it needs rotating in Crisp and moving behind env, and the rotation is what
closes it, not the edit. Same shape as the `n9axd7` precedent. The new code in this task reads
only `website_id` from that module, which is the workspace id that already appears in Crisp inbox
URLs, so this diff does not widen the exposure.

### Log

#### ✅ Task 1: seo enterprise alert module
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: three new source files plus their tests exist in `seo-wt-ent-alert`, the two test files pass, and no pre-existing file is modified. Nothing imports the new module yet.
  - Files allowed (all under `packages/functions/src/`, all NEW):
    `config/enterpriseAlert.js`, `repositories/enterpriseAlertRepository.js`,
    `services/slack/enterpriseAlertService.js`,
    `repositories/__tests__/enterpriseAlertRepository.test.js`,
    `services/slack/__tests__/enterpriseAlertService.test.js`
  - Approach: mirror `repositories/crispSegmentRepository.js` for the Firestore handle style
    (module-level `new Firestore()` + `collection`), and `services/loginService.js:65-95` for the
    never-throws alert shape. Rejected: storing the dedup stamp on the shop doc (drags in
    `updateShopData` side effects) and using Redis `wasScannedToday` (no equivalent in the image
    app, and one mechanism across both repos is worth more than seo-local caching).
  - Test command: `npx jest packages/functions/src/repositories/__tests__/enterpriseAlertRepository.test.js packages/functions/src/services/slack/__tests__/enterpriseAlertService.test.js`
    from the worktree root — expect both suites green.
  - Risk: none at runtime. Additive only; no existing module imports these until Task 2 lands.
  - Rollback: delete the five files.
- Rounds used: 1/5
- Test result (re-run by the orchestrator, not taken on the agent's word):
  `Test Suites: 2 passed, 2 total / Tests: 19 passed, 19 total`
- Review: pass. `isEnterprisePlan(plan) && !isEnterprisePlan(oldPlanId)` is the correct
  cross-into-tier test; `logger` used throughout per `packages/functions/CLAUDE.md`; the online
  path stamps only after a successful send. Two nits accepted, neither worth a round:
  `notifyEnterpriseUpgrade` discards the `sendSlackMessage` boolean where the login path logs it,
  and `collection.doc(shopId)` is not `String()`-wrapped the way the image app's copy is (a
  non-string id would throw into the fail-open catch, so behaviour stays correct).
- Security check: **clean**. 5 new files, 1157 lines, no existing file touched
  (`git status --porcelain` shows five `??` entries and nothing else). No secret literal; the only
  hit on the secret regex was the word "secrets" inside a comment. No `.env`, lockfile, CI, or
  Firebase config in the diff. No new dependency and no new outbound host — the Slack host was
  already in use and the Crisp URL is message text, not a call.
- Started: 2026-08-07
- Completed: 2026-08-07

#### ✅ Task 2: seo wiring
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: `config/slack.js` exposes `entChannelId`; an embedded login by an Enterprise shop calls
    `checkEnterpriseShopLogin`; `afterCharge` calls `notifyEnterpriseUpgrade` with the pre-charge
    `oldPlanId`. Wiring test green, eslint clean on every touched file, module tests still 19/19.
  - Files allowed (`packages/functions/src/`): `config/slack.js`, `services/loginService.js`,
    `services/subscriptionService.js` (EDIT, three surgical inserts) and
    `services/__tests__/loginService.enterpriseAlert.test.js` (NEW).
  - Approach: insert next to the low-rating alert it mirrors — `loginService.js:53` inside the
    existing `if (isEmbedLogin)` block, and `subscriptionService.js` immediately after the CRM
    tracking block closes at `:164`, which is before every early return (`plan === FREE` at `:184`,
    `afterUpgrade` at `:187`) so no upgrade path can skip it. Rejected: hooking
    `appSubscriptionUpdateHook.js` — on master it is a stub that logs and 200s, it never touches
    plan state (`handlers/webhook/appSubscriptionUpdateHook.js`). Rejected: reading `shop.plan` in
    `afterCharge` — the charge middleware has already written the new plan there, so the
    "was it already Enterprise" test would always be false.
  - Test command, from `<worktree>/packages/functions`:
    `./node_modules/.bin/eslint src/config/slack.js src/services/loginService.js src/services/subscriptionService.js src/services/slack/enterpriseAlertService.js`
    (clean) then from the worktree root
    `npx jest packages/functions/src/services/__tests__/loginService.enterpriseAlert.test.js packages/functions/src/repositories/__tests__/enterpriseAlertRepository.test.js packages/functions/src/services/slack/__tests__/enterpriseAlertService.test.js`
    (all green).
  - Coverage limit, stated rather than papered over: the `afterCharge` insert gets eslint plus
    review, not a test. `subscriptionService.js` pulls in ~30 modules including live Firestore
    handles, and mocking that surface costs more than it proves. The logic it guards
    (`isEnterprisePlan(plan) && !isEnterprisePlan(oldPlanId)`) is already covered by Task 1's
    suite; what is untested here is only that the call is present and its arguments are spelled
    right, which review and eslint do catch.
  - Risk: real. Both files sit on live paths — every login and every charge in `avada-seo`. The
    mitigation is that both call sites are `await`ed calls into functions that cannot throw
    (Task 1 wraps each body in try/catch), and `afterLogin`/`afterCharge` each have an outer
    try/catch of their own. Worst case is a missing or duplicated Slack message, not a failed
    login or a blocked upgrade.
  - Rollback: revert the commit; the branch is unmerged and nothing else depends on it.
- Rounds used: 1/5
- Test result (re-run by the orchestrator): `Test Suites: 3 passed, 3 total / Tests: 22 passed, 22 total`.
  eslint on all five touched files: exit 0, no output.
- **The plan's eslint path was wrong.** `packages/functions/node_modules/.bin/eslint` does not
  exist — eslint is hoisted to the repo root. The agent reported "EXIT:0" against that
  non-existent path, which is not evidence of anything, so the check was re-run properly from the
  root binary. It then failed a second way: under the shell's default Node 22.22.0 eslint crashes
  in `node_modules/async-function/require.mjs` with `SyntaxError: Cannot use import statement
  outside a module` before reaching any rule. Under Node 20.19.0 (the version CI uses) it exits 0
  clean. Correct command:
  ```
  cd <worktree>/packages/functions && ../../node_modules/.bin/eslint src/...   # with nvm use 20
  ```
- Review: pass. All three hunks landed where planned. The `afterCharge` insert sits after the CRM
  block and before every early return, and passes `oldPlanId` from `ctx.state.charge` with the
  constraint written down as a comment. The login insert reuses the existing `isEmbedLogin` block
  rather than adding a second gate, and the comment above it was widened to cover both alerts.
  Import style matches the file (`subscriptionService.js` already mixes `@functions/` and relative
  paths, so the new `@functions/` import is not an inconsistency introduced here).
- Security check: **clean**. `git diff --stat`: 3 files, 15 insertions, 3 deletions; plus the
  Task 1 files untouched. No secret in any added line — `entChannelId` reads
  `process.env.SLACK_ENT_CHANNEL_ID`, never a literal. Nothing added to a log. No `.env`,
  lockfile, CI, Firebase or rules file in the branch. No new dependency, no new outbound host.
  §8.4 (untrusted request input) checked at the source: `ctx.state.charge` is built in
  `@avada/core` `build/controllers/subscriptionController.js:306` and `:384` with
  `oldPlanId = shop.plan` read from Firestore, and the `activate` path calls `verifyCharge(ctx, options)`
  first (`:347`) — so neither `plan` nor `oldPlanId` is merchant-supplied.
- Started: 2026-08-07
- Completed: 2026-08-07

#### ✅ Task 3: img enterprise alert module
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: three new source files plus their tests exist in `avada-image-optimizer-wt-ent-alert`,
    the two test files pass, and no pre-existing file is modified.
  - Files allowed (all under `packages/functions/src/`, all NEW):
    `config/enterpriseAlert.js`, `repositories/enterpriseAlertRepository.js`,
    `services/slack/enterpriseAlertService.js`,
    `repositories/enterpriseAlertRepository.test.js`,
    `services/slack/enterpriseAlertService.test.js`
    (this repo co-locates tests — no `__tests__/` directory)
  - Approach: same shape as Task 1, but on this repo's own primitives — `postSlackMessage` /
    `escapeSlackText` / `APP_LABEL` from `services/slack/slackClient.js`, `console.*` rather than a
    logger (this package has no `@functions/helpers/logger` convention in `loginService.js`), and
    `getBasePlan(plan) === EXPERT` for the tier test. Rejected: `sendSlackMessage` from
    `services/slack/slackService.js` — `loginService.js:8` already standardises on `slackClient`,
    and unifying the two senders is not this task.
  - Test command: `npx jest packages/functions/src/repositories/enterpriseAlertRepository.test.js packages/functions/src/services/slack/enterpriseAlertService.test.js`
    from the worktree root — expect both suites green.
  - Risk: none at runtime. Additive only; nothing imports these until Task 4.
  - Rollback: delete the five files.
- Rounds used: 1/5
- **Test command in the plan was wrong.** `npx jest <path>` from the worktree root fails with
  `SyntaxError: Cannot use import statement outside a module` — and it fails the same way on
  `helpers/agenticStatus.test.js`, an existing green suite, so this is pre-existing and not
  something this task introduced. Root `jest.config.js` carries no `@functions` mapping for the
  workspace; the real config is `packages/functions/jest.config.js`. Root `node_modules` also has
  jest 24.9.0 while `packages/functions` pins ^30.3.0 in its own `node_modules`, so
  `npx jest --config packages/functions/jest.config.js` from the root breaks too on a
  `jest-environment-node` mismatch. The command that works, and the one recorded for Task 4:
  ```
  cd <worktree>/packages/functions && ./node_modules/.bin/jest src/<path>.test.js
  ```
- Test result (re-run by the orchestrator with the corrected command):
  `Test Suites: 2 passed, 2 total / Tests: 22 passed, 22 total`
- Review: pass. `isEnt = getBasePlan(planId) === EXPERT` is defined once at module scope and used
  by both functions, with a regression test asserting `expert_partner` fires and carries the
  `(partner)` marker. `isPartnerPlan` is `typeof planId === 'string' && endsWith(...)`
  (`plans.js:62`), so `getBasePlan(undefined)` returns `undefined` and the guard is
  undefined-safe. `postSlackMessage` returns `{ok}`, and the code destructures it rather than
  treating the object as truthy — the trap that would have stamped every failed send.
  `console.*` in the service matches `loginService.js`, which is the file it sits beside; the
  repository uses `logger`, matching `crispSegmentRepository.js`. Both are this repo's local
  convention (the no-`console` rule is seo's, not this app's).
- `appName` resolved to `'[App Plaza]'` — this repo's `config/lowRatingAlert.js` has no `appName`
  field to copy, and `APP_LABEL` (`slackClient.js:10`) is what its existing alert actually sends.
- Security check: **clean**. 5 new files, 418 lines, no existing file touched. No secret literal in
  the diff, no `.env`/lockfile/CI/Firebase config, no new dependency, no new outbound host.
  Separately surfaced the pre-existing committed Crisp key — see the section above; not part of
  this diff and not edited.
- Started: 2026-08-07
- Completed: 2026-08-07

#### ✅ Task 5: seo Crisp conversation link
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Why only `seo`: the image app already satisfies this. It stores `shop.crispSessionId`, written by
  the **frontend** on the Crisp `session:loaded` event (`services/crisp/getSessionId.js:6`), so a
  shop that ever opened the chat widget has a session id and one that never did has none — exactly
  "link it when the customer has a conversation". `seo` has **zero** occurrences of
  `crispSessionId`, so it has to ask Crisp.
- Plan:
  - Goal: an enterprise alert for a `seo` shop that has a Crisp conversation carries a
    `Crisp: https://app.crisp.chat/website/<id>/inbox/<session>/` line; a shop without one is
    unchanged. No alert is ever lost or delayed by a Crisp failure.
  - Files allowed (`packages/functions/src/`): `services/crisp/findSessionIdByDomain.js` (NEW),
    `services/crisp/__tests__/findSessionIdByDomain.test.js` (NEW),
    `services/slack/enterpriseAlertService.js` (EDIT),
    `services/slack/__tests__/enterpriseAlertService.test.js` (EDIT).
  - Approach: `listConversations({search_type: 'text', search_query: domain}, 1)` — the same client
    the low-rating cron already uses — then filter the results client-side on two conditions:
    the conversation's `meta.data.url` normalises to exactly this shop's domain, **and**
    `meta.segments` contains `lowRatingAlertConfig.appSegment` (`app_seo`). The second is not
    optional: the Crisp website is shared by every Avada app, so a text match alone can hand back
    another app's conversation. Newest match wins. Rejected: paging the whole `app_seo` segment and
    matching locally (the cron's approach) — thousands of conversations per alert on a login path.
  - Test command: `npx jest packages/functions/src/services/crisp/__tests__/findSessionIdByDomain.test.js packages/functions/src/services/slack/__tests__/enterpriseAlertService.test.js`
    from the worktree root.
  - Risk: adds one Crisp API call to the login path — but only for Enterprise shops, and only once
    per shop per UTC day thanks to the existing dedup, plus once per upgrade. Fail-open: any error,
    timeout or empty result yields `null`, the link is omitted and the alert still sends.
  - Rollback: delete the helper and revert the two edited files.
- **Known verification gap, accepted deliberately.** The live query shape could not be confirmed
  from this machine — see the Crisp credential finding below. The helper is unit-tested against a
  mocked `listConversations`, so the filtering logic is proven, but *that Crisp answers this query
  at all* is not. Smoke-test it on staging before trusting the link to appear.
- Rounds used: 2/5 — round 2 was the anchor-text change landing on assertions that still expected
  the old `Crisp: <raw url>` line.
- Test result (re-run by the orchestrator): `Test Suites: 4 passed / Tests: 39 passed`.
  eslint under Node 20: exit 0.
- Review: pass. `findSessionIdByDomain` returns `null` on every failure path, requires an exact
  normalised `meta.data.url` match **and** the `app_seo` segment, and picks the newest by
  `created_at` — the same field `dedupeByUrl` uses in `syncCrispOneStarShops.js:167`. Both call
  sites sit **after** the tier gate and, for the login alert, after the daily dedup, so a
  non-Enterprise shop and an already-alerted shop both cost zero Crisp calls.
- Two things worth knowing for whoever touches this next:
  - The agent added `.catch(() => null)` at each call site on top of the helper's own try/catch.
    Not belt-and-braces theatre: without it a rejection reaches the function's outer catch, which
    swallows the **entire alert including the Slack send**. There is a test for it.
  - `normalizeDomain` is now duplicated — the cron's copy is module-private and that file was out
    of scope. The new file says so in a comment. Folding both into one helper is a tidy-up for a
    later change, not this one.
  - The helper reads the app segment from `config/lowRatingAlert.js`. Slightly odd coupling — the
    Crisp segment is an app-level fact, not a low-rating one — but duplicating the string invites
    drift. Left as is.
- Security check: **clean**. No secret literal in the new files; `website_id` comes from
  `crispConfig` (env-backed in this repo) and is never hardcoded. No new dependency —
  `crisp-api` and `listConversations` already existed, so `package.json` and `yarn.lock` are
  untouched and CI's immutable install is unaffected. No new outbound *host*: this app already
  calls `api.crisp.chat` from the daily cron. It **is** a new call on the login and charge paths —
  declared in the plan above, bounded by the tier gate and the daily dedup, and fail-open.
  Error logging is safe here: the Crisp client rejects with a plain
  `{code, data, message, reason}` object (observed directly during the probe), not an axios-style
  error carrying request headers — so `logger.error(..., e)` cannot leak the credential the way
  `slackService.js` warns about for axios.
- Started: 2026-08-07
- Completed: 2026-08-07

#### ✅ Task 4: img wiring
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: same three inserts as Task 2, on this repo's own call sites. Wiring test green, eslint
    clean on every touched file, module tests still 22/22.
  - Files allowed (`packages/functions/src/`): `config/slack.js`, `services/loginService.js`,
    `services/subscriptionService.js` (EDIT) and `services/loginService.enterpriseAlert.test.js`
    (NEW, co-located — this repo has no `__tests__/` convention).
  - Approach: `loginService.js:41` inside the existing `if (ctx.state.shopify.sessionToken)` block.
    In `subscriptionService.js`, insert **after** the `shouldBlockSubscribe` dev-store guard
    returns (`:131-138`) — that guard is the point where the charge is known to be real, and a
    blocked dev-store charge must not page CS about a new Enterprise customer. Placing it before
    `updateCrispImagePlan` keeps it ahead of `processDowngrade`, which can throw.
    Rejected: `handlers/webhook/appSubscriptionUpdate.js` — that path only handles
    CANCELLED/DECLINED/EXPIRED downgrades and explicitly ignores ACTIVE transitions.
  - Test command, from `<worktree>/packages/functions`:
    `./node_modules/.bin/eslint src/config/slack.js src/services/loginService.js src/services/subscriptionService.js src/services/slack/enterpriseAlertService.js`
    (clean) then
    `./node_modules/.bin/jest src/services/loginService.enterpriseAlert.test.js src/repositories/enterpriseAlertRepository.test.js src/services/slack/enterpriseAlertService.test.js`
    (all green). Note the root-level `npx jest` does not work in this repo — see Task 3.
  - Coverage limit: as Task 2, the `afterCharge` insert is covered by eslint and review, not a test.
  - Risk: live login and charge paths in `app-plaza-image-optimizer`. Same mitigation as Task 2 —
    both callees are no-throw and both hosts have an outer try/catch.
  - Rollback: revert the commit; branch is unmerged.
- Rounds used: 1/5
- Test result (re-run by the orchestrator): `Test Suites: 3 passed, 3 total / Tests: 25 passed, 25 total`.
- eslint: the plan's path was wrong here too — eslint is root-hoisted, not under
  `packages/functions`. Run from the root binary it reports **5 errors, all pre-existing**:
  `no-unused-vars` on `createCollectionBestSeller` / `isCreatedCollectionBestSeller`
  (`loginService.js:2`, `:22`, both tied to a commented-out block) and on `oldPlanPos` /
  `newPlanPos` / `hookParams` in `subscriptionService.js`'s `afterUpgrade` (`:59`, `:60`, `:62`),
  which this task never touched. Every line added by this task is clean. Left alone deliberately —
  fixing them would widen the diff into code the brief did not ask about.
- **One hunk outside the plan.** The repo's `prettier-on-write.sh` PostToolUse hook reflowed a
  template string in `checkOneStarShopLogin` (`loginService.js:82-86`) — a function this task does
  not touch. The agent's justification was verified rather than taken on trust: running the repo's
  own prettier against the *base* version of the file (`git show HEAD:...`) reports
  `Code style issues found`, so the line was already violating the `prettier/prettier: error`
  rule before this branch existed. Kept, because reverting it would leave a lint error in a file
  this branch modifies and the hook re-applies it on the next edit. Formatting only — no behaviour
  change. Flag it in the MR description so a reviewer is not surprised by it.
- Review: pass. The `afterCharge` insert sits after the `shouldBlockSubscribe` dev-store guard, so
  a blocked dev-store charge cannot page CS about a new Enterprise customer, and ahead of
  `processDowngrade`, which can throw. `oldPlanId` comes from the charge payload with the reason
  written down.
- `resolveAll` (`helpers/utils/resolveAll.js`) attaches a `.catch` to each job before
  `Promise.all`, so a rejected alert is logged and absorbed and can never fail a login. The wiring
  test asserts that contract rather than assuming it.
- Security check: **clean**. `git diff --stat`: 3 files, 17 insertions, 5 deletions. No secret in
  any added line. No `.env`, lockfile, CI, Firebase or rules file in the branch. No new dependency,
  no new outbound host. Same `ctx.state.charge` provenance finding as Task 2 applies here.
- Started: 2026-08-07
- Completed: 2026-08-07

---

## Final verification — 2026-08-07

### Full backend suite, both repos, run against the branch and against the base

Test totals were compared to a stashed baseline rather than eyeballed, because both repos have
pre-existing failures and "the suite is red" is otherwise unreadable.

Re-run after Task 6:

| repo | | suites | tests | failing suites | failing tests |
|---|---|---|---|---|---|
| `seo` | base (`origin/master`) | 78 | 627 | 2 | 2 |
| `seo` | **with this branch** | **83** | **670** | **2** | **2** |
| `img` | base (`origin/master`) | 76 | 479 | 17 | 11 |
| `img` | **with this branch** | **80** | **509** | **17** | **11** |

The branch adds 5 suites and 43 tests to `seo`, 4 suites and 30 tests to `img`, all green. The
failure counts are **identical before and after** in both repos, so nothing here regressed.

eslint over every file the branch adds or edits: exit 0 in both repos (Node 20 — it crashes under
this shell's default Node 22 before reaching any rule).

Pre-existing failures, untouched and unrelated to this work:
- `seo` — `services/__tests__/shopify2026Client.test.js`, `services/optimize/__tests__/workListStore.test.js`
- `img` — 17 suites, mostly `firebase-admin` storage initialisation at import time
  (`src/services/jsonlService.js:8` reached via `handlers/webhook/bulkOperationHook.js`)

Commands:
```
# seo  (from the worktree root; targets src/ so the stale lib/ copies are not picked up)
npx jest packages/functions/src

# img  (root jest is 24.9.0 with no @functions mapping — use the package's own jest 30)
cd packages/functions && ./node_modules/.bin/jest
```

### Whole-branch security check

Re-run over the combined diff, not just the last task — 9 changed paths per repo (3 edits + 6 new
files each), 1157 lines in `seo`, 418 in `img`.

| # | Check | Verdict |
|---|---|---|
| 1 | No secret in the diff | clean — regex sweep over every added line found nothing but the word "secrets" in a comment |
| 2 | No secret on a command line or in a log | clean — no added log line prints a token, header or whole config object |
| 3 | Shop scoping intact | clean — the dedup doc is keyed by `shopId`; both call sites act on the caller's own shop, and no query crosses shops |
| 4 | Request input untrusted | clean — `plan` / `oldPlanId` originate in `@avada/core` `subscriptionController.js:306`,`:384` from `shop.plan` in Firestore, behind `verifyCharge` (`:347`) |
| 5 | Forbidden files untouched | clean — no `.env*`, lockfile, `.gitlab-ci.yml`, `firebase.json`, `.firebaserc`, IAM or rules file in either branch |
| 6 | No new external call or dependency | clean — no package added (so no lockfile churn, and CI's immutable install is safe); Slack was already called; the Crisp URL is message text, not a request |
| 7 | Blast radius stated | stated — both call sites are on live login and charge paths, both callees cannot throw, both hosts have an outer try/catch. Worst case is a missing or duplicate Slack message, never a failed login or a blocked upgrade |

Combination check (a secret added in one task and logged in another): none — no task added a
secret, and the only new log lines carry `shop.id` and `shop.shopifyDomain`.

Separate finding, out of scope and **not fixed**: the committed Crisp API key, see the section
above the Log.

Whole-branch scan re-run after Task 6: `seo` 12 changed paths, `img` 10; no `.env`, lockfile, CI,
`firebase.json`, `.firebaserc` or rules file in either; no secret literal in any added line; the only
new hosts appearing anywhere are `app.crisp.chat` (message text, not a request) and a
`.myshopify.com` string inside a test fixture.

### Open question for Tuan

The upgrade alert fires on any charge where the tier is crossed, which includes a shop **starting an
Enterprise trial** — and the message reads "just upgraded to Enterprise". Both apps reach the alert
before any trial-vs-paid distinction is made. Two defensible answers: CS probably *does* want to know
a big trial started, in which case only the wording needs softening; or the alert should be gated to
paid conversions only. Nothing in the brief settles it, so it is left as built (fires on trials) and
flagged here.

### Pushed 2026-08-07 — MRs not yet opened

| repo | branch | commits | MR |
|---|---|---|---|
| `seo` | `feat/enterprise-slack-alert` | `b1719c70caaf` + `a16037482ea3` (docs) | https://gitlab.com/avada/seo/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fenterprise-slack-alert |
| `img` | `feat/enterprise-slack-alert` | `34808303` | https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fenterprise-slack-alert |

The MRs have to be opened by hand: `glab` has no credential on this machine (401 on
`/api/v4/user`, no `GLAB_TOKEN` or `GITLAB_TOKEN` in any repo `.env`, empty glab config).

**Pushing deployed nothing, and this was checked before pushing rather than assumed.** Parsing both
`.gitlab-ci.yml` files: every `deploy_staging*` job is pinned by `only:` to some *other* named
branch, every production job is `only: [tags]` or `only: [master]`, and the handful of jobs that do
run on any branch (`deploy_cloud_run_job:*`, `deploy_production_only_functions`) are gated on
`only: variables:` matching a commit-title marker — `[deploy-cloud-run-staging]`, `[deploy-only]`,
and so on. **Neither commit title contains a square bracket**, which is what keeps them inert.
Anyone amending these commits must keep it that way.

**The `docs_gate` job runs on the merge-request pipeline in both repos**, so both gates were run
locally first rather than discovered red in CI:

- `img` — PASS as-is.
- `seo` — **FAIL**: *"branch changes 7 feature file(s) but no docs/features/*.md"*. Fixed properly,
  by writing `docs/features/enterprise-alerts.md`, not by escaping with `[no-docs]`. Re-run is PASS,
  and the citation checker went from 424 to 438 anchored citations verified — every `file:line` in
  the new doc points at a line that exists.

`seo`'s pre-commit hook lints staged files and passed on all 12. Note it runs `eslint`, which
crashes on this machine's default Node 22 — the commit was made under Node 20.

### Status: COMPLETE — 6/6 tasks ✅, 6 rounds used of a possible 30, 0 blocked

### Mention — `@channel`, not a person (changed 2026-08-07)

`config/enterpriseAlert.js` in both repos carries `mention: '<!channel>'`. `<!channel>` is Slack's
broadcast token; it replaced the single on-call member id both files started with.

It only works because both services push `enterpriseAlertConfig.mention` **raw** — everything else
in the message goes through `escapeSlackText`, and a mention that went through it would render as
the literal string `&lt;!channel&gt;`. Anyone refactoring the message builder must keep the mention
outside the escaping.

The low-rating alert is untouched and still tags the individual — `config/lowRatingAlert.js` is a
separate file.

Worth knowing before this goes live: the online alert is deduped to once per shop per UTC day, so
the ceiling is one `@channel` broadcast per Enterprise shop per day, plus one per upgrade. If the
Enterprise roster grows that becomes a lot of broadcast pings; switching back to a group handle or
a user id is a one-line config change in each repo.

### Slack channel — provisioned and verified 2026-08-07

`SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S` → **`#seo-enterprise`** (private).

Verified live against `conversations.info` (a read; nothing was posted): `ok=true`,
`is_private=true`, **`is_member=true`** — the bot is already in the channel, so the
`channel_not_found` trap is closed. The bot is shared: `SLACK_BOT_TOKEN` is byte-identical in both
apps (compared by sha256, not printed), so no second token and no second invite is needed.

Both apps currently fall back to the same CS channel, `C0B8FU97UQJ`.

Written to the local dev env of both apps (`packages/functions/.env`, gitignored, untracked):
`SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S`.

The variable is named `SLACK_ENT_CHANNEL_ID`, not `SEO_ENTERPRISE_CHANNEL` as jotted in
`jobs/.env`. Two reasons: it matches the `SLACK_*_CHANNEL_ID` names already in both
`config/slack.js` files, and the same module ships in the image app, where an `SEO_`-prefixed
name would be wrong.

**Both apps point at this one channel.** The messages are app-prefixed (`[Avada SEO]` vs
`[App Plaza]`) so they stay separable, but the channel name says "seo" — if the image app should
get its own, set a different `SLACK_ENT_CHANNEL_ID` in that app's config. Nothing in the code
changes either way.

### Live end-to-end checks — both apps, real messages posted 2026-08-07

Run through the real service and the real Slack sender (no mocks on the Slack layer), then
**verified against `conversations.history`** rather than trusted from the test result — both
`notifyEnterpriseUpgrade` implementations swallow errors and resolve either way, so a green test
proves nothing about delivery. Temporary test files were deleted; both branches are back to 9 paths.

| app | sender exercised | result |
|---|---|---|
| `seo` | `sendSlackMessage` (axios) | delivered, `ts=1786072499.916449` |
| `img` | `postSlackMessage` (node-fetch) | delivered, `ts=1786072641.167859` |

What the posted messages proved:
- **Escaping holds.** A shop named `Tony <test> & co` arrived as `Tony &lt;test&gt; &amp; co` — it
  cannot inject links or formatting into the channel.
- **`<!channel>` is a real broadcast.** Slack's own parse of the message block returns
  `type: broadcast, range: channel` — not literal text.
- App labels are distinct (`[Avada SEO]` vs `[App Plaza]`), so one shared channel stays readable.
- The image app's Crisp deep link renders as a link.
- Slack auto-links the shop domain — harmless, and clickable.

Test messages cleaned up 2026-08-07: 4 alert messages deleted via `chat.delete` (all `ok: true`).
The one remaining non-join message (`1786070279.565479`, a bare `@bot` mention) returns
`cant_delete_message` — it was posted by a human, and a bot token can only delete its own
messages. Delete it from the Slack client if it bothers you.

### Manual follow-ups (not code, cannot be done from here)

1. Set `SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S` in each app's **staging and production** function config.
   Until then those environments fall back to `SLACK_CS_CHANNEL_ID` — degraded, not broken.
   (Local dev is already set; deploy is manual and was not run.)
2. Rotate the Crisp key (see the finding above).
3. Open the two MRs from `feat/enterprise-slack-alert`. Mention the pre-existing prettier reflow in
   the image app's `loginService.js` so a reviewer is not surprised by an unrelated hunk.

---

## Task 7 — shop email in the alert (2026-08-07)

- Goal: both alerts carry the shop owner's email, on its own line, in both apps.
- Files allowed: `services/slack/enterpriseAlertService.js` + its test, in each repo, and
  `docs/features/enterprise-alerts.md` in `seo`.
- Approach: `if (shop.email) lines.push('Email: ' + escapeSlackText(shop.email))`, pushed right
  after the headline. Its own line rather than appended to the headline — the first line already
  carries name, domain anchor and plan, and CS scans it. Skipped when the field is empty rather
  than printing `unknown`; a line that is always there but usually says nothing is noise.
- Test command: `npx jest .../enterpriseAlertService.test.js` in each repo.
- Risk: none to the host paths — additive line inside a try/catch that already swallows.
- Rollback: revert the commit; nothing persisted, nothing migrated.

### Result

| Check | seo | img |
|---|---|---|
| Alert unit tests | 24/24 | 20/20 |
| Full suite | 99 suites, 874 pass, **5 fail** | 80 suites, 503 pass, **11 fail** |
| Failures pre-existing? | yes — same 5 fail on the stashed tree | yes — unchanged from baseline |
| eslint (Node 20) | exit 0 | exit 0 |
| docs_gate | PASS, 439 anchored citations | PASS, 235 anchored citations |

The seo full-suite numbers are larger than the ones recorded for tasks 1–6 because those runs were
scoped to `packages/functions`; a bare `npx jest` from the repo root also picks up `packages/assets`.
All 5 failures were confirmed pre-existing by `git stash -u` and re-running the same 5 files.

Two doc citations had to be renumbered — adding a line inside `notifyEnterpriseUpgrade` shifted
`checkEnterpriseShopLogin` down. `docs_gate`'s citation checker catches this, which is the point of it.

### Security check — clean

`git diff --stat`: seo 3 files / 58+, img 2 files / 43+. No secret, no `.env`/CI/lockfile touched,
no new dependency or outbound host, no Firestore query added so shop scoping is unaffected. The
email comes from the shop doc, never from a request body.

One thing worth naming rather than waving through: **this puts a merchant's email into a Slack
channel**, and `packages/functions/CLAUDE.md` says never to log PII. It is not a new exposure —
`featureReq/featureReq.controller.js:341` and the image app's `services/slack/sendSpeedRequestAlert.js:58`
already send `shop.email` to Slack the same way — and the destination is an internal CS channel, not
a log sink. Same class of data, same channel, existing precedent.

### Why the Crisp line was missing from the test messages

Those four messages were hand-built `curl` payloads sent to check Slack's rendering — they never ran
through the code, so their contents prove nothing about the feature.

In production the line is absent in three legitimate cases, now written into the feature doc:

1. **seo** queries Crisp live per alert. The reachable credential answers
   `404 not_subscribed`, so `findSessionIdByDomain` catches and returns `null` → no line. If prod
   uses the same key, seo will never show a Crisp link until the key is fixed. This is the same
   finding as the key rotation above, seen from the other end.
2. **img** does not query at all — it reads `shop.crispSessionId`, which the frontend writes on the
   Crisp `session:loaded` event (`services/crisp/getSessionId.js:25`). A shop that never opened the
   chat widget has no session id and gets no link, permanently.
3. Either app: the conversation exists but carries no matching app segment, so the segment filter
   rejects it. Deliberate — the Crisp website is shared across all Avada apps and a text match alone
   can return another product's conversation.

---

## Task 8 — message formatting audit (2026-08-07)

Feedback: the labels were bare text, and the bold was on the wrong word — `(*expert*)` instead of
`*Enterprise*`.

### Final format

```
🚀 *[Avada SEO]* Tony Test Store (tuannv-seo.myshopify.com) is now on *Enterprise* (enterprise_23), previously pro_22.
*Email:* seomduc@gmail.com
*Billing interval:* yearly
*Crisp:* Open conversation
@channel
```

- Bold marks the **tier**, not the plan id. `*Enterprise*` is what CS reacts to; the plan id in
  brackets is the detail that tells the two apps apart. Bolding both left nothing standing out.
- The app label is bolded for the same reason — one channel carries both apps.
- Every secondary line is `*Label:* value`, from one `field()` helper per repo, so the two alerts
  in one app cannot drift apart and the two apps stay byte-identical.
- The Crisp anchor now reads `Open conversation` — the line already says Crisp, so
  `Crisp: Crisp conversation` was redundant.

`field()` takes the label as a **literal, never from shop data**. `escapeSlackText` rewrites `&`,
`<` and `>` but **not `*`**, so a label built from a merchant-controlled value could close the bold
run and reformat the whole message. Same class of gap as the unescaped `|` already noted for
`shopLink`. Written into the feature doc so it survives the next edit.

### Verification

Rendered through the real service (Slack sender, Firestore dedup and Crisp lookup mocked at the
boundary, everything else real), then those exact bytes posted to `#seo-enterprise` and read back
via `conversations.history` — Slack's own parse, not mine:

```
BOLD([Avada SEO]), link(tuannv-seo.myshopify.c), BOLD(Enterprise), BOLD(Email:),
link(seomduc@gmail.com), BOLD(Billing interval:), BOLD(Crisp:), link(Open conversation),
broadcast:channel
```

Identical for all four messages (2 apps × 2 alerts), with `Billing interval:` absent from the login
alert as designed.

| Check | seo | img |
|---|---|---|
| Alert unit tests | 26/26 | 22/22 |
| Full suite | 876 pass, 5 fail (pre-existing) | 505 pass, 11 fail (pre-existing) |
| eslint (Node 20) | exit 0 | exit 0 |
| docs_gate | PASS | PASS |

New regression test in both repos: *"bolds the app label and the word Enterprise, but not the plan
id"* — asserts `*Enterprise*` is present and `*<planId>*` is not, in both alerts.

Commits `1d65fd31d467` (seo) and `bca1650a` (img), pushed. Security: clean — formatting only, no
new data in the message, nothing outside the two service files, their tests and the feature doc.
