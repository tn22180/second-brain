fingerprint: ixv4cv
service: apigen2
message: HTTP 500 GET /api/google/insights
app: SEO
repo: seo
date: 2026-09-25T18:28:58.079Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · ixv4cv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 6 instead of an object, and @avada/core 4.8.2's setSession does `cookies[key] = value` on that primitive, so the single GET /api/google/insights 500 is a TypeError thrown inside the app's auth middleware before any controller ran.

**Mechanism.** GET /api/google/insights?...searchType=undefined at 2026-09-25T18:25:22.141951Z returned 500 with latency 0.212669990s (referer https://seo.apps.avada.io/, apigen2 revision apigen2-00389-cut, instance 0010dd86075985…). The stderr line 214ms later carries the full stack: `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '6' at setSession (/workspace/node_modules/@avada/core/build/helpers/cookiesHelper.js:16:18) at verifyToken.js:119:56`. Path: api.js:69 mounts createAuthMiddleware(), which at middleware/auth.js:33 delegates to @avada/core's verifyEmbedRequest → verifyToken; on the `isActiveToken` branch verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME). setSession (cookiesHelper.js:15-16) does `var cookies = decryptText(ctx.cookies.get('__session'), 'avada-session-identifier'); cookies[key] = value;` with no typeof check. decryptText (hashHelper.js:22-29) returns `JSON.parse(...)` of the AES plaintext — for this cookie that parse succeeds and yields the primitive `6`, not an object, and it only falls back to `{error: …}` when the parse throws. Assigning a property on a number primitive throws TypeError in strict mode, the error escapes the middleware, and errorHandler answers 500. The request never reached googleController; the successful `[getGscInsights] generated ofVXwE8bwR6xEtfimFLW 4 cards` at 18:25:26.973769Z is the user's retry, which is not in the requests read (status < 500). This is the recorded @avada/core setSession family — fingerprints h9cev0 / xy8ebm / 2t79bo / cfkgba / 8nzlcb / dea93l / jjeu1l / mne0rk / 3l54x4 / 1g4bhm7 / 2exedr / 2yaavp on SEO apigen2, same primitive-number variant (number 39, 6, 3, 1 observed), plus the BLOG twins 1qodvk0 / a3l435 / r6ig4i / skrvtw / 8phfr7. Fix is still unmerged on master (MR 2095/2104/2167 open).

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:69` — api.use(createAuthMiddleware()) — every /api route, including /api/google/insights, passes through this middleware before routing at :77-79
- `packages/functions/src/middleware/auth.js:33` — returns verifyEmbedRequest(verifyEmbedConfig)(ctx, next) — the app's only entry into the @avada/core verifyToken → setSession chain in the stack
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value;` — the throwing line named in the stack (cookiesHelper.js:16:18); `cookies` is whatever decryptText returned, unchecked
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns bare JSON.parse of the AES plaintext, so a cookie decrypting to `6` returns the primitive 6 and only a parse throw produces the {error} object
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) on the isActiveToken branch — the caller frame in the stack, explaining the 'shopifyTopLevelOAuth' key in the message

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-25T18:10:44.142Z" AND timestamp<="2026-09-25T18:40:44.142Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-25T18:10:44.142Z" AND timestamp<="2026-09-25T18:40:44.142Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-25T18:10:44.142Z" AND timestamp<="2026-09-25T18:40:44.142Z" AND logName:"stderr" AND textPayload:"getGscInsights"`

## Job
- analyze rounds: 1
- cost: $1.87

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
