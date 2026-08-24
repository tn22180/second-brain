fingerprint: 1dmbc0c
service: subscriberenewsubscribertokenshandler
message: [getActiveSubscriptions] <http://5cc2ae-fb.myshopify.com|5cc2ae-fb.myshopify.com> error fetch failed
app: BLOG
repo: blogs
date: 2026-08-22T04:44:17.244Z
status: fix_disabled
attempt: 1

# BLOG · subscriberenewsubscribertokenshandler · 1dmbc0c

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getActiveSubscriptions catches undici's transport-level `TypeError: fetch failed` from its raw, un-timed, un-retried fetch to Shopify Admin GraphQL, logs it at logger.error (severity ERROR → Slack sink) and returns {} — so a single transient socket failure on a cold instance both raises a false alert and silently skips that shop's token renewal for the run, while the retry wrapper the caller put around it can never fire.

**Mechanism.** Cloud Run started a fresh subscriberenewsubscribertokenshandler container at 2026-08-20T16:00:14.884Z ('Starting new instance. Reason: AUTOSCALING'), STARTUP probe passed 16:00:24.061Z, redis connected 16:00:24.095Z. ~17s later, at 16:00:31.615Z, the raw `fetch()` at subscriptionController.js:115 to https://5cc2ae-fb.myshopify.com/admin/api/2025-01/graphql.json rejected with e.message === 'fetch failed' — undici's transport-level TypeError (socket/TLS/DNS), not an HTTP status and not a JSON parse (the other variant of this family, 'Unexpected token \'<\', "<html>..."', appeared separately at 2026-08-20T01:30:30.827Z for 556c7f-16.myshopify.com). The catch at :146 logs `logger.error('[getActiveSubscriptions]', shopName, 'error', e.message)` at :147 — the whole alert text — and returns `{}` at :148. Because the error is swallowed rather than rethrown, `retryWithBackoff` at subscribeRenewSubscriberTokens.js:133 receives a resolved `{}`, so its explicit `error.message?.includes('fetch failed')` retry branch at :80 is unreachable for this call path; consistent with that, zero `[retryWithBackoff]` log lines exist in this service since 2026-07-25. The empty object then flows into processSubscriptionLogic, where `new Date(activeSubscription?.currentPeriodEnd)` at :263 is `new Date(undefined)` = Invalid Date, `timeUntilEnd` = NaN, every `NaN <= oneDayInMs` comparison is false, and the shop falls to the final else branch — renewal skipped with no error surfaced. The batch continued (another shop's updateShopData logged at 16:00:32.964Z), and the 30-min cron recovers the skipped shop on a later run, so the alert is a swallowed transient, not a user-facing failure. e.cause (where undici puts ENOTFOUND/ECONNRESET/UND_ERR_SOCKET) is never logged, so the underlying transport fault cannot be named from these logs.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/subscriptionController.js:115` — raw fetch to Shopify Admin GraphQL with no timeout, no AbortSignal, no retry — the call that threw 'fetch failed'
- `packages/functions/src/controllers/subscriptionController.js:147` — logger.error emitting the exact alert text '[getActiveSubscriptions] <shop> error fetch failed' for an already-handled transient
- `packages/functions/src/controllers/subscriptionController.js:148` — returns {} instead of rethrowing, so the caller cannot distinguish 'no active subscription' from 'Shopify call failed'
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:133` — the only retryWithBackoff call site wrapping getActiveSubscriptions; it never sees a rejection
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:80` — retry branch explicitly keyed on error.message.includes('fetch failed') — dead code because the error is swallowed one layer down
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:263` — new Date(undefined) on the {} fallback → Invalid Date → NaN comparisons → renewal silently skipped for that shop

## Evidence
- 3 matching entries: `resource.labels.service_name="subscriberenewsubscribertokenshandler" AND jsonPayload.tag="[getActiveSubscriptions]" AND timestamp>="2026-08-19T16:00:00Z" AND timestamp<="2026-08-21T16:00:00Z"`
- 2 matching entries: `resource.labels.service_name="subscriberenewsubscribertokenshandler" AND jsonPayload.message:"fetch failed" AND timestamp>="2026-08-13T00:00:00Z"`
- 8 matching entries: `resource.labels.service_name="subscriberenewsubscribertokenshandler" AND timestamp>="2026-08-20T15:55:00Z" AND timestamp<="2026-08-20T16:05:00Z"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
