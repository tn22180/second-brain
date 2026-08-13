fingerprint: 6g2iqd
service: auth
message: HTTP 504 POST /auth/webhook/shop/update
app: BLOG
repo: blogs
date: 2026-08-13T00:22:52.009Z
status: deferred
attempt: 1

# BLOG · auth · 6g2iqd

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** POST /auth/webhook/shop/update awaits three unbounded Firestore round-trips inside @avada/core's onShopUpdate before ACKing Shopify, and nothing in the app puts a deadline in front of them, so when one lands in Firestore's latency tail the request rides to the auth function's timeoutSeconds: 120 and Cloud Run returns 504.

**Mechanism.** packages/functions/src/handlers/auth.js:36 mounts shopifyAuth().routes() as the auth function's only route source, so /auth/webhook/shop/update executes entirely inside @avada/core's webhookController.onShopUpdate. That handler logs 'Handling the shop update webhook <domain> <plan>' to stdout and then awaits, in order, shopRepository.getShopByShopifyDomain, shopRepository.updateShop and shopInfoRepository.updateOrCreateShopInfo — all Firestore, no other network dependency on the non-closed-plan path. The single 504 in the window (2026-08-13T00:16:47.250181Z, span f34a1292a2c0528e = decimal 17530844920498115214) has exactly one application log line: the webhook stdout line at 00:16:47.254309Z, 4 ms after the request start, for shop 4ccacc-2.myshopify.com plan 'basic'. Nothing else carries that span — no 'Store inactive', no 'Store re open', no error line — so the request stalled in the Firestore section and was killed before any catch block could log. Latency is 120.000202162s against auth's declared timeoutSeconds: 120 (packages/functions/src/functions/http.js:48), matching the configured limit to the microsecond (P4); receiveTimestamp − timestamp = 120.000s confirms the request-log timestamp is the start. No app-side bound exists: middleware/errorHandler.js:11 is a bare `await next()` inside try/catch with no timer, and no deadline middleware sits in front of shopifyAuth(). Saturation is ruled out by measurement: all 681 auth requests in the 30-minute window were served by one instance (001548f729d7cfd68d…), 659 of them shop/update at ~0.37 rps with a 0.29–0.42s body, so in-flight never approached concurrency: 10 and Cloud Run never scaled past 1 of maxInstances: 5. This is tail latency, not a hot path: 4 of 659 requests (0.61%) ran >10s — 32.18s, 41.96s, 97.45s all answered 200, and the one that crossed 120s died. Failure rate 1/659 = 0.15%, and it is the only auth 504 in the last 24h. Note the Firestore-deadline stack seen on 2026-08-11 (DEADLINE_EXCEEDED via WriteBatch.commit ← DocumentReference.update) does not appear here: zero textPayload:"DEADLINE_EXCEEDED" entries on auth in the last 24h, so the stalled dependency is identified by elimination from the code path plus log absence, not by a stack.

Confidence: `medium`

## Code
- `packages/functions/src/functions/http.js:48` — auth declared timeoutSeconds: 120, concurrency: 10, maxInstances: 5 — the 120.000202162s latency is this limit firing; the measured single instance at ~0.37 rps rules out queueing against concurrency 10
- `packages/functions/src/handlers/auth.js:36` — shopifyAuth().routes() is the only route source in the auth function, so /auth/webhook/shop/update runs inside @avada/core with no app-side request deadline in front of its Firestore awaits
- `packages/functions/src/middleware/errorHandler.js:11` — the outermost middleware is a bare `await next()` — it converts thrown errors but carries no timer, so a stalled Firestore call is never turned into an early ACK

## Evidence
- 1 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-13T00:04:03Z" AND timestamp<="2026-08-13T00:34:04Z" AND httpRequest.status=504`
- 659 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-13T00:04:03Z" AND timestamp<="2026-08-13T00:34:04Z" AND httpRequest.requestUrl:"/auth/webhook/shop/update"`
- 4 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-13T00:04:03Z" AND timestamp<="2026-08-13T00:34:04Z" AND httpRequest.latency>="10s"`
- 172 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-13T00:14:00Z" AND timestamp<="2026-08-13T00:17:00Z" AND textPayload:"Handling the shop update webhook"`
- 681 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-13T00:04:03Z" AND timestamp<="2026-08-13T00:34:04Z" AND httpRequest.requestUrl!=""`

## Job
- analyze rounds: 1
- cost: $1.69

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
