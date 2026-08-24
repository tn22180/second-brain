fingerprint: 8nzlcb
service: apigen2
message: HTTP 500 GET /api/shops
app: SEO
repo: seo
date: 2026-08-22T03:45:03.716Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 8nzlcb

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser's `__session` cookie for shop 5cc201-4b.myshopify.com decrypts to the JSON primitive number `6`, and @avada/core 4.8.2's `setSession` does `cookies[key] = value` on that primitive under `"use strict"`, throwing `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '6'` and turning every embedded `GET /api/shops` from that browser into a 500.

**Mechanism.** verifyEmbedRequest → verifyToken.js:119 calls setSession(ctx, ..., 'shopifyTopLevelOAuth'). setSession (node_modules/@avada/core/build/helpers/cookiesHelper.js:15) calls decryptText(ctx.cookies.get('__session')). decryptText (hashHelper.js:23-31) returns `JSON.parse(bytes.toString(Utf8))` and only falls back to `{error}` when JSON.parse *throws* — a payload of `6` parses cleanly to the primitive number 6, so no guard fires. Line 16 then assigns `cookies['shopifyTopLevelOAuth'] = value` on a number; the file is `"use strict"` (line 1), so property assignment on a primitive throws instead of silently no-op'ing. The throw escapes the middleware, Koa's error handler answers 500 and logs it. Timing is one-to-one: the request log is 2026-08-19T17:23:23.235493Z with latency 0.630101562s → 17:23:23.8656Z, and the [unhandledError] stderr line is 17:23:23.866139Z on the same instance 00a41e8c1d16… . The SEO app calls verifyEmbedRequest with no pre-validation of the cookie at either mount (middleware/auth.js:33, handlers/api.js:59, handlers/apiV2.js:86), so nothing in this repo's own code can stop it.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — The api mount hands the request straight to verifyEmbedRequest with no check that the __session cookie decrypts to an object; this is the call whose stack frame is verifyToken.js:119 → setSession.
- `packages/functions/src/handlers/api.js:59` — Second entry into the same unguarded verifyEmbedRequest on the apigen2 service (shopifyCharge's verifyMiddleware), so a guard placed only in createAuthMiddleware would still leave this path throwing.
- `packages/functions/src/handlers/apiV2.js:86` — Third unguarded mount of the identical middleware — same defect family reaches apiv2gen2, confirming the fix belongs in shared middleware, not one handler.
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — The throwing line: `cookies[key] = value` executed on the primitive returned by decryptText, in a "use strict" module.
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns JSON.parse's result unchecked; `6` is valid JSON so the catch at :28 that would have produced the safe `{error}` object never runs.

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T17:08:38.445Z" AND timestamp<="2026-08-19T17:38:38.445Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T17:08:38.445Z" AND timestamp<="2026-08-19T17:38:38.445Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-19T17:08:38.445Z" AND timestamp<="2026-08-19T17:38:38.445Z" AND logName:"stderr" AND textPayload:"Cannot create property"`

## Job
- analyze rounds: 1
- cost: $2.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
