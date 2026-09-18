fingerprint: y89mhl
service: apisagen2
message: HTTP 500 GET /apiSa/settings
app: SEO
repo: seo
date: 2026-09-18T08:27:29.397Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · y89mhl

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** This is a duplicate of recorded fingerprint 18d0hk9: the same burst on the same apisagen2 instance in the same window. The standalone admin's useAffiliateRealtime hook calls signInWithCustomToken on the shared Firebase Auth instance. That replaces the merchant's user with the synthetic 'affiliate-realtime:<shopId>' user, whose ID token carries `shopId` but not `shopID`. @avada/core's verifyRequest/userState then calls getShopById(undefined) and throws 'documentPath … must be a non-empty string', so GET /apiSa/settings returns 500.

**Mechanism.** GET /apiSa/affiliate/realtime-token returned 200 at 08:15:53.4Z, 08:19:29.1Z and 08:25:20.4Z. affiliateController.getRealtimeToken → createAffiliateRealtimeToken mints createCustomToken(`affiliate-realtime:${shopId}`, {shopId}). The FE hook then runs signInWithCustomToken(auth, token) on the single getAuth(app) instance from helpers.js. After that, api()/fetchAuthenticatedApi send auth.currentUser.getIdToken(), which is now the synthetic user's token. On apiSa, api.use(verifyRequest()) verifies that token, so there is no 401. userState then reads ctx.state.user.shopID, which is undefined, and calls shopRepository.getShopById(undefined) → collection('shops').doc(undefined) → validateResourcePath throws. The throw happens before any route runs, so every /apiSa endpoint the page polls returns 500 in about 4ms. The first 500 came 1.2s after the first token mint, at 08:15:54.58Z. The 4 /apiSa/settings 500s at 08:22:35Z and 08:25:26Z each follow a token mint (08:19:29Z and 08:25:20Z). All 68 500s have the same stack (@avada/core verifyRequest.js → shopRepository.getShopById → CollectionReference.doc), come from one instance (…a16797e3ae), one revision (apisagen2-00368-hid) and one browser UA. They are spread over 7 endpoints: payouts 18, payout-summary 18, shops 14, dev/affiliate/commission 6, settings 4, subscription 4, referrals/coupons 4. That is one cause with 7 symptoms.

Confidence: `high`

## Code
- `packages/assets/src/hooks/useAffiliateRealtime.js:19` — signInWithCustomToken(auth, token) replaces the merchant's Firebase user on the shared auth instance
- `packages/assets/src/helpers.js:32` — `auth` is the one getAuth(app) instance used both for Firestore listeners and for API auth
- `packages/assets/src/helpers.js:70` — api() takes x-auth-token from auth.currentUser.getIdToken(), which by now belongs to the synthetic affiliate-realtime user
- `packages/functions/src/helpers/affiliate/realtimeToken.js:19` — custom token claims are {shopId} (lowercase d); there is no shopID claim, which @avada/core userState reads
- `packages/functions/src/controllers/affiliateController.js:174` — getRealtimeToken mints the token; each of its 3 200s in the window comes just before a 500 burst
- `packages/functions/src/handlers/apiSa.js:69` — api.use(verifyRequest()) runs @avada/core verifyFirebaseToken + userState → getShopById(ctx.state.user.shopID) before every /apiSa route, including /settings

## Evidence
- 4 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49Z" AND timestamp<="2026-09-18T08:37:49Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/apiSa/settings"`
- 68 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49Z" AND timestamp<="2026-09-18T08:37:49Z" AND textPayload:"documentPath" AND textPayload:"verifyRequest.js"`
- 3 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:49Z" AND timestamp<="2026-09-18T08:37:49Z" AND httpRequest.requestUrl:"realtime-token"`

## Job
- analyze rounds: 1
- cost: $1.59

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
