fingerprint: m3fuu4
service: syncsubscribeactivecharge
message: [seoService:setBundleState] <http://lukas-st.myshopify.com|lukas-st.myshopify.com> apc Request failed with status code 409
app: BLOG
repo: blogs
date: 2026-10-01T07:11:04.799Z
status: fix_disabled
attempt: 1

# BLOG · syncsubscribeactivecharge · m3fuu4

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate/recurrence of recorded fingerprints 4mbx6l and 7nba8f, now firing from the daily syncSubscribeActiveCharge resend sweep: AI Product Copy rejects every ACTIVE bundle push from blog with HTTP 409 BUNDLE_NOT_BILLING_APP because the identity APC resolves from the single app-level token blog presents is not 'blog', so 3 blog-billed bundle stores are charged $49 and never get APC Pro, and refreshBundleApps re-pushes the same rejected state once a day forever.

**Mechanism.** 02:45–03:15Z window: no request log at all (requests=0) — nothing failed HTTP-side; the 2 alerted ERRORs come from the gen1 cron service syncsubscribeactivecharge. subscribeActiveCharge → resendPendingBundles → refreshBundleApps (handlers/pubsub/subcribeActiveCharge.js:65). refreshBundleApps (allInOneService.js:332) only fires for a bundle this app bills (billingApp === APP_SELF = 'blog') whose apps map still holds a pending sibling, and only once lastAttempt is older than DAY_MS — which is exactly the cadence in the logs: lukas-st/lula-bye at 2026-09-29T02:49/02:56Z (api, first purchase), 09-30T03:00:39Z (this alert), 10-01T03:30:44Z; hhwings at 09-29T03:35Z (apisa), 09-30T04:00Z, 10-01T04:01Z. 9 of 9 attempts, 3 of 3 shops: seo {isActivated:true,isInstalled:true}, apc {isActivated:false,error:'Request failed with status code 409'} (allInOneService.js:198 log). Each attempt is activateBundle → broadcast (allInOneService.js:194) → setBundleState posting {status:'active',billingApp:'blog',...} to https://ai-product-copy.firebaseapp.com/proxy/apc/all-in-one/state with header X-SEO-Access-Token = AVADA_AI_PRODUCT_COPY_PRO_ACCESS_TOKEN (seoService.js:241,256) — one app-level APC key, not a per-caller key. The APC side names the refusal explicitly; run against --project=ai-product-copy, `timestamp>="2026-09-28T00:00:00Z" AND textPayload:"receiveBundleState"` returns exactly 27 lines, 9 per shop for the same 3 shops, every one of them: `[receiveBundleState] lukas-st.myshopify.com BUNDLE_NOT_BILLING_APP Error: BUNDLE_NOT_BILLING_APP ... code: 'BUNDLE_NOT_BILLING_APP', status: 409`, from /workspace/lib/services/allInOneService.js:294 reached through middleware/requireSiblingApp.js — so auth passed (not 401) and the token mapped to a sender identity, but that identity !== the 'blog' blog sends as billingApp. Blog's own mirror of that rule is allInOneService.js:268 (`!sender || state.billingApp !== sender` → 409 BUNDLE_NOT_BILLING_APP); the other 409 at line 272 (BUNDLE_ALREADY_BILLED_HERE) is not the code APC returned. Asymmetry proves it is the blog→APC identity, not the bundle contract: the identical payload is accepted by SEO 9/9, APC→blog pushes are accepted by blog every 30 min (`[allInOneService:applyRemoteBundleState] ... active apc`, 200), and APC's own inbound /proxy/apc/all-in-one/state tally for 09-28→10-01 is 27×409 vs 5×200, where all 5 200s cluster at 09-29T02:24–02:32Z around blog's cancelBundle (status 'none' takes the ignore path, not the billingApp check). Three aggravators on this side: retryBundleCall (seoService.js:268) retries a deterministic 4xx 3 times, so 3 sweeps × 3 shops become 27 APC requests; setBundleState logs only e.message (seoService.js:309), discarding the response body that carries BUNDLE_NOT_BILLING_APP — which is why the alert cannot say what was refused; and broadcast records the failed leg as {isActivated:false,error} without throwing (allInOneService.js:100), so the charge stands and the sweep repeats daily with no escalation. The exact APC-side key→sender mapping is in the ai-product-copy repo, not verifiable here.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subcribeActiveCharge.js:65` — the alerted service's entry into the resend path — resendPendingBundles calls refreshBundleApps for every non-cancelled bundle shop
- `packages/functions/src/services/allInOneService.js:332` — refreshBundleApps: re-broadcasts any bundle still holding a pending sibling once DAY_MS has passed, which is the 24h cadence seen 09-29 → 10-01
- `packages/functions/src/services/allInOneService.js:194` — activateBundle broadcasts {status:'active', billingApp:'blog'} to both siblings — the call APC answers 409 to
- `packages/functions/src/services/seoService.js:256` — the outbound identity: X-SEO-Access-Token is the destination app's own key, so APC gets no per-caller 'blog' identity
- `packages/functions/src/services/seoService.js:241` — that key is the single AVADA_AI_PRODUCT_COPY_PRO_ACCESS_TOKEN env value for the whole APC endpoint
- `packages/functions/src/services/allInOneService.js:268` — blog's mirror of the rule APC enforced: billingApp !== sender → 409 BUNDLE_NOT_BILLING_APP (the code APC's stack printed)
- `packages/functions/src/services/allInOneService.js:272` — the other possible 409, BUNDLE_ALREADY_BILLED_HERE — ruled out by APC's own logged code
- `packages/functions/src/services/seoService.js:309` — the alerted log line: records e.message only, dropping the 409 body that names BUNDLE_NOT_BILLING_APP
- `packages/functions/src/services/seoService.js:268` — retryBundleCall retries a deterministic 409 three times — 9 pushes became 27 APC requests
- `packages/functions/src/services/allInOneService.js:100` — the failed leg is stored as {isActivated:false,error} and never thrown, so the merchant keeps paying while APC stays un-granted

## Evidence
- 2 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[seoService:setBundleState]" AND timestamp>="2026-09-30T02:45:00Z" AND timestamp<="2026-09-30T03:15:00Z"`
- 9 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[seoService:setBundleState]" AND timestamp>="2026-09-01T00:00:00Z"`
- 9 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[allInOneService:activateBundle]" AND timestamp>="2026-09-01T00:00:00Z"`
- 30 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[allInOneService:applyRemoteBundleState]" AND timestamp>="2026-09-30T02:00:00Z" AND timestamp<="2026-10-01T05:00:00Z"`
- 1 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[allInOneService:cancelBundle]" AND timestamp>="2026-09-28T00:00:00Z"`

## Job
- analyze rounds: 2
- cost: $4.33

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
