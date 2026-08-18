fingerprint: 1qodvk0
service: api
message: [unhandledError] GET /api/shopify/block 500 Cannot create property 'shopifyTopLevelOAuth' on number '4' TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '4'
app: BLOG
repo: blogs
date: 2026-08-17T21:55:59.670Z
status: inconclusive
attempt: 1

# BLOG · api · 1qodvk0

**Outcome.** MR not opened: push_failed

**Root cause.** @avada/core 4.8.2's setSession assumes decryptText('__session') always returns an object; when the cookie decrypts to a bare JSON scalar (a single ASCII digit), `cookies[key] = value` throws TypeError in strict mode and every embedded /api/* request on that browser 500s.

**Mechanism.** verifyEmbedRequest (wired at packages/functions/src/handlers/api.js:61) runs verifyToken; on an active access token it calls cookiesHelper.setSession(ctx, 1, 'shopifyTopLevelOAuth') (verifyToken.js:119). setSession reads the `__session` cookie through hashHelper.decryptText, which is `JSON.parse(CryptoJS.AES.decrypt(value, 'avada-session-identifier').toString(Utf8))` (node_modules/@avada/core/build/helpers/hashHelper.js:26). Garbage/foreign ciphertext normally throws inside that try and returns `{error}` — harmless. But crypto-js PKCS7-unpads random plaintext, and when the surviving byte is a single ASCII digit, JSON.parse succeeds and returns a Number. cookiesHelper.js:16 then does `cookies['shopifyTopLevelOAuth'] = 1` on a Number under "use strict" → `Cannot create property 'shopifyTopLevelOAuth' on number '4'`, thrown outside any catch → errorHandler logs [unhandledError] and answers 500 Unauthenticated. Measured with the repo's own crypto-js: 71 of 500000 random 64-hex cookie values decrypt to a bare scalar (0.0142%), and every one of the 71 was a single digit 0-9 — matching the prod values observed ('0', '2', '4'). What wrote the non-core value into `__session` is not in the logs; MCP's connect flow writes a raw 64-hex secret into that same cookie name on the same Hosting host (mcp.oauth.controller.js:101), but the mcp service logged zero traffic in the alert window and this error predates the MCP merge, so that is a latent aggravator, not this event's trigger.

Confidence: `high`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — exact throw site in the stack (cookiesHelper.js:16:18); no guard that decryptText returned an object
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — decryptText returns raw JSON.parse of the decrypted bytes, so a scalar plaintext yields a Number instead of an object
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — the caller frame at verifyToken.js:119:56 in the stack
- `packages/functions/package.json:20` — app pins @avada/core 4.8.2, the version carrying the unguarded setSession
- `packages/functions/src/handlers/api.js:61` — verifyEmbedRequest(verifyEmbedConfig) mounted on the api function — every /api/* route enters verifyToken here; fix (cookie sanitiser) belongs before this at api.js:50
- `packages/functions/src/routes/api.js:192` — GET /shopify/block → shopifyController.getEnableBlocks, the alerted endpoint; it never runs — failure is in the auth middleware upstream of it
- `packages/functions/src/mcp/mcp.oauth.controller.js:101` — MCP connect writes a raw hex secret into the same `__session` cookie on the same Hosting host (firebase.json rewrites /mcp/** and /api/** to one origin) — latent collision that will make this class of failure, and silent admin-session wipes, far more frequent; not the trigger for this event

## Evidence
- 11 matching entries: `timestamp>="2026-07-19T00:00:00Z" AND "Cannot create property"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-17T21:24:51.649Z" AND timestamp<="2026-08-17T21:54:51.649Z" AND severity>=ERROR`
- 2 matching entries: `timestamp>="2026-08-10T00:00:00Z" AND textPayload:"shopifyTopLevelOAuth" OR jsonPayload.message:"shopifyTopLevelOAuth"`

## Job
- analyze rounds: 1
- cost: $6.64
- fix commit: `e1cd02d20c0b9f4cca573216b23e792e3fc925d0`
- tests: 390 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/api.js   | 2 ++
 packages/functions/src/handlers/apiV2.js | 2 ++
 2 files changed, 4 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
