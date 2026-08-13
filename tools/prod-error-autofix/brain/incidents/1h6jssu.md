fingerprint: 1h6jssu
service: subscriberenewsubscribertokenshandler
message: [getActiveSubscriptions] <http://tonnesen.myshopify.com|tonnesen.myshopify.com> error Unexpected token 'u', "upstream c"... is not valid JSON
app: BLOG
repo: blogs
date: 2026-08-12T17:13:58.754Z
status: deferred
attempt: 1

# BLOG · subscriberenewsubscribertokenshandler · 1h6jssu

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** getActiveSubscriptions calls respRequest.json() unconditionally on a raw fetch to Shopify Admin GraphQL, so when Shopify's edge answered tonnesen.myshopify.com with a plain-text Envoy body ("upstream connect error or disconnect/reset before headers…") instead of JSON, JSON parsing threw SyntaxError, the catch swallowed it to `{}`, and the shop silently got no token renewal that run.

**Mechanism.** 17:00:59Z the subscriberenewsubscribertokenshandler instance cold-started (AUTOSCALING), redis connected 17:01:16Z, and at 17:01:21.511Z the only ERROR in the window is `[getActiveSubscriptions] tonnesen.myshopify.com error Unexpected token 'u', "upstream c"... is not valid JSON`. That message is `e.message` from packages/functions/src/controllers/subscriptionController.js:147; the throw comes from `await respRequest.json()` at line 143, which is reached with no `respRequest.ok`/status/content-type check after the bare `fetch` at line 115. The body prefix "upstream c" is Envoy's `upstream connect error or disconnect/reset before headers` — the plain-text 502/503 Shopify's edge returns, not a GraphQL document. The catch at 146-149 returns `{}`, i.e. it never rethrows, so `retryWithBackoff` wrapping the call at subscribeRenewSubscriberTokens.js:133-135 sees a resolved promise and never retries: 0 log lines with tag `[retryWithBackoff]` in 17:00-17:10Z against that 1 failure. Downstream, `activeSubscription = {}` makes `isEmpty()` true at line 201 and 231, so both active-subscription branches are skipped; line 263 then computes `new Date(undefined)` → Invalid Date, `timeUntilEnd` is NaN, and `NaN <= oneDayInMs` is false at line 268, so the monthly renewal branch is skipped too. The merchant's token balance is not renewed on this pass and the failure is invisible above the log line.

Confidence: `high`

## Code
- `packages/functions/src/controllers/subscriptionController.js:115` — bare fetch to Shopify Admin GraphQL, no timeout, no shopifyRetryGraphQL wrapper
- `packages/functions/src/controllers/subscriptionController.js:143` — `await respRequest.json()` with no ok/status/content-type check — this is the throw site for the logged SyntaxError
- `packages/functions/src/controllers/subscriptionController.js:147` — the exact logger.error that produced the alert message, including `shopName` and `e.message`
- `packages/functions/src/controllers/subscriptionController.js:148` — `return {}` swallows a transport failure as 'no active subscription' — indistinguishable from a genuinely unsubscribed shop
- `packages/functions/src/controllers/subscriptionController.js:179` — getActiveSubscriptionById repeats the same unchecked .json() + swallow-to-{} pattern; same fix must cover it
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:133` — retryWithBackoff wraps a callee that never throws, so the retry path is dead for this call — confirmed by 0 [retryWithBackoff] lines against the failure
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:263` — new Date(activeSubscription?.currentPeriodEnd) on {} yields Invalid Date → NaN comparison at line 268 silently skips renewal
- `packages/functions/src/handlers/pubsub/subscribeUpdatePlanActiveCharge.js:35` — second caller of getActiveSubscriptions, also treats {} as 'no subscription' — a swallowed edge error here leaves a paid shop on FREE

## Evidence
- 1 matching entries: `(resource.labels.service_name="subscriberenewsubscribertokenshandler") AND timestamp>="2026-08-10T16:47:44.560Z" AND timestamp<="2026-08-10T17:17:44.560Z" AND jsonPayload.tag="[getActiveSubscriptions]"`
- 1 matching entries: `(resource.labels.service_name="subscriberenewsubscribertokenshandler") AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-11T00:00:00Z" AND jsonPayload.tag="[getActiveSubscriptions]"`
- 1 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-08-10T16:47:00Z" AND timestamp<="2026-08-10T17:18:00Z" AND jsonPayload.message:"upstream c"`
- 8 matching entries: `(resource.labels.service_name="subscriberenewsubscribertokenshandler") AND timestamp>="2026-08-10T16:47:44.560Z" AND timestamp<="2026-08-10T17:17:44.560Z"`

## Job
- analyze rounds: 1
- cost: $1.14

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
