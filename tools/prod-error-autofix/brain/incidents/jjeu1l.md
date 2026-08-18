fingerprint: jjeu1l
service: apigen2
message: HTTP 500 GET /api/settings
app: SEO
repo: seo
date: 2026-08-17T22:48:35.523Z
status: inconclusive
attempt: 1

# SEO · apigen2 · jjeu1l

**Outcome.** MR not opened: push_failed

**Root cause.** @avada/core 4.8.2's setSession assigns a property onto whatever decryptText('__session') returns; a browser-presented `__session` cookie that does not decrypt under the hardcoded key yielded the bare number 0, and the strict-mode assignment `cookies['shopifyTopLevelOAuth'] = 1` on a primitive threw TypeError inside auth middleware, 500-ing GET /api/settings before any controller ran.

**Mechanism.** GET /api/settings on apigen2 (revision apigen2-00334-jim, instance 001548f729a0…, 0.2767s, referer https://seo.apps.avada.io/embed/seo-audit/seoOnPage/product/6861821771889) → handlers/api.js:65 mounts createAuthMiddleware for every /api route → middleware/auth.js:33 delegates the unauthenticated request to verifyEmbedRequest(verifyEmbedConfig) → @avada/core verifyToken.js:119 calls setSession(ctx, 1, 'shopifyTopLevelOAuth') on the active-access-token path → cookiesHelper.js:15 does decryptText(ctx.cookies.get('__session')), whose hashHelper JSON.parse of the AES/PKCS7-unpadded plaintext returned the Number 0 instead of an object → cookiesHelper.js:16 `cookies[key] = value` on a primitive under 'use strict' throws "Cannot create property 'shopifyTopLevelOAuth' on number '0'". The stderr stack at 22:39:11.817Z carries exactly those frames (cookiesHelper.js:16 ← verifyToken.js:119 ← step/next/fulfilled) and is 279 ms before/after the single 500 request log at 22:39:11.538Z on the same instance — one request, one cause. Identical to already-recorded fingerprints 2t79bo / luol15 / h9cev0 (MRs 2104 / 2095 open, unmerged); the guard commits 509846c266 and aa66d16bc5 exist only on fix/prod-seo-luol15 and fix/prod-seo-16mt589, not on master, so the defect is still live in the deployed bundle.

Confidence: `high`

## Code
- `packages/functions/src/middleware/auth.js:33` — createAuthMiddleware hands every unauthenticated /api request to verifyEmbedRequest(verifyEmbedConfig) — the middleware whose setSession call throws; the __session guard belongs here
- `packages/functions/src/handlers/api.js:65` — apigen2 mounts createAuthMiddleware ahead of the router, so the fault is route-agnostic — /api/settings only happened to be the request in flight
- `packages/functions/src/handlers/api.js:79` — the api.on('error') logger that emitted the '[api] undefined GET /api/settings 500 …' stderr line matched in this window; shopID is undefined because ctx.state.user was never populated (crash is pre-auth)

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-17T22:24:37.380Z" AND timestamp<="2026-08-17T22:54:37.380Z" AND textPayload:"shopifyTopLevelOAuth"`
- 1 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-17T22:24:37.380Z" AND timestamp<="2026-08-17T22:54:37.380Z" AND httpRequest.status>=500`
- 6 matching entries: `resource.labels.project_id="avada-seo" AND timestamp>="2026-08-16T00:00:00Z" AND textPayload:"Cannot create property" AND textPayload:"shopifyTopLevelOAuth"`

## Job
- analyze rounds: 1
- cost: $5.18
- fix commit: `03d8c9ef6b1cb20e642a3593e6042a5655debbb8`
- tests: 1117 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/middleware/auth.js | 31 +++++++++++++++++++++++++++++++
 1 file changed, 31 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
