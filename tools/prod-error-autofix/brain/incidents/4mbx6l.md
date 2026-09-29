fingerprint: 4mbx6l
service: api
message: [seoService:setBundleState] <http://lula-bye.myshopify.com|lula-bye.myshopify.com> apc Request failed with status code 409
app: BLOG
repo: blogs
date: 2026-09-29T03:04:44.535Z
status: fix_disabled
attempt: 1

# BLOG · api · 4mbx6l

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The blog→APC leg of the all-in-one bundle contract is broken in one direction: AI Product Copy answers HTTP 409 to every POST /proxy/apc/all-in-one/state carrying `billingApp: "blog"` (2 of 2 blog-billed bundle activations in the 30-day retention window), so both merchants who bought the $49 bundle in Blog were charged and never got APC Pro, and Blog only records the failure instead of surfacing it.

**Mechanism.** 02:49:26.977Z GET /api/subscription/shopify/subscribe/all_in_one?interval=monthly → 200 for lula-bye.myshopify.com. That path runs subscriptionService.getCustomPricing, which calls askSiblingApps then assertNoBundleElsewhere + assertSiblingsReachable (subscriptionService.js:395-397); the charge was created, so APC's GET eligibility answered reachable:true and hasBundle:false — APC held no bundle of its own at that moment. 02:49:35.507Z /api/subscription/shopify/activate?charge_id=35664527598 → 302 (merchant approved). afterCharge → allInOneService.activateBundle broadcasts {status:'active', billingApp:'blog', chargeId:35664527598} to both siblings (allInOneService.js:194). SEO accepted (isActivated:true, isInstalled:true); APC rejected with 409, logged at seoService.js:309 as bare `e.message` — the response body carrying the refusal code is dropped, so the channel cannot say which refusal it was. On the mirrored logic this app runs inbound (allInOneService.js:268) the only 409 reachable for a sibling that holds no bundle is BUNDLE_NOT_BILLING_APP, i.e. APC does not accept 'blog' as the sender/billingApp for this key — BUNDLE_ALREADY_BILLED_HERE (line 272) requires a live bundle in APC, which its own eligibility answer 9 seconds earlier denies. Two aggravators on this side: retryBundleCall (seoService.js:268) retries a deterministic 4xx three times with backoff, and broadcast() records the leg as {isActivated:false, error} (allInOneService.js:98-100) without throwing, by design (docs/features/all-in-one-bundle.md:111) — so refreshBundleApps (allInOneService.js:332) will re-push the same rejected state once a day forever while the merchant keeps paying $49. Note docs/features/all-in-one-bundle.md:321 recorded AVADA_AI_PRODUCT_COPY_PRO_ACCESS_TOKEN as empty; it is now set, and the first two live uses of the APC leg both 409'd, which fits a newly wired endpoint with a mismatched contract rather than a pre-existing APC bundle. The exact APC-side line is not verifiable from this repo.

Confidence: `high`

## Code
- `packages/functions/src/services/seoService.js:309` — the alerted log line; records only e.message, discarding the 409 body that carries the sibling's refusal code
- `packages/functions/src/services/seoService.js:268` — retryBundleCall retries any failure 3x with backoff, including a deterministic 409 that cannot succeed
- `packages/functions/src/services/allInOneService.js:194` — activateBundle broadcasts {status:'active', billingApp:'blog'} to both siblings right after the charge — the call that 409'd
- `packages/functions/src/services/allInOneService.js:99` — the failed APC leg is stored as {isActivated:false, error} and never raised, so the merchant pays for a bundle APC never grants
- `packages/functions/src/services/allInOneService.js:268` — the mirrored inbound check: BUNDLE_NOT_BILLING_APP is the only 409 a sibling holding no bundle can answer with (line 272's BUNDLE_ALREADY_BILLED_HERE needs a live local bundle)
- `packages/functions/src/services/subscriptionService.js:396` — assertNoBundleElsewhere ran before the charge and did not throw, proving APC reported hasBundle:false seconds before it answered 409
- `packages/functions/src/services/allInOneService.js:332` — refreshBundleApps re-broadcasts pending apps once a day, so the 409 repeats indefinitely for both stores

## Evidence
- 2 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[seoService:setBundleState]" AND timestamp>="2026-09-29T02:40:00Z" AND timestamp<="2026-09-29T03:00:00Z"`
- 2 matching entries: `resource.labels.project_id="avada-blog-app" AND jsonPayload.tag="[allInOneService:activateBundle]" AND timestamp>="2026-09-29T02:40:00Z" AND timestamp<="2026-09-29T03:00:00Z"`
- 3 matching entries: `resource.labels.project_id="avada-blog-app" AND httpRequest.requestUrl:"/api/subscription/shopify/activate" AND timestamp>="2026-09-29T02:40:00Z" AND timestamp<="2026-09-29T03:00:00Z"`
- 4 matching entries: `resource.labels.project_id="avada-blog-app" AND labels.execution_id="m2vq59h7j3mz"`

## Job
- analyze rounds: 3
- cost: $7.14

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
