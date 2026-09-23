# BLOG security findings — verification

Repo: `projects/Falcon/blogs` · Ref: `origin/master` @ `d1c15544aa79af782836f529a8631d921ac837e2` (2026-09-23)
Judged master only (BLOG deploys by tag; master is ahead of last tag — see `blogs-prod-deploy-by-tag` memory).

**Counts (60 input rows):** real 33 · already-fixed 7 · dup 20 · refuted 0

---

## Row-by-row

| # | file:line | verdict | anchor | group | evidence |
|---|---|---|---|---|---|
| 1 | .npmrc:1 | real | root .npmrc | G1 npm-token | committed `_authToken` for registry.avada.io |
| 2 | .yarnrc.yml:6 | dup of #1 | — | G1 | same token, `npmAuthToken` |
| 3 | firebase.storage.rules:5 | real | `/blog-media/{shopId}/{image}` | G2 open-rules | `allow read, write;` unconditional |
| 4 | firestore.rules:5 | real | `/articles/{articleId}` | G2 open-rules | `allow read: if true; allow write: if true;` |
| 5 | firestore.rules:6 | dup of #4 | — | G2 | same 2-line rule block |
| 6 | SeoLegacyPlanModal.jsx:54 | already-fixed | — | FAL-759 chain | imports `AVADA_SEO_PRO_ACCESS_TOKEN` from `appIntegationKeys.js`, which now reads `process.env.*` (commit 4003e0792, FAL-759). Vite build (`vite.config.js` `EnvironmentPlugin`) does not expose this var to the frontend bundle, so the header ships as `''`, not a live secret. Residual code smell (backend const imported into `@assets`), not exploitable. |
| 7 | clientFetchSSE.js:42 | real | `ClientFetchSSE._debugError` | G3 debug-log-leak | `requestInfo.headers = {...this.headers, ...headers}` (incl. `Authorization: Bearer <token>` when set) passed to `sendDebugError` |
| 8 | debugHelper.js:11 | real | `sendDebugError` | G3 | `Sentry.captureException(error, {extra: context})` — forwards whatever context it's given, no redaction |
| 9 | GoogleAnalyticsConfig.jsx:159 | real | `handleConnectGA.handleMessage` | G4 oauth-no-origin | `handleMessage(event)` never checks `event.origin`; sets `gaData.tokens = data.tokens` from any postMessage |
| 10 | ModalImport.js:189 | real | `ModalImport` component body | G5 console-log-shop | `console.log('shop', shop);` — shop object carries `googleAnalytics.serviceAccountKey` |
| 11 | packages/functions/.npmrc:1 | dup of #1 | — | G1 | identical token, 3rd copy |
| 12 | featureReq.controller.js:88 | real | `POST /featureReqComment` → `createCommentFeatureReq` | G6 isTeamAvada-spoof | `if (data?.isTeamAvada)` branch trusts client-supplied flag, sets `shopOwner: 'Avada team'` with no server-side identity check. Note: the non-team branch uses `getCurrentShop(ctx)` for shopId (session-based, not body) — the "trusts body shopId" part of the claim is inaccurate; only `data.parentId` (a comment/reply target id) is body-trusted, which is a minor separate IDOR (arbitrary counter increment), not shop-scoping. |
| 13 | featureReq.controller.js:158 | real | `POST /block-user-req` → `blockUser` | G7 blockUser-delete | `blockId` from body → `deleteFeatureReqsByShopId(blockId)`, no check that `blockId` belongs to caller |
| 14 | featureReq.controller.js:162 | dup of #13 | — | G7 | same function, same bug |
| 15 | autoTranslateV2.js:7 | already-fixed | — | FAL-759 | now `const GOOGLE_API_KEY = process.env.AUTO_TRANSLATE_GOOGLE_API_KEY; if (!GOOGLE_API_KEY) throw ...` |
| 16 | syncShopsToBigQuery.js:33 | real | one-off backfill script | G8 shop-secrets-to-bq | `keyList = fieldList.filter(k => k.toLowerCase().includes('token'))` — misses nested `googleAnalytics.serviceAccountKey` |
| 17 | changelog.js:11 | real | `changelogTriggers` (Firestore→BQ live trigger) | G8 | `createChangelogTrigger` default project `avada-crm` / dataset `avada_product_raw` (node_modules lib default); no `pickKeys`/`transformRow` set → `generateDefaultRow` ships `data: JSON.stringify(currentData)`, the **whole** shop doc, zero redaction (worse than #16) |
| 18 | appIntegationKeys.js:4 | already-fixed | — | FAL-759 | `process.env.AVADA_SEO_PRO_ACCESS_TOKEN \|\| ''`, guarded by `const/__tests__/committedCredentials.test.js` |
| 19 | authorController.js:199 | real | `DELETE /author` → `remove` | G9 unscoped-id-mutation | `data.map(id => deleteAuthor(id))`, no shop check on `id` |
| 20 | blogAssist.controller.js:49 | real | `POST /blog-assist` → `getCompletions`→`blogAssistService.upsert` | G10 blogAssist-no-shop | `upsert({blogId, assistFor}, content)`: looks up/updates by body `blogId` alone, echoes `previous` content back |
| 21 | blogAssist.controller.js:79 | real | `GET /blog-assist/:blogId/:assistFor` → `getBlogAssistByBlogId` | G10 | same: `blogAssistService.getBlogAssist(blogId, assistFor)`, no shop filter |
| 22 | blogAssist.controller.js:80 | dup of #21 | — | G10 | same function |
| 23 | competitorsController.js:20 | real | `POST /competitors` / `DELETE /competitors` → `add`/`remove` | G11 competitors-global | no auth check beyond session at all; global (not per-shop) Firestore collection, any merchant can add/remove |
| 24 | componentsController.js:58 | real | `PUT /components` → `update` | G9 | `{id, ...rest} = data; updateComponent(id, rest)`, no shop check |
| 25 | componentsController.js:61 | dup of #24 | — | G9 | same function |
| 26 | devZoneController.js:185 | already-fixed | — | dcdd6a27c gate | `update()` gates the entire switch (incl. `set-token`) behind `canAccessDevZone(...) \|\| viaInternal` before reaching any case (commit `dcdd6a27c fix(security): restrict dev zone to CRM login`) |
| 27 | devZoneController.js:188 | dup of #26 | — | same | same case |
| 28 | devZoneController.js:630 | real (reduced scope) | `PUT /dev_zone?type=redis-get` | G12 devzone-redis-unscoped | gated behind `canAccessDevZone` (CRM-login-as or non-prod Avada staff) or internal key — **not** "any merchant" as originally claimed elsewhere, but `redis-get`/`redis-keys` take a raw key/pattern with no scoping to the impersonated shop, so a CRM agent servicing shop A can read shop B's cached doc (incl. `accessToken`) |
| 29 | devZoneController.js:668 | dup of #28 | — | G12 | `redis-get` handler, same code |
| 30 | devZoneController.js:683 | dup of #28 | — | G12 | same |
| 31 | genAIBlogController.js:67 | real | `POST /gen-ai-blog` → `generateBlog` (JSDoc `@deprecated`, still routed) | G13 genaiblog-historyid | `getHistory(historyId)` from body, no shop check before reading/completing |
| 32 | genAIBlogController.js:165 | real | `PUT /gen-ai-blog/:id` → `reGenerateBlog` | G13 | `updateHistoryGenAIBlog(historyId, {status: START})`, no shop check |
| 33 | googleController.js:117 | real | `GET /proxy/google/oauth/callback` → `oauthCallback` | G4 oauth-no-origin | route has no auth middleware; `state` is only `shopId` (no CSRF nonce); `window.opener.postMessage({..., tokens}, "*")` |
| 34 | googleController.js:120 | dup of #33 | — | G4 | same statement |
| 35 | googleController.js:124 | dup of #33 | — | G4 | same |
| 36 | googleController.js:127 | dup of #33 | — | G4 | same |
| 37 | integrationKeyController.js:15 | already-fixed | — | FAL-757 chain | `toPublicKey({id,name,type,createdAt})` whitelist, comment cites FAL-757; `accessToken` no longer returned |
| 38 | integrationKeyController.js:31 | already-fixed | — | FAL-757 chain | `createIntegrationKey({...data, shopId: getCurrentUser(ctx)?.shopID})` — shopId forced from session, comment explains why (FAL-757) |
| 39 | langGraphController.js:42 | real | `POST /langgraph/generate` → `generate` | G14 langgraph-idempotency | `generationId` from body used directly as `idempotencyKey` |
| 40 | langGraphController.js:168 | dup of #39 | — | G14 | same function, `reduceTokens({..., idempotencyKey: generationId})` |
| 41 | settingsController.js:36 | real | `GET /api/settings` → `getOne` | G15 settings-domain-override | `domain` query param overrides `getCurrentShop(ctx)` even when hit via the session-authenticated `/api` router (handler is shared with the legitimately-public `/proxy/settings`) |
| 42 | settingsController.js:94 | real | `PUT /settings` → `update` → `settingsRepository.updateOrCreateByShopId` | G16 settings-shopid-spread | body `data` is spread unfiltered into `postData`; repository does `collection.add({shopId, ...data})` / `.doc(...).update(data)` — a body-supplied `shopId` field **overwrites** the trusted one because it's spread last |
| 43 | settingsController.js:253 | real | `GET /proxy/ai-summary/blogs` → `getBlogs` | G17 ai-summary-blogs-public | route has zero middleware (sibling `/ai-summary/vote/:id` has `validateIpRateLimit`+`validatePlan`); `// test` comment above it in proxy.js suggests leftover debug route |
| 44 | shopController.js:129 | real | `POST /api/shop` → `updateShop` | G18 shop-update-blocklist | `stripBlockedShopFields` uses `blockFields = ['plan','isDevZone','installedAt','isLegacyPlan','pricingVersion']` — blocklist, not allowlist |
| 45 | shopController.js:142 | dup of #44 | — | G18 | same function |
| 46 | shopController.js:321 | real | `POST /api/get-article-customer` → `getBlogCustomer` | G19 getblogcustomer-shopid | `{idBlog, shopId} = ctx.req.body`; loads and reads that shop's article with that shop's own Shopify client |
| 47 | shopController.js:323 | dup of #46 | — | G19 | same function |
| 48 | shopController.js:324 | dup of #46 | — | G19 | same |
| 49 | shopController.js:326 | dup of #46 | — | G19 | same |
| 50 | sidebarAdsController.js:113 | real | `DELETE /sidebarAds` → `remove` | G9 | `data.map(id => sidebarAdsRepo.remove(id))`, no shop check |
| 51 | sidebarAdsController.js:143 | real | `PUT /sidebarAds/:id` → `updateActive` | G9 | `sidebarAdsRepo.update(id, {...data})`, whole body spread, no shop check |
| 52 | codegen.js:7 | real | graphql codegen dev script | G20 codegen-token — **ROTATE** | `ACCESS_TOKEN = process.env.ACCESS_TOKEN \|\| 'shpua_...'` — live-format Shopify Admin token literal fallback |
| 53 | helpers.js:26 | real | `prepareShop()` → `GET /api/shop`, `GET /api/shops` | G21 prepareShop-ga-key | `serviceAccountKey: config.serviceAccountKey \|\| null` re-added to every response |
| 54 | swaggerAuth.js:31 | already-fixed | — | FAL-757 chain | `exchangeToken` now checks `integration.shopId !== shopID → 403` (comment: "Fail closed... until this check existed, any valid key minted a session for any shop") |
| 55 | validateAccessToken.js:44 | real | `validateAccessToken` middleware (`/proxy/shop/blog`, `/proxy/blog/bfcm-sale[/deactivate]`) | G22 validateaccesstoken-unbound | never compares `integration.shopId` to the shop resolved from `X-SEO-Shop-Domain`; concretely exploited by `appProxyController.handleBFCMFromSeoOn`/`deactivateSeoOnFromBfcm`, which trust the header to pick which shop's BFCM plan to downgrade/deactivate |
| 56 | integrationRepository.js:95 | real | `getIntegrationKey` | G23 integration-plaintext | `collection.where('accessToken', '==', accessToken)` — plaintext storage + equality lookup |
| 57 | routes/api.js:295 | already-fixed | — | dcdd6a27c gate | `PUT /dev_zone` route; handler-level gate (see #26) makes the router-level claim false today |
| 58 | routes/proxy.js:18 | already-fixed | — | FAL-757 chain | `POST /swagger-token` → `exchangeToken`, see #54 |
| 59 | crisp.js:6 | already-fixed | — | FAL-759 | `website_id/identifier/key/session_id: process.env.CRISP_* \|\| ''` |
| 60 | youtube.go:45 | real | `POST /proxy/youtube/subtitles` (Go, unauthenticated) | G24 youtube-key-leak — **ROTATE** (precaution) | `hasCaptions` builds URL with `key=<APIKey>` in the query string; if `c.API.Do(req)` errors, Go's `*url.Error.Error()` embeds the full request URL; that string is both logged (`h.log.Error(..., "err", err)`) and returned verbatim as `message` in the JSON response to the anonymous caller |

---

## ROOT-CAUSE GROUPS (real findings only)

**G1 — committed npm registry token** (rows 1,2,11)
Files: `.npmrc:1`, `.yarnrc.yml:6`, `packages/functions/.npmrc:1`.
Fix: rotate the `registry.avada.io` token, purge from git history, inject via CI secret / env instead of committing. **ROTATE.**
No auth-boundary/migration impact.

**G2 — open Firestore/Storage security rules** (rows 3,4,5)
Files: `firebase.storage.rules:5`, `firestore.rules:5-6`.
`articles` (Firestore) and `blog-media/{shopId}` (Storage) allow unconditional read+write. These rules are the boundary for any direct client-SDK access (Firebase Web SDK), independent of the Koa backend's own auth — a caller with the project's public Firebase config can read/write directly, bypassing `/api` entirely.
Fix: scope both to `shopId` (custom claim or a signed token check); confirm no legitimate caller (storefront script, theme extension) needs the current unconditional access before tightening — check for direct Firestore/Storage Web SDK usage in `packages/assets` before changing. `needs-opus` (must verify no live caller depends on the open rule).

**G3 — debug/error logging leaks request headers to console + Sentry** (rows 7,8)
Files: `clientFetchSSE.js:42`, `debugHelper.js:11`.
Fix: redact `Authorization`/`X-SEO-Access-Token`/`X-Shopify-Access-Token` before `sendDebugError` is called, or at minimum inside `sendDebugError` before `Sentry.captureException`.

**G4 — Google OAuth popup: no state/CSRF nonce, no postMessage origin check** (rows 9,33,34,35,36)
Files: `googleController.js` (`auth`, `oauthCallback`), `GoogleAnalyticsConfig.jsx` (`handleConnectGA`).
`state` is just `shopId`, not a random nonce; `oauthCallback` has no session/auth middleware; backend posts tokens via `postMessage(..., "*")`; frontend `handleMessage` never checks `event.origin`. Touches the auth boundary (OAuth token handoff). `needs-opus`.
Fix: generate a signed, session-bound state nonce; validate it on callback; postMessage to the app's own origin, not `"*"`; frontend must check `event.origin === window.location.origin` before trusting the message.

**G5 — console.log of full shop object** (row 10)
File: `ModalImport.js:189`. Trivial: delete the `console.log('shop', shop)` line.

**G6 — isTeamAvada self-attestation** (row 12)
File: `featureReq.controller.js:88`. Fix: derive "Avada team" badge server-side from the authenticated identity (staff/CRM session), never from client body.

**G7 — blockUser cross-shop delete** (rows 13,14)
File: `featureReq.controller.js:158`. Fix: only allow deleting the caller's own feature-request data (`blockId` must equal session shopId, or verify ownership).

**G8 — shop secrets replicated unredacted into BigQuery `avada-crm`** (rows 16,17)
Files: `syncShopsToBigQuery.js:33` (one-off backfill, partial blocklist), `changelog.js:11` (live trigger, **zero** redaction — ships the whole doc via `firestore-bigquery-changelog`'s default `generateDefaultRow`).
Fix: switch both to an explicit allowlist of safe fields (`pickKeys`/`transformRow` on the live trigger; rewrite the `omit` filter in the backfill script). `needs-migration`: the `avada-crm.avada_product_raw` table already holds historical rows with plaintext `accessToken`/`googleAnalytics.serviceAccountKey` — needs a data remediation pass (delete/redact existing rows), not just a code fix.

**G9 — unscoped "mutate Firestore doc by client-supplied id" pattern** (rows 19,24,25,50,51)
Files: `authorController.js:199` (`remove`), `componentsController.js:58/61` (`update`), `sidebarAdsController.js:113` (`remove`), `sidebarAdsController.js:143` (`updateActive`).
This is the single most repeated root cause in the file. Fix: add a shared `assertOwnsDoc(collection, id, shopId)` (or scope every query/update/delete by `shopId` directly) and apply it to all four call sites.

**G10 — blogAssist doc keyed by `blogId` only, no shop field** (rows 20,21,22)
File: `blogAssist.controller.js:49,79,80`.
Fix: add `shopId` to blogAssist documents; filter get/update by `(blogId, shopId)`.

**G11 — global competitor list writable/deletable by any merchant** (row 23)
File: `competitorsController.js` (`add`, `remove`). This is DevZone admin data (per the input's own description) reachable from the general merchant router with no gate at all.
Fix: gate behind the same `canAccessDevZone` check used in `devZoneController.js`, or move under `/dev_zone`.

**G12 — DevZone `redis-get`/`redis-keys` not scoped to the impersonated shop** (rows 28,29,30)
File: `devZoneController.js:735-810`. Reduced severity vs. the raw finding text: requires `canAccessDevZone` (CRM-login-as or non-prod Avada staff) or an internal key, not "any merchant" — that part of the original claim is already fixed (dcdd6a27c). Residual: within that privileged session, the key/pattern isn't restricted to the shop being serviced, so a CRM agent on shop A's ticket can read shop B's cached `accessToken`.
Fix: constrain `redis-keys` pattern and `redis-get` key to the current shop's cache namespace, or require an explicit second confirmation/audit entry for reads (writes already audited via `recordInternalKeyUse`, but only for the internal-key path, not CRM-login-as).

**G13 — genAIBlogController: `historyId` ownership never checked** (rows 31,32)
File: `genAIBlogController.js:67` (`generateBlog`, JSDoc `@deprecated` but still routed at `POST /gen-ai-blog`), `:165` (`reGenerateBlog`, `PUT /gen-ai-blog/:id`).
Fix: load the history doc first, assert `history.shopId === shop.id`. If `generateBlog` is truly dead, remove the route instead of patching it.

**G14 — langGraph idempotency key is client-controlled, financial abuse** (rows 39,40)
File: `langGraphController.js:42,168` (`generate`). `generationId` from body is used verbatim as the Firestore doc id in `tokenDeductions`; replaying the same id skips the token deduction (`tokenRepository.decrementShopTokens` finds the marker and returns `skipped:true`) but the full paid LangGraph blog/image generation pipeline runs unconditionally every time regardless of the marker — unlimited free generations by reusing one `generationId`. Highest-impact real finding in this set (direct $ cost, no privilege needed beyond a normal shop session).
Fix: derive the idempotency key server-side (e.g. hash of `shopId` + a server-minted UUID), never accept the client's value directly as the Firestore doc id.

**G15 — `/api/settings` honors `?domain=` and skips session shop** (row 41)
File: `settingsController.js:36` (`getOne`), shared between `/api/settings` (session) and `/proxy/settings` (intentionally public, storefront-facing).
Fix: split the handler, or make the `domain` override conditional on the request having no authenticated session (`!ctx.state.user`).

**G16 — settingsRepository merges body `shopId` into the settings doc** (row 42)
File: `settingsController.js:94` → `settingsRepository.js` `updateOrCreateByShopId`: `collection.add({shopId, ...data})` and `.doc(id).update(data)` both let a body-supplied `data.shopId` win over the trusted param, since it's spread/merged last. Confirms the original finding via a different mechanism than literally stated (not "controller passes body shopId as primary key" — it's the repository-level object-spread order).
Fix: `collection.add({...data, shopId})` (trusted value last) and strip `shopId` out of `data` before `.update(data)`.

**G17 — `GET /proxy/ai-summary/blogs` unauthenticated, no plan gate** (row 43)
File: `settingsController.js:253` (`getBlogs`), `routes/proxy.js` (`// test` comment above the route, no `validatePlan`/rate-limit unlike its sibling `/ai-summary/vote/:id`).
Fix: add `validatePlan` (or remove if dead test code).

**G18 — `POST /api/shop` blocklist instead of allowlist** (rows 44,45)
File: `shopController.js:129` (`updateShop`) via `stripBlockedShopFields`/`config/pickFields.js` `blockFields`.
Fix: invert to an explicit allowlist of merchant-editable fields.

**G19 — `getBlogCustomer` takes `shopId` from body** (rows 46-49)
File: `shopController.js:321-326` (`getBlogCustomer`, routed at `POST /api/get-article-customer`). Loads an arbitrary shop by body `shopId` and reads its article using that shop's own Shopify token.
Fix: use `getCurrentShop(ctx)`, drop the body `shopId` param (or validate it against session).

**G20 — hardcoded live-format Shopify Admin token in codegen script** (row 52) — **ROTATE**
File: `packages/functions/src/graphql/codegen.js:7`. Same class as the already-fixed FAL-759 items; this one was missed.
Fix: same pattern as `appIntegationKeys.js` — env var required, no literal fallback.

**G21 — `prepareShop()` leaks GA service-account private key** (row 53)
File: `helpers/helpers.js:26`, feeds `GET /api/shop` and `GET /api/shops`.
Fix: drop the `serviceAccountKey` field from the response shape entirely; keep only `isConfigured`.

**G22 — `validateAccessToken` doesn't bind integration key to shop domain** (row 55)
File: `middleware/validateAccessToken.js:11-51`; concretely exploited via `appProxyController.handleBFCMFromSeoOn`/`deactivateSeoOnFromBfcm` (trust `X-SEO-Shop-Domain` header to select which shop's BFCM plan to modify), and `shopifyController.setClient` (lower-sensitivity read). This is the exact bug class FAL-757 already fixed in `swaggerAuth.js` — just not mirrored here. Matches the fleet-wide `integration-key-unbound-fleetwide` pattern (memory: FAL-720 fixed APC; other apps including this one were still open).
Fix: after resolving the integration key, resolve the shop for `X-SEO-Shop-Domain` and assert `integration.shopId === thatShop.id`, same as `swaggerAuth.js:exchangeToken`. Touches auth boundary — `needs-opus` (must audit all three routes behind this middleware for the post-fix behavior, including the already-live BFCM downgrade path).

**G23 — integration keys stored/looked-up in plaintext** (row 56)
File: `repositories/integrationRepository.js:38-58` (`getIntegrationKey`). Hardening item, not an access-control hole post-FAL-757 (binding is enforced at use time now). A Firestore read-access leak would still hand out directly usable keys.
Fix: hash `accessToken` (sha256, matching the MCP token pattern elsewhere in the app) and look up by hash. `needs-migration`: rehash existing keys in place (deterministic hash, no value rotation needed, but every caller path that does `getIntegrationKey(rawToken)` must switch to `getIntegrationKey(hash(rawToken))`).

**G24 — `YOUTUBE_API_KEY` leaks via Go `*url.Error`** (row 60) — **ROTATE** (precaution)
File: `services/proxy-go/internal/youtubex/client.go:92-112` (`hasCaptions`), surfaced at `internal/handler/youtube.go:45-50`. Endpoint `POST /proxy/youtube/subtitles` is unauthenticated by design (storefront caller) — that part is fine; the key leak on upstream failure is the bug.
Fix: don't log/return `err.Error()` verbatim for errors that can wrap the request URL; construct a generic message, or move the API key out of the URL into a header if the YouTube Data API supports it.

---

## Public-endpoint / "does a legitimate caller need this public" check

- `GET/POST /proxy/*` routes are the storefront-facing surface by design (theme extension, scripttag) — `/proxy/settings`, `/proxy/post-information`, `/proxy/tags`, `/proxy/posts-by-tag`, `/proxy/protect-content` are meant to be public and unauthenticated; not flagged.
- `GET /proxy/ai-summary/blogs` (G17) looks like leftover test code riding on the same public prefix without the sibling route's gates — flagged.
- `GET/POST /proxy/google/*` (G4) must be reachable without a merchant session (Google's own redirect), but needs the state-nonce + origin-check fixes independent of that.
- `POST /proxy/swagger-token` and `POST /proxy/youtube/subtitles` are intentionally public entry points (external key exchange / storefront youtube embed) — already-fixed for swagger-token (G-n/a), real leak for youtube (G24) is incidental (error-message hygiene), not "should this be public."
- Firestore/Storage rules (G2) aren't a route at all — flagged separately as a direct-SDK exposure.

---

## Committed credentials — ROTATE (type only, no values)

| file:line | type |
|---|---|
| `.npmrc:1` | private npm registry auth token (registry.avada.io) |
| `.yarnrc.yml:6` | same token, `npmAuthToken` field |
| `packages/functions/.npmrc:1` | same token, 3rd copy |
| `packages/functions/src/graphql/codegen.js:7` | Shopify Admin API access token (shpua_ format) |

(Already-fixed, no longer literals in the tree: SEO integration tokens in `appIntegationKeys.js`, Crisp REST identifier/key/session in `crisp.js`, Google Translate API key in `autoTranslateV2.js` — all moved to env vars under FAL-759, guarded by `const/__tests__/committedCredentials.test.js`.)
