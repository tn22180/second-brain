fingerprint: 1agchp0
service: api
message: [unhandledError] POST /api/track-event 500 Cannot create property 'shopifyTopLevelOAuth' on number '2' TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '2'
app: BLOG
repo: blogs
date: 2026-09-21T03:35:19.499Z
status: fix_disabled
attempt: 1

# BLOG · api · 1agchp0

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded BLOG setSession family (1qodvk0 / a3l435 / r6ig4i / skrvtw / 8phfr7, no fix on master): the browser presented a `__session` cookie whose AES/JSON decryption yields the primitive number 2 instead of an object, and @avada/core 4.8.2's setSession does `cookies['shopifyTopLevelOAuth'] = 1` on that Number under strict mode, throwing TypeError before POST /api/track-event ever reaches the event-tracker route.

**Mechanism.** api.js:63 and api.js:90 mount verifyEmbedRequest(verifyEmbedConfig) ahead of every /api/* handler, and setupEventTracker — which registers POST /api/track-event (node_modules/falcon-event-tracker/dist/koa/trackEventRoute.js:13) — is mounted after it at api.js:93, so track-event inherits the embedded-auth middleware. verifyToken loads the session, checkIfActiveAccessToken returns true, and verifyToken.js:119 calls setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME). setSession (cookiesHelper.js:15) reads the `__session` cookie via decryptText = `JSON.parse(AES.decrypt(value,'avada-session-identifier').toString(Utf8))` (hashHelper.js:26) whose catch only covers throw paths; when the decrypted bytes are the single ASCII digit '2', JSON.parse succeeds and returns a Number. cookiesHelper.js:16 then does `cookies[key] = value` on that primitive → `TypeError: Cannot create property 'shopifyTopLevelOAuth' on number '2'`, thrown outside any catch → createErrorHandler emits [unhandledError] + [handleError] Unauthenticated and answers 500 after 0.323s. The alert window holds exactly 1 failed request (execution_id aov2zl7rrivq, span 1795491277872740751, 03:31:42.936Z request log + 2 stderr lines). Client is Shopify Mobile Android 10.2636.0 loading https://avada-blog-app.web.app/embed/blog — the embedded admin webview, i.e. a real merchant session, not a crawler. Over 2026-08-21→09-21 the api service logged 4 such failed requests (POST /api/track-event, GET /api/shops, GET /api/options, and one more), decrypted values all single digits 2/3 — same 0.01%-order rate measured in incident 1qodvk0. master still pins @avada/core 4.8.2 (packages/functions/package.json:20) and packages/functions/src has no `__session` sanitiser (only mcp.const.js:93 declaring CONNECT_COOKIE='__session'), so the fix from 1qodvk0 never shipped. The other 3 errors in the window are unrelated (getShopifyArticleById 'Article not found' on articleController.list, fetchGhConfig 401 warnings, seoProxyApi 401) — different execution_ids, different spans.

Confidence: `high`

## Code
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:16` — `cookies[key] = value` — exact throw site from the stack (cookiesHelper.js:16:18); no check that decryptText returned an object
- `node_modules/@avada/core/build/helpers/cookiesHelper.js:15` — decryptText(ctx.cookies.get('__session')) — the read whose non-object return is assigned to on the next line
- `node_modules/@avada/core/build/helpers/hashHelper.js:26` — `JSON.parse(bytes.toString(Utf8))` returns a Number for a single-digit plaintext; the catch at line 28 only fires on throw, so a scalar passes through
- `node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:119` — setSession(ctx, 1, TOP_LEVEL_OAUTH_COOKIE_NAME) — caller frame verifyToken.js:119:56 in the stack, runs on every verified embedded request with an active token
- `packages/functions/package.json:20` — app still pins @avada/core 4.8.2, the version carrying unguarded setSession
- `packages/functions/src/handlers/api.js:63` — verifyEmbedRequest(verifyEmbedConfig) wired as shopifyCharge's verifyMiddleware — first entry into verifyToken on the api function
- `packages/functions/src/handlers/api.js:90` — second verifyEmbedRequest mount for requests without ctx.state.user; same path into setSession
- `packages/functions/src/handlers/api.js:93` — setupEventTracker(api, …) registers POST /api/track-event after both auth mounts, so the alerted endpoint never runs — the throw is upstream of it
- `packages/functions/src/mcp/mcp.const.js:93` — CONNECT_COOKIE = '__session' — the only other writer of this cookie name in src; latent collision on the same Hosting origin, not proven as this event's trigger

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-21T03:16:46.433Z" AND timestamp<="2026-09-21T03:46:46.433Z" AND jsonPayload.error.message:"shopifyTopLevelOAuth"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T00:00:00Z" AND jsonPayload.message:"[unhandledError]" AND jsonPayload.error.message:"shopifyTopLevelOAuth"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-21T03:16:46.433Z" AND timestamp<="2026-09-21T03:46:46.433Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
