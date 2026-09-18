fingerprint: rth6m3
service: apisagen2
message: HTTP 500 GET /apiSa/affiliate/payouts
app: SEO
repo: seo
date: 2026-09-18T08:20:24.437Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · rth6m3

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 18d0hk9, same burst in the same window. The standalone admin's useAffiliateRealtime hook calls signInWithCustomToken(auth, token) on the shared Firebase Auth instance that the app also uses for API auth. That replaces the merchant user with the synthetic user 'affiliate-realtime:<shopId>'. Its token carries a lowercase `shopId` claim and no `shopID`, so every later /apiSa request passes verifyFirebaseToken and then fails in @avada/core userState at getShopById(undefined).

**Mechanism.** At 08:15:51.23Z, GET /apiSa/shops returned 200, so the merchant's own token still worked. At 08:15:53.408Z, GET /apiSa/affiliate/realtime-token returned 200: affiliateController.getRealtimeToken called createAffiliateRealtimeToken, which runs createCustomToken(`affiliate-realtime:${shopId}`, {shopId}). The frontend's ensureRealtimeAuth then ran signInWithCustomToken(auth, token), where `auth` is the single getAuth(app) instance exported from assets/helpers.js. After that, api() and fetchAuthenticatedApi send auth.currentUser.getIdToken(), which is now the synthetic user's ID token. The first 500 came 1.2s later, on GET /apiSa/shops at 08:15:54.58Z. apiSa.js runs api.use(verifyRequest()) before any route. The token verifies, so there is no 401. userState then reads ctx.state.user.shopID, which is undefined. It calls @avada/core shopRepository.getShopById(undefined), which calls firestore.collection('shops').doc(undefined), and validateResourcePath throws 'Value for argument "documentPath" is not a valid resource path'. The throw happens before any route handler runs. That is why 3 unrelated endpoints fail identically in 4–10ms: /shops ×4, /affiliate/payouts ×6 and /affiliate/payout-summary ×6. The page keeps polling payouts and payout-summary, so the session stays broken until a reload signs the real user back in. The alerted payouts 500 is one of 16 symptoms of this single cause.

Confidence: `high`

## Code
- `packages/assets/src/hooks/useAffiliateRealtime.js:19` — signInWithCustomToken(auth, token) replaces the merchant's Firebase user on the shared auth instance
- `packages/assets/src/helpers.js:32` — `auth` is the single getAuth(app) instance, used both for the realtime Firestore listeners and for API auth
- `packages/assets/src/helpers.js:70` — api() takes x-auth-token from auth.currentUser.getIdToken(), which is now the synthetic affiliate-realtime user's token
- `packages/functions/src/helpers/affiliate/realtimeToken.js:19` — custom token claims are {shopId} (lowercase d) with no shopID, and @avada/core userState reads shopID
- `packages/functions/src/controllers/affiliateController.js:174` — getRealtimeToken mints the token; its 200 at 08:15:53.408Z comes 1.2s before the first 500
- `packages/functions/src/handlers/apiSa.js:69` — api.use(verifyRequest()) runs verifyFirebaseToken + userState, including getShopById(ctx.state.user.shopID), before every /apiSa route

## Evidence
- 16 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:01:08.297Z" AND timestamp<="2026-09-18T08:31:08.297Z" AND httpRequest.status>=500`
- 32 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:01:08.297Z" AND timestamp<="2026-09-18T08:31:08.297Z" AND textPayload:"documentPath"`
- 12 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-09-18T08:15:50Z" AND timestamp<="2026-09-18T08:15:55Z" AND httpRequest.requestUrl:"/apiSa/"`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
