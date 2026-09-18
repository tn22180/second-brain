fingerprint: 1l0me4f
service: apisagen2
message: HTTP 500 GET /apiSa/subscription
app: SEO
repo: seo
date: 2026-09-18T08:26:16.111Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · 1l0me4f

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 18d0hk9 (same burst, same apisagen2 instance, same window): the standalone admin's useAffiliateRealtime hook calls signInWithCustomToken(auth, token) on the shared Firebase Auth instance. That replaces the merchant's user with the synthetic 'affiliate-realtime:<shopId>' user, whose ID token has a lowercase `shopId` claim and no `shopID`. @avada/core userState then calls getShopById(undefined) before any /apiSa route runs, so GET /apiSa/subscription and every other /apiSa route throw 'documentPath … must be a non-empty string'.

**Mechanism.** GET /apiSa/affiliate/realtime-token returned 200 at 08:15:53.408Z, 08:19:29.091Z and 08:25:20.392Z, all on instance …6797e3ae. The token is minted by affiliateController.getRealtimeToken → createAffiliateRealtimeToken → createCustomToken(`affiliate-realtime:${shopId}`, {shopId}). The FE's ensureRealtimeAuth then runs signInWithCustomToken(auth, token) on the same getAuth(app) singleton that api()/fetchAuthenticatedApi use for x-auth-token. After that, every /apiSa call carries the synthetic user's ID token. apiSa.js runs verifyRequest() (verifyFirebaseToken + userState) before the router. The token verifies, so there is no 401. userState reads ctx.state.user.shopID, which is undefined, and calls shopRepository.getShopById(undefined) → collection('shops').doc(undefined), which throws validateResourcePath (stack: @avada/core verifyRequest.js:94 → shopRepository.js:134 → CollectionReference.doc). All 50 5xx in the window came from one instance, returned in 4–10ms, and carry the same message, spread across 7 routes: 16 payout-summary, 16 payouts, 10 shops, 2 subscription, 2 settings, 2 referrals/coupons and 2 dev/affiliate/commission. So the alerted GET /apiSa/subscription is 2 symptoms of one cause, not a subscription defect. The page keeps polling and every request after the sign-in fails until a reload re-signs the real merchant user.

Confidence: `high`

## Code
- `packages/assets/src/hooks/useAffiliateRealtime.js:19` — signInWithCustomToken(auth, token) replaces the merchant's Firebase user on the shared auth instance
- `packages/functions/src/helpers/affiliate/realtimeToken.js:19` — custom token claims are {shopId} (lowercase), with no shopID, which @avada/core userState requires
- `packages/functions/src/controllers/affiliateController.js:174` — getRealtimeToken endpoint; its 200 responses at 08:15:53Z / 08:19:29Z / 08:25:20Z bracket the 500 bursts
- `packages/functions/src/handlers/apiSa.js:69` — api.use(verifyRequest()) runs @avada/core userState → getShopById(ctx.state.user.shopID) before every /apiSa route, including /subscription

## Evidence
- 50 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49.274Z" AND timestamp<="2026-09-18T08:37:49.274Z" AND httpRequest.status>=500`
- 100 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49.274Z" AND timestamp<="2026-09-18T08:37:49.274Z" AND textPayload:"documentPath"`
- 3 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49Z" AND timestamp<="2026-09-18T08:37:49Z" AND httpRequest.requestUrl:"realtime-token"`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
