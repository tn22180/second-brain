fingerprint: 1f5odgw
service: auth
message: InvalidOAuthError: Invalid OAuth callback.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-20T20:02:38.988Z
status: fix_disabled
attempt: 3

# IMG-OPT · auth · 1f5odgw

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop tmbe07-59.myshopify.com fired three /auth OAuth redirects in 49s (19:51:18.557Z state=249303479813608, 19:51:36.035Z state=166671266749668, 19:52:07.072Z state=919500755676649), each overwriting the `state` nonce on the single @avada/core session doc id `offline_tmbe07-59.myshopify.com`; the two callbacks that landed between redirects carried a superseded state and were rejected as InvalidOAuthError with HTTP 400, and packages/functions/src/handlers/auth.js:57 then re-logged that handled 400 as a bare severity=ERROR stack, which is the only reason the prod-error-alerts sink paged.

**Mechanism.** At 19:52:06.990Z execution wxf8c6hn3m6h logged the redirect handler replacing the stored session on one fixed id: old `Session { id: 'offline_tmbe07-59.myshopify.com', state: '166671266749668', updateTime: 2026-09-20T19:51:36.027Z, accessToken: undefined }` → `Session data new Session { id: 'offline_tmbe07-59.myshopify.com', state: '919500755676649' }`, with `Time diff 30933`. The id carries no state/nonce component, so each new redirect clobbers the pending one. Callback wxf8yz93qlc8 at 19:51:38.124Z ran `Start oauth callback` → `After check active shop undefined` → finished 400 in 43 ms; callback wxf8uijcvip4 at 19:51:58.536Z ran the identical two lines → finished 400 in 42 ms. Both ended in ≤43 ms with no Shopify token-exchange line, so rejection happened in @avada/core's local callback validation (shopifyAuthService.js:214) before any network call. The callback that arrived 2.25 s after the newest redirect — vn6c5bnpwzch at 19:52:09.325Z — instead logged `After validate oauth callback tmbe07-59.myshopify.com` and completed the install (302, `Create blank QtH2XnBFGF77pCFgsjUS`), which is the state that had not yet been overwritten. The InvalidOAuthError carries status 400, so Koa answered 400 and emitted it on the app; packages/functions/src/handlers/auth.js:56-57 `app.on('error', err => console.error(err))` wrote the raw stack at severity ERROR ~1.0 s AFTER the request had already finished (19:51:38.164Z response → 19:51:39.243Z log; 19:51:58.575Z response → 19:51:59.583Z log), which is why the second one is mis-attributed to execution_id wxf8uemucl6m — an unrelated chitoroshop.myshopify.com shop-update webhook that returned 200. packages/functions/src/middleware/errorHandler.js:14-17 already classifies <500 correctly as logger.warn, but line 19 emits unconditionally and auth.js:57 has no status gate, so a client-side 400 is escalated to a page. The throw itself is in node_modules (@avada/core build/services/shopifyAuthService.js:214 → @avada/shopify-api dist/error.js:147) and is not fixable in this repo.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/auth.js:57` — `console.error(err)` on the app 'error' event — writes the InvalidOAuthError stack at severity=ERROR with no status gate and no shop/path context, which is the single line that turns a handled HTTP 400 into the paged alert. Runs after the response, explaining the ~1 s lag and the wrong execution_id attribution.
- `packages/functions/src/middleware/errorHandler.js:19` — `ctx.app.emit('error', err, ctx)` fires unconditionally for every caught error, including the <500 branch that lines 16-17 already downgraded to logger.warn — so the severity split at line 14 is defeated by the emit into auth.js:57.
- `packages/functions/src/handlers/auth.js:37` — `shopifyAuth({...})` — the app mounts @avada/core's OAuth router wholesale; the state nonce store keyed `offline_<shop>` and the validation at shopifyAuthService.js:214 live inside that package, so the race is not reachable from this repo's source.

## Evidence
- 2 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-09-20T19:36:52.482Z" AND timestamp<="2026-09-20T20:06:52.482Z" AND severity>=ERROR`
- 9 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-09-20T18:00:00Z" AND timestamp<="2026-09-20T20:30:00Z" AND textPayload:"oauth"`
- 100 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-09-20T19:49:00Z" AND timestamp<="2026-09-20T19:54:00Z" AND NOT textPayload:"shop update webhook" AND NOT textPayload:"Function execution started"`
- 11 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-09-20T19:51:30Z" AND timestamp<="2026-09-20T19:52:05Z" AND (labels.execution_id="wxf8yz93qlc8" OR labels.execution_id="wxf8uijcvip4" OR labels.execution_id="wxf8uemucl6m")`
- 2 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-09-19T20:00:00Z" AND timestamp<="2026-09-20T21:00:00Z" AND textPayload:"InvalidOAuthError"`

## Job
- analyze rounds: 3
- cost: $5.74

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
