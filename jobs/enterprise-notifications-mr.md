# MR descriptions — feat/enterprise-slack-alert

Paste into the MR body. Both branches target `master`, tick "delete source branch".

---

## avada/seo — `feat(alerts): Slack alert when an Enterprise shop subscribes or logs in`

Two Slack alerts to a CS channel, modelled on the existing 1-star login alert: one when a shop
**crosses up into** the Enterprise tier, one when an Enterprise shop is **online**.

- **Tier from `shop.plan`**, not a Crisp tag — no cron, no hand-tagging, no 24h lag, no shop missed.
- **Alert A** fires from `afterCharge` on `isEnterprisePlan(plan) && !isEnterprisePlan(oldPlanId)`.
  Both values come from `ctx.state.charge`; the shop snapshot is still stale there. No dedup — one
  charge is one event.
- **Alert B** fires from `buildPostLoginTasks`, embed-only, deduped **once per shop per UTC day**
  via a new `enterpriseAlerts` collection. Fail-open: a dedup read that errors still sends.
- **Crisp link** resolved live by domain, then filtered on this app's segment — the Crisp website is
  shared across every Avada app, so a text match alone can point CS at another product's
  conversation. Bounded at 5s; the `crisp-api` client sets no deadline of its own.
- Neither alert can break its host: both swallow, and `afterLogin` / `afterCharge` each have their
  own outer try/catch. Worst case is a missing or duplicated Slack message.

Feature doc: `docs/features/enterprise-alerts.md`.

**Heads-up, not part of this MR:** the reachable Crisp credential answers `404 not_subscribed`. If
production's is the same, this app will never render a Crisp link — and `syncCrispOneStarShops` is
already failing silently for the same reason.

### What CS sees

```
🚀 *[Avada SEO]* Acme (acme.myshopify.com) is now on *Enterprise* (enterprise_23), previously pro_22.
*Email:* owner@acme.com
*Billing interval:* yearly
*Crisp:* Open conversation
@channel

💎 *[Avada SEO]* Acme (acme.myshopify.com, plan: enterprise_23) — an *Enterprise* customer — is online now.
*Email:* owner@acme.com
*Crisp:* Open conversation
@channel
```

Verified by posting the real service output to the channel and reading it back through
`conversations.history` — Slack's own parse confirms the bold runs, both links and
`broadcast:channel`.

### Before merging

`SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S` must be set in the staging and production function config.
Unset, both alerts fall back to `SLACK_CS_CHANNEL_ID` — degraded, not broken. The bot is already
invited to the channel; without that, `chat.postMessage` answers `channel_not_found` on a valid id.

---

## avada/avada-image-optimizer — `feat(alerts): Slack alert when an Expert-tier shop subscribes or logs in`

Same feature as the SEO app's MR, against this app's top tier (`expert`). Both alerts land in one
channel and are byte-identical apart from the app label, so CS reads them as one system.

- **Tier test is `getBasePlan(plan) === EXPERT`**, never a raw `=== EXPERT` — plan ids carry a
  `_partner` suffix, and a bare comparison silently misses every `expert_partner` shop. Partner
  accounts do fire, tagged `(partner)` so a comped account does not read as a real sale. Regression
  test included.
- **Alert A** from `afterCharge`, **Alert B** from the post-login task list, deduped once per shop
  per UTC day via a new `enterpriseAlerts` collection. Fail-open.
- **Crisp link** from `shop.crispSessionId` (written by the frontend on `session:loaded`), so a shop
  that never opened the chat widget gets no link — expected, not a bug.
- `postSlackMessage` has no fetch deadline and one caller sits on the billing path, so the send is
  wrapped in a 5s bound here rather than editing the shared client, which has other callers.

**Note for the reviewer:** one hunk in `loginService.js` is a prettier reflow of an untouched line —
the base version already failed prettier and the pre-commit hook rewrote it.

**Security finding, out of scope, needs rotation:** `packages/functions/src/services/config/crisp.js`
carries a hardcoded Crisp API key, committed since `e8d17aab`. The same key is in `blogs`,
`ai-product-copy` and `llm-ai-search-seo`. Not touched here — deleting the line does not unburn it.

### What CS sees

```
🚀 *[App Plaza]* Acme (acme.myshopify.com) is now on *Enterprise* (expert), previously pro.
*Email:* owner@acme.com
*Billing interval:* yearly
*Crisp:* Open conversation
@channel

💎 *[App Plaza]* Acme (acme.myshopify.com, plan: expert) — an *Enterprise* customer — is online now.
*Email:* owner@acme.com
*Crisp:* Open conversation
@channel
```

### Before merging

Same `SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S` requirement as the SEO MR.
