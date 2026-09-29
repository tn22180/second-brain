fingerprint: 7nba8f
service: apisa
message: [seoService:setBundleState] <http://hhwings.myshopify.com|hhwings.myshopify.com> apc Request failed with status code 409
app: BLOG
repo: blogs
date: 2026-09-29T03:38:29.067Z
status: fix_disabled
attempt: 1

# BLOG · apisa · 7nba8f

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 4mbx6l, now on the standalone service and a third store: the blog→APC leg of the all-in-one bundle contract is broken in one direction — AI Product Copy answers HTTP 409 to every POST /proxy/apc/all-in-one/state carrying billingApp:"blog" (3 of 3 blog-billed bundle activations ever logged), so hhwings.myshopify.com was charged $49 and never got APC Pro, and Blog only records the failure instead of surfacing it.

**Mechanism.** 03:33:19.330Z GET /apiSa/subscription/shopify/subscribe/all_in_one?interval=monthly → 200 for hhwings.myshopify.com. That path runs subscriptionService.getCustomPricing, which calls askSiblingApps then assertNoBundleElsewhere + assertSiblingsReachable (subscriptionService.js:396-397); the charge was created, so APC's GET eligibility answered reachable:true and hasBundle:false — APC held no bundle at that moment. 03:35:35.542Z GET /apiSa/subscription/shopify/activate?charge_id=31751307377 → 302 (merchant approved). afterCharge → allInOneService.activateBundle broadcasts {status:'active', billingApp:'blog', chargeId:31751307377} to both siblings (allInOneService.js:194). SEO accepted (isActivated:true, isInstalled:true); APC rejected with 409, logged at seoService.js:309 as bare e.message — the response body carrying the refusal code is dropped, so the channel cannot name which refusal it was. On the mirrored logic this app runs inbound (allInOneService.js:268) the only 409 reachable for a sibling holding no bundle of its own is BUNDLE_NOT_BILLING_APP, i.e. APC does not accept 'blog' as the sender for this key; BUNDLE_ALREADY_BILLED_HERE (line 272) requires a live local bundle in APC, which its own eligibility answer 2 minutes earlier denies. The concrete shape: sender identity on the receiving side comes only from which env key matched (middleware/requireSiblingApp.js:6-8 — this app's own table has exactly two rows, seo and apc, no self row), and the check is `state.billingApp !== sender`. APC's mirror of that table must carry a blog row mapped to the token Blog sends; a missing or mis-labelled row makes sender ≠ 'blog' and 409s deterministically. Not verifiable from this repo. 409 also proves the token itself is accepted — an unknown key is 401, so AVADA_AI_PRODUCT_COPY_PRO_ACCESS_TOKEN is now set (docs/features/all-in-one-bundle.md:321 recorded it as empty) and the first three live uses of the leg all 409'd. Two aggravators on this side: retryBundleCall (seoService.js:268) retries a deterministic 4xx three times with backoff, and broadcast() records the leg as {isActivated:false, error} (allInOneService.js:98-100) without throwing, by design (docs/features/all-in-one-bundle.md:111) — so refreshBundleApps (allInOneService.js:332) re-pushes the same rejected state once a day forever while all three merchants keep paying $49.

Confidence: `high`

## Code
- `packages/functions/src/services/seoService.js:309` — the alerted log line; records only e.message, discarding the 409 body that carries the sibling's refusal code
- `packages/functions/src/services/seoService.js:268` — retryBundleCall retries any failure 3x with backoff, including a deterministic 409 that can never succeed
- `packages/functions/src/services/allInOneService.js:194` — activateBundle broadcasts {status:'active', billingApp:'blog'} to both siblings right after the charge — the call that 409'd
- `packages/functions/src/services/allInOneService.js:99` — the failed APC leg is stored as {isActivated:false, error} and never raised, so the merchant pays for a bundle APC never grants
- `packages/functions/src/services/allInOneService.js:268` — the mirrored inbound check: BUNDLE_NOT_BILLING_APP is the only 409 a sibling holding no bundle can answer with (line 272's BUNDLE_ALREADY_BILLED_HERE needs a live local bundle)
- `packages/functions/src/middleware/requireSiblingApp.js:6` — sender identity is derived solely from which env key matched; this app's table has no self row, so APC's mirror needs an explicit blog row or sender can never equal 'blog'
- `packages/functions/src/services/subscriptionService.js:396` — assertNoBundleElsewhere ran before the charge and did not throw, proving APC reported hasBundle:false two minutes before it answered 409
- `packages/functions/src/services/allInOneService.js:332` — refreshBundleApps re-broadcasts pending apps once a day, so the 409 repeats indefinitely for all three stores

## Evidence
- 4 matching entries: `resource.labels.project_id="avada-blog-app" AND labels.execution_id="m4ivsxygzeqc"`
- 3 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[seoService:setBundleState]" AND timestamp>="2026-08-30T00:00:00Z"`
- 3 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[allInOneService:activateBundle]" AND timestamp>="2026-08-30T00:00:00Z"`
- 40 matching entries: `resource.labels.project_id="avada-blog-app" AND resource.labels.service_name="apisa" AND httpRequest.requestUrl!="" AND timestamp>="2026-09-29T03:30:00Z" AND timestamp<="2026-09-29T03:40:00Z"`

## Job
- analyze rounds: 1
- cost: $1.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
