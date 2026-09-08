# MR descriptions

> **MR 2229 (`feat/enterprise-slack-alert`) is dead — close it, do not merge.** Master already
> carries this whole feature: the Enterprise alerts landed byte-identical to that branch (only three
> helpers gained `export`), and hailt shipped a Pro alert in `1ba78f5a90`, merged as
> `979f1825df` on 2026-09-04. Merging 2229 would have run `notifyProUpgrade` and
> `notifyProPlanChange` side by side and posted **two** messages for every Pro subscribe.
> What survives from it is the MR below.

---

## avada/seo — `fix(alerts): alert on BFCM bundle sales and attach the Crisp link to Pro`

Branch `fix/pro-alert-bfcm-and-crisp`, off current master. Open at
**https://git.avada.net/avada/seo/-/merge_requests/new?merge_request%5Bsource_branch%5D=fix%2Fpro-alert-bfcm-and-crisp**
— this app moved off gitlab.com on 2026-08-18 and the gitlab.com group is read-only.

Two narrow gaps in the Pro alert shipped in `!<pro-plan-slack-alert>`.

**1. A BFCM bundle produced no alert.** The gate listed the two literal Pro ids, so
`bfcm_bundle_dropshipper` and `bfcm_bundle_growth_merchant` went silent — and those are the more
valuable sale, $50 and $60 a month against `pro_22`'s $34.95. The gate is now
`nonEnterprisePaidPlans`, which is the same `proPlans` list with the Enterprise ids filtered out, so
it still cannot double-fire on an Enterprise upgrade. Two consequences, both wanted and both tested:
a bundle → `pro_22` move now reads as a move *inside* the tier and stays silent, and an
Enterprise → bundle move gets the downgrade sentence.

**2. The Crisp line was missing.** It was dropped because the credential reachable from a dev
machine answers `404 not_subscribed`. That is a dev-machine measurement; production has not been
checked, and the Enterprise alerts on the same code path already pay for the lookup. Restored, with
the reasoning written into the feature doc so the next reader does not re-derive it. `crispLink` is
exported from the Enterprise service alongside the three helpers this file already borrows.

Not touched: the downgrade sentence, the trial decision, the channel, the wording. The Enterprise
alerts are unchanged apart from one added `export`.

### What CS sees

```
🚀 *[Avada SEO]* Acme (acme.myshopify.com) is now on *Pro* (bfcm_bundle_growth_merchant), previously free.
*Email:* owner@acme.com
*Billing interval:* monthly
*Crisp:* Open conversation
@channel
```

### Verification

| Check | Result |
|---|---|
| `slack/` + `subscriptionService.enterpriseAlert` suites | 68/68 |
| `packages/functions` suite | 1243 pass, 3 fail — `shopify2026Client`, `workListStore`, `chatKeyFailover`, `detect-changed-functions`; all pre-existing on master and none imports alert code |
| eslint (Node 20) | exit 0 |
| docs_gate citations | PASS — 513 anchored checked |

Security: clean. 91 insertions over 4 files. No secret; nothing new logged; no Firestore query, so
shop scoping is unchanged; `plan`/`oldPlanId` still come from `ctx.state.charge`; no forbidden file;
no new dependency or outbound host — the Crisp lookup is a call this code path already made for
Enterprise. Blast radius: one extra bounded (5s) Crisp request per Pro charge, swallowed on
rejection, on a path whose caller already has its own try/catch.

---

## avada/avada-image-optimizer — `feat(alerts): Slack alert when an Expert-tier shop subscribes or logs in`

Open at **https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/new** — this app is still
on gitlab.com. **Unaffected by any of the above**; this MR is still live and still needs opening.

Same as the SEO app's two Enterprise-tier alerts, against this app's top tier (`expert`). The Pro
alert is SEO-only and is **not** part of this MR. Both alerts land in one
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

`SLACK_ENT_CHANNEL_ID=C0BPGHGSY3S` must be set in this app's staging and production function
config. Unset, both alerts fall back to `SLACK_CS_CHANNEL_ID` — degraded, not broken. The bot must
also be invited to the channel; without that, `chat.postMessage` answers `channel_not_found` on a
valid id.

> The SEO app no longer needs this step: `entChannelId` is already wired on master
> (`packages/functions/src/config/slack.js:12`) with the same fallback. Confirm the env var is set
> in `avada-seo` and `avad-seo-staging` if the Enterprise alerts are landing in the CS channel.
