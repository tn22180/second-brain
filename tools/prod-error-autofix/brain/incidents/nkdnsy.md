fingerprint: nkdnsy
service: apisagen2
message: HTTP 500 GET /apiSa/referrals/coupons
app: SEO
repo: seo
date: 2026-09-18T08:23:57.461Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · nkdnsy

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 18d0hk9 (same burst, same window). The standalone admin's useAffiliateRealtime hook calls signInWithCustomToken(auth, token) on the shared Firebase Auth instance the admin also uses for API auth. That replaces the merchant user with the synthetic 'affiliate-realtime:<shopId>' user, whose ID token carries a lowercase `shopId` claim and no `shopID`. Every later /apiSa request, including GET /apiSa/referrals/coupons, then fails in @avada/core verifyRequest at getShopById(undefined).

**Mechanism.** 1. GET /apiSa/affiliate/realtime-token returned 200 at 08:15:53.408Z and again at 08:19:29.091Z, referer /affiliate. That is getRealtimeToken → createAffiliateRealtimeToken → createCustomToken(`affiliate-realtime:${shopId}`, {shopId}).
2. The front end runs signInWithCustomToken(auth, token) on the singleton getAuth(app). From then on, api()/fetchAuthenticatedApi send auth.currentUser.getIdToken(), which is now the synthetic user's token.
3. On apiSa, api.use(verifyRequest()) verifies that token, so the request gets no 401. userState then calls getShopById(ctx.state.user.shopID), and shopID is undefined.
4. firestore.collection('shops').doc(undefined) throws 'Value for argument "documentPath" is not a valid resource path'. The stack confirms the path: shopRepository.js:134 ← getShopById ← verifyRequest.js:94.
5. The throw happens before any route runs, so the 500 is route-independent. The alerted GET /apiSa/referrals/coupons at 08:22:35.714Z took 5ms, came from the same browser session (referer /dev_zone, after the user navigated there from /affiliate) and is 1 of 43 500s in the window: 16 /affiliate/payout-summary, 16 /affiliate/payouts, 8 /shops, 2 /dev/affiliate/commission, 1 /referrals/coupons. The 48 stderr [apiSa] lines all carry the same documentPath message. The 500s start at 08:15:54.584Z, 1.2s after the first realtime-token 200, and continue until 08:22:44Z.

Confidence: `high`

## Code
- `packages/assets/src/hooks/useAffiliateRealtime.js:19` — signInWithCustomToken(auth, token) replaces the merchant's Firebase user on the shared auth instance
- `packages/assets/src/helpers.js:32` — `auth` is the single getAuth(app) instance, shared by the Firestore listeners and API auth
- `packages/assets/src/helpers.js:70` — api() takes the ID token from auth.currentUser, which is now the synthetic affiliate-realtime user
- `packages/functions/src/helpers/affiliate/realtimeToken.js:19` — custom token claims are {shopId} with a lowercase d and no shopID, which @avada/core userState reads
- `packages/functions/src/controllers/affiliateController.js:174` — getRealtimeToken mints the token; its 200s at 08:15:53Z and 08:19:29Z precede the 500 burst
- `packages/functions/src/handlers/apiSa.js:69` — api.use(verifyRequest()) runs getShopById(ctx.state.user.shopID) before every /apiSa route, including /referrals/coupons

## Evidence
- 1 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:37Z" AND timestamp<="2026-09-18T08:37:37Z" AND httpRequest.requestUrl:"/apiSa/referrals/coupons" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:37Z" AND timestamp<="2026-09-18T08:37:37Z" AND textPayload:"referrals/coupons" AND textPayload:"documentPath"`
- 2 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:37Z" AND timestamp<="2026-09-18T08:37:37Z" AND httpRequest.requestUrl:"realtime-token"`
- 43 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:07:37Z" AND timestamp<="2026-09-18T08:37:37Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.61

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
