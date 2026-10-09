fingerprint: 1hjm83j
service: apigen2
message: HTTP 500 GET /api/subscription
app: SEO
repo: seo
date: 2026-10-09T08:57:45.700Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1hjm83j

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number -1 instead of an object, and @avada/core 4.8.2's setSession does `cookies[key] = value` on that primitive, so the single GET /api/subscription 500 is a strict-mode TypeError thrown inside the app's auth middleware before subscriptionController ran.

**Mechanism.** GET https://apigen2-pihimpufva-uc.a.run.app/api/subscription at 2026-10-09T08:55:09.110272Z returned 500 with latency 0.233019733s (referer https://seo.apps.avada.io/, remoteIp 66.249.93.9, revision apigen2-00410-nid). 232ms later stderr carries the full stack: `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '-1' at setSession (/workspace/node_modules/@avada/core/build/helpers/cookiesHelper.js:16:18) at verifyEmbedRequest/verifyToken.js:119:56`. Path: packages/functions/src/handlers/api.js:69 mounts createAuthMiddleware() ahead of the router (router mounted at :78-79, /subscription registered at routes/api.js:83), and middleware/auth.js:33 delegates to @avada/core verifyEmbedRequest → verifyToken; on the isActiveToken branch verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME). setSession (cookiesHelper.js:15-16) does `var cookies = decryptText(ctx.cookies.get('__session'), 'avada-session-identifier'); cookies[key] = value;` with no typeof check. decryptText (hashHelper.js:26) returns a bare `JSON.parse` of the AES plaintext — for this cookie the parse succeeds and yields the primitive `-1`; the catch at hashHelper.js:28-29 only returns `{error}` when the parse *throws*, not when it yields a non-object. cookiesHelper.js is "use strict", so assigning a property on a number primitive throws, the TypeError escapes the middleware, and createErrorHandler (middleware/errorHandler.js:18) logs `[unhandledError] GET /api/subscription 500` and answers 500. This is the recorded @avada/core setSession family — fingerprints h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / jjeu1l / mne0rk / 3l54x4 / 1g4bhm7 / 2exedr / 2yaavp / ixv4cv on SEO apigen2 plus the BLOG twins — with a new primitive variant: previously observed values were positive integers (39, 8, 6, 4, 3, 1), this one is the negative integer -1. Same two lines, same unmerged fix (MR 2095/2104/2167 open on master; @avada/core still pinned 4.8.2 at packages/functions/package.json:33). Endpoint is incidental: the fault is in auth middleware, which every /api route passes through.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:69` — api.use(createAuthMiddleware()) — mounted before the router (:78-79), so every /api route incl. /api/subscription runs the @avada/core verifyToken → setSession chain first
- `packages/functions/src/middleware/auth.js:33` — return verifyEmbedRequest(verifyEmbedConfig)(ctx, next) — the repo-owned seam that enters the throwing chain; where a __session sanitizer belongs
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value;` — the exact throwing line named in the stack (cookiesHelper.js:16:18); `cookies` is the number -1, unchecked
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns bare JSON.parse of the AES plaintext, so a cookie decrypting to `-1` returns the primitive -1; the catch at :28 only covers a parse throw
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) on the isActiveToken branch — the caller frame in the stack, explaining the 'shopifyTopLevelOAuth' property name
- `packages/functions/src/middleware/errorHandler.js:18` — logger.error('[unhandledError]', …) at status>=500 — converts the TypeError into the alerted HTTP 500 and emitted the matched stderr line
- `packages/functions/src/routes/api.js:83` — router.get('/subscription', subscriptionController.getSubscription) — the never-reached handler; proves the endpoint is incidental, not the fault site
- `packages/functions/package.json:33` — "@avada/core": "4.8.2" — the pinned version carrying the unguarded setSession; no patch applied in this repo

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-10-09T08:40:26.198Z" AND timestamp<="2026-10-09T09:10:26.198Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-10-09T08:40:26.198Z" AND timestamp<="2026-10-09T09:10:26.198Z" AND httpRequest.status>=500`
- 1 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-10-09T08:40:26.198Z" AND timestamp<="2026-10-09T09:10:26.198Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.11

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
