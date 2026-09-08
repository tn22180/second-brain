fingerprint: jjeu1l
service: apigen2
message: HTTP 500 GET /api/settings
app: SEO
repo: seo
date: 2026-09-08T01:50:47.494Z
status: fix_disabled
attempt: 2

# SEO · apigen2 · jjeu1l

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 3 instead of an object, and @avada/core 4.8.2's setSession does `cookies[key] = value` on that primitive under 'use strict', throwing TypeError inside the auth middleware and 500-ing GET /api/settings before any controller ran.

**Mechanism.** GET /api/settings on apigen2 (revision apigen2-00361-mil, instance 00a41e8c1d9dcf…, 0.305254419s, referer https://seo.apps.avada.io/, Shopify Mobile iPad UA) → handlers/api.js:65 mounts createAuthMiddleware ahead of the router (the earlier shopifyCharge at api.js:48 cannot be the thrower: its verifyMiddleware is bound only to the `/api/subscription/shopify/subscribe/:plan` route, node_modules/@avada/core/build/shopifyCharge.js:75) → middleware/auth.js:33 hands the request to verifyEmbedRequest(verifyEmbedConfig) → @avada/core verifyToken.js:119 takes the active-access-token branch and calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) → cookiesHelper.js:15 does decryptText(ctx.cookies.get('__session'), 'avada-session-identifier'), and hashHelper.js:26 returns `JSON.parse(bytes.toString(Utf8))`, which for this cookie parsed to the Number 3 → cookiesHelper.js:16 `cookies[key] = value` on a primitive in a 'use strict' module throws "Cannot create property 'shopifyTopLevelOAuth' on number '3'". The two stderr lines at 01:16:04.4313Z / 01:16:04.4317Z carry exactly those frames (cookiesHelper.js:16 ← verifyToken.js:119 ← step/next/fulfilled) on the same instance, 309 ms after the single 500 request log at 01:16:04.122091Z — one request, one cause, and the only 500 in the window. shopID is `undefined` in the '[api]' line because ctx.state.user is never populated: the crash is pre-auth.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — createAuthMiddleware hands every unauthenticated /api request to verifyEmbedRequest(verifyEmbedConfig) — the call whose setSession throws. The __session shape guard belongs here.
- `packages/functions/src/handlers/api.js:65` — apigen2 mounts createAuthMiddleware ahead of the router, so the fault is route-agnostic — /api/settings only happened to be the request in flight
- `packages/functions/src/handlers/api.js:48` — the only other verifyEmbedRequest mount; shopifyCharge scopes it to its own subscribe route, which rules it out as the thrower for /api/settings
- `packages/functions/src/handlers/api.js:79` — the api.on('error') logger that emitted the '[api] undefined GET /api/settings 500 …' stderr line matched in this window

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-06T01:01:21.327Z" AND timestamp<="2026-09-06T01:31:21.327Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-06T01:01:21.327Z" AND timestamp<="2026-09-06T01:31:21.327Z" AND httpRequest.status>=500`
- 10 matching entries: `resource.labels.project_id="avada-seo" AND timestamp>="2026-08-30T00:00:00Z" AND timestamp<="2026-09-07T00:00:00Z" AND textPayload:"Cannot create property" AND textPayload:"shopifyTopLevelOAuth"`

## Job
- analyze rounds: 1
- cost: $2.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
