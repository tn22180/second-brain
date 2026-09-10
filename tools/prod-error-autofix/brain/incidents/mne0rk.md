fingerprint: mne0rk
service: apigen2
message: HTTP 500 GET /api/analysis-count
app: SEO
repo: seo
date: 2026-09-10T04:39:52.410Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · mne0rk

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The browser presented a `__session` cookie whose AES/JSON decryption yields a primitive number instead of an object, and @avada/core 4.8.2's setSession assigns `cookies['shopifyTopLevelOAuth'] = 1` onto that primitive under "use strict", throwing `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '0'` inside verifyEmbedRequest — before any SEO controller runs.

**Mechanism.** GET /api/analysis-count?page=product enters the api handler chain, where shopifyCharge is given `verifyMiddleware: verifyEmbedRequest(verifyEmbedConfig)` (packages/functions/src/handlers/api.js:59). verifyToken's active-token branch calls `setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME)` (node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119). setSession does `var cookies = decryptText(ctx.cookies.get('__session'), 'avada-session-identifier')` then `cookies[key] = value` (cookiesHelper.js:15-16). decryptText returns `JSON.parse(bytes.toString(Utf8))` with no shape check (hashHelper.js:25), so when the decrypted plaintext is the bare JSON token `0` (or `5`), `cookies` is the primitive Number 0. cookiesHelper.js is compiled with `"use strict"` at line 1, so property creation on a primitive throws instead of silently no-op'ing. The throw propagates to the app's unhandledError handler, which answers 500 — logged 04:37:52.154252Z `[unhandledError] GET /api/analysis-count 500 Cannot create property 'shopifyTopLevelOAuth' on number '0'`, stack frame `setSession (/workspace/node_modules/@avada/core/build/helpers/cookiesHelper.js:16:18)`.

Confidence: `high`

## Code
- `packages/functions/src/handlers/api.js:59` — app wires verifyEmbedRequest(verifyEmbedConfig) as shopifyCharge's verifyMiddleware — the entry point of the failing chain for every /api/* route
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` on the decryptText result; exact frame in the prod stack (cookiesHelper.js:16:18)
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — `setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME)` — the call site in the prod stack (verifyToken.js:119:56)
- `node_modules/@avada/core/build/helpers/hashHelper.js:25` — decryptText returns raw JSON.parse output with no object check, so a plaintext of `0` produces the primitive Number that setSession then writes to

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-10T04:22:54Z" AND timestamp<="2026-09-10T04:52:54Z" AND httpRequest.status>=500`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-10T04:22:54Z" AND timestamp<="2026-09-10T04:52:54Z" AND logName:"stderr" AND textPayload:"shopifyTopLevelOAuth"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-10T04:22:54Z" AND timestamp<="2026-09-10T04:52:54Z" AND httpRequest.status>=500 AND httpRequest.userAgent:"GSA/437.4"`

## Job
- analyze rounds: 1
- cost: $1.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
