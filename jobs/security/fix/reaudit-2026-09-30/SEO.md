# SEO security re-audit — 2026-09-30

Repo: `projects/Falcon/seo`. Target ref: `v1.86.48` (`736d7236c47`, == `origin/master`).
Fix branch `fix/security-high-2026-09` merged via `3730cd8c2cb`; first tag containing it: `v1.86.45`
(confirmed `git merge-base --is-ancestor 3730cd8c2cb v1.86.45` → yes, `v1.86.44` → no).
Sources: `jobs/security/fix/verify/SEO.md` (47 real rows / 23 groups), `jobs/security/fix/02-seo.md`
(Progress, rounds 1–4 + Task 14). Method: read-only `git show`/`git grep`/`git log` against the two
refs, no checkout. No credential values printed.

**Counts (23 original groups + Task 14 + 2 extra rotate-only items from the brief's "Tuan làm tay"):**
- **Fixed: 18** (G3, G4, G5, G7, G8, G9, G10, G11, G12, G13, G14, G17, G19, G21, G22, G23, Task 14, history-detail-IDOR/unlockSpeed)
- **Still-open (by design/deferred, documented): 4** (G1, G2, G6, G16)
- **Partially (documented partial, not a regression): 2** (G18, G20)
- **Regressed: 0**
- **New still-open finding (pre-existing, never in the original 47 rows, narrowed but not closed by phase 4): 1** — `firestore.rules` `featureReq`/`commentFeatureReq` `update`/`delete`, see bottom of "New findings".
- **New high-severity issues introduced in v1.86.45..v1.86.48: 0** (everything touching the audited classes — auth bypass, cross-shop IDOR, shop-doc writes from body, credit/quota free paths, secrets in code/logs — in that commit range is itself a fix, not a new bug)

This re-audit ran as 6 parallel read-only sub-agents covering disjoint groups, cross-checked against
each other and against two direct independent reads of `firestore.rules`, `ssrfGuard.js`, and
`httpFunctions.js`/`vpcSettings.js`. Two sub-agents wrote overlapping earlier drafts of this file
(git-show/grep only, no destructive git ops); this version merges both, keeping every distinct
finding either one surfaced.

## Row-by-row (23 groups)

| Group | Verdict | file:line | Evidence |
|---|---|---|---|
| G1 committed-credentials | 🔴 still-open (by design — awaiting Tuan rotate, task 11 skipped) | `.npmrc:1`, `.yarnrc.yml:12`, `packages/functions/.npmrc:1`, `commands/testAuth.js:14`, `helpers/trello/addCardToTrello.js:5-7` | All 5 still literal committed values at v1.86.48. Not code-fixable — rotation only. |
| G2 bigquery-shops-no-filter | 🔴 still-open (needs-migration, untouched) | `extensions/firestore-bigquery-export.env:4,20` | `COLLECTION_PATH=shops`, `TRANSFORM_FUNCTION=...cloudfunctions.net/handler` unchanged. `git log v1.86.45..v1.86.48 -- extensions/firestore-bigquery-export.env` = empty. |
| G3 firestore-rules-generatebulk-open | ✅ fixed, superseded by a much larger rewrite | `firestore.rules` (whole file) | Task 12 (`6b7650ade9f`) closed generateBulk items to 4 fields; then a separate later phase ("C2", `30f7ad9c495`/`c6c15c06c0b`/`ae25d3ba97a`) rewrote the **entire file** around `isShop()`/`shopOf()`. `generateBulk` + `items`: `write: if false` outright now. New `GET /realtime-token` (`c8926af1f35`) mints a Firestore custom token bound to `getCurrentShop(ctx)` (session shop, not client input) — reviewed, no bypass. `featureReq`/`commentFeatureReq`/`statsSpeedReq` still cross-shop **readable by design** (shared board, comment in rules says so explicitly) — matches phase4-status.md's documented residual, not a bug. **But `update`/`delete` on `featureReq`/`commentFeatureReq` (`firestore.rules:140-148`) have a real gap — see new finding at the bottom, not previously catalogued.** |
| G4 cli-token-plaintext-log | ✅ fixed | `commands/getAccessToken.js:6` | `logger.debug` replaced by `process.stdout.write`, comment explains why. |
| G5 ai-credit-unvalidated-input | ✅ fixed (4 rounds) | `helpers/aiCredit/clientCreditGuard.js`, `repositories/shopRepository.js` (`reduceCredits`, `incrementAIUsage`), `controllers/creditCartController.js`, `handlers/pubsub/subscribeGenFaq.js` | `AICreditQuota`/`AIUsage` stripped at every client entry point (`stripFieldPaths`, dotted-key-safe); `reduceCredits` is a Firestore transaction against the live doc, clamps ≥0, invalidates `shop:*` cache after every charge (r4 fix for the "spent credit revives from stale cache" bug); `faqCreditCost()` shared for price+prompt. Later commits `ccdc76edd35`/`0a1caef699c`/`e708a0a9768` (all after v1.86.45) are further hardening (idempotent credit-pack grant, refund-to-correct-pool, Timestamp bug) — none reopen a free-credit path. |
| G6 integration-key-not-bound-to-shop | 🔴 still-open (BLOCKED, deferred to FAL-720) | `middleware/validateAccessToken.js:11-44` | Unchanged: resolves integration via `getIntegrationKey(accessToken)` alone; `X-SEO-Shop-Domain` only format-checked via `veryShopifyDomain`, never compared to `integration.shopId`. Confirmed still open — cross-app key (in `avada-components` FE bundle) makes binding a breaking migration. |
| G7 integration-key-create-and-blogapp-leak | ✅ fixed | `controllers/integrationKeyController.js`, `controllers/blogAppIntegrationController.js` | `createOne` takes `shopId` from session; `blogApp/keys` GET+POST gated DevZone-only. |
| G8 unauthenticated-proxy-routes | ✅ **fixed, including the two rows the brief left BLOCKED** | `routes/proxy.js`, `controllers/revertController.js` | `republish`/`updateObfucate` → `requireInternalKey` (DevZone-only, audited). `get-jsonl-data/:id` and `revert-product/:id` (previously BLOCKED — unknown extension auth capability) now sit behind `verifySessionToken` (Shopify App Bridge JWT, `aud` checked) + `resolveOwnedShop()` cross-checks `:id`'s shop against the token's shop, 403 on mismatch (`be17ff7660f`, `9c096d8a177`). `/file-id` route dropped. `/optimize/start` also gated (`c310de0065a` — turns out it had *zero* real auth before, saved only by an accidental 500). **Discrepancy:** `jobs/2026-09-30-security-phase4-status.md` (dated today) still lists MR !2320 "C7" as Draft/blocked-on-extension — that doc is stale against master; the fix is already merged and tagged in v1.86.48. Flag to reconcile the tracking doc, not a code gap. |
| G9 shopid-query-override | ✅ fixed | `controllers/seoController.js` `get()`, `controllers/subscriptionController.js` `getSubscription()` | Both use `getCurrentShop(ctx)` only, no `?shopId=` read. |
| G10 settings-not-redacted | ✅ fixed | `controllers/shopController.js:135`, `controllers/subscriptionController.js` | `getShopProxy` wraps in `redactSettings(settings)`. |
| G11 analysis-doc-missing-ownership-check | ✅ fixed | `controllers/analysisController.js:389,567,750,920` | All 4 handlers (+ MCP `resolveTarget.js:11`, `sidekick-preview.service.js` ×3, `services/updateAnalysisResource.js:27`) call `isAnalysisOwnedByShop(id, shopID)` before returning/writing. |
| G12 id-keyed-doc-missing-shop-check | ✅ fixed | `historyOptimizeController`, `historyRepository.revertByListImageLogId`, `sitemapRepository.bulkUpdateSitemap` | Fixed per task 7. **Plus** a distinct sibling bug the brief's task list separately names ("history detail IDOR"): `POST /api/history/detail` spread `ctx.req.body` after session `shopId`, letting a body `shopId` read another shop's history — fixed in `9f5115c88fd`, now destructures only `objectId`/`typeSelected` from the body. |
| G13 pubsub-trusts-payload-shop | ✅ fixed (1 of 2, 2nd intentionally unchanged) | `handlers/pubsub/subscribeBulkAuditFixApplyProduct.js:34-38` | `job.shopID !== shopID` → logged + returns. `subscribeExportBrokenUrls.js` left as-is: sole publisher is session-scoped, `email` is a legitimate merchant-editable field — documented, not a bug. |
| G14 resetgen2-public-destructive | ✅ fixed | `handlers/reset.js` | DevZone-only internal key required (`key.devZone !== true` → 403) before `revert-all`/`reset-history`; every accepted call now audit-logged (`recordInternalKeyUse`, hardened further in `0a6ca6efaf1`). |
| G15 lighthouse-ssrf-public | ✅ fixed (4 rounds) | `helpers/security/ssrfGuard.js`, `controllers/lightHouseController.js` | `assertSafeUrl` + expanded private-IP ranges (CGNAT 100.64/10, 198.18/15, IPv6, 224/4+) + `guardPageRequests()` Chrome request-interception (blocks private-IP navigation/subresource/iframe/redirect) + per-audit-per-host lookup cache with 2s timeout + WebSocket constructor blocked. **Accepted residual (documented, not a regression):** DNS-rebinding TOCTOU, service-worker realm, iframe `about:blank` — explicitly ticketed as needing an infra egress firewall, not code-fixable. |
| G16 internal-redis-cache-shared-secret | 🔴 still-open (BLOCKED) | `handlers/internalTools.js`, `handlers/exports/httpFunctions.js:97` | `internalGen2` export has **no `ingressSettings`** key at all — still public-internet reachable, gated only by `X-Internal-Token` constant-time compare. Blocked because `speed-up-report` (different GCP project) and a hosting rewrite both need it reachable. Mitigating factor did improve since the original finding: the integration-key cache (task 10) and the blog-app-key cache (`71674ca966b`, new) no longer hold credentials, so a dump/inspect leak is less damaging than at audit time — but the endpoint itself is unchanged. |
| G17 block-user-req-no-ownership | ✅ fixed | `featureReq/featureReq.controller.js` | `blockId` dropped from body, session shop only. **Plus** a related but distinct body-trust bug in the same file found and fixed by phase4: `createCommentFeatureReq` let any merchant post as "Avada team" (verified badge) via `isTeamAvada: true` in the body — now derived from `canAccessDevZone(session)` (`a709ff24831`). Not in the original 23-group brief; flagging as a same-class finding that's already closed. |
| G18 secret-in-url-querystring | 🟡 partially (documented partial, by design) | `middleware/swaggerAuth.js:13`, `services/lightHouseService.js` | `Authorization: Bearer` now read first; `?accessToken=` kept as fallback — explicitly not removed (external clients, e.g. TS AI support client, still send query param; brief flagged this BLOCKED pending client migration). Lighthouse password moved to headers, stripped from debug log (`ea8f8c75879`). Not a regression — matches the brief's documented partial. |
| G19 avadaservice-leaks-shopdoc | ✅ fixed | `services/avadaService.js:91-128` | `upgradePlan`/`downgradePlan` payload built from `...triggerData` only; `shopData` destructured out and never re-spread. |
| G20 redis-cache-stores-credentials | 🟡 partially, and **better than the brief left it** | `repositories/integrationRepository.js`, `repositories/blogAppIntegrationRepository.js`, `repositories/shopRepository.js` (`getShopById` default path) | Integration-key cache: fixed (sha256 key name, `accessToken` stripped from cached value). Blog-app-key cache (`blogappkey:<name>`): the brief explicitly left this un-fixed ("xử lý khi rotate") — now **also fixed** by a later commit `71674ca966b`, sha256 key + token stripped, same pattern. Shop-doc cache (`getShopById` no-fields path): still caches the full doc including plaintext `accessToken` — confirmed unchanged (round 2 of task 10 reverted the strip because live callers on worker boxes without `accessTokenKey` env need it) — still-open/BLOCKED exactly as documented. |
| G21 reload-param-echoes-fields | ✅ fixed | `repositories/shopRepository.js` `updateShopData` | `reload` destructured after `blockFields`/`privilegedFields` stripping; only picks from already-filtered `pickFields`-safe set — token cannot echo back. |
| G22 creditcart-no-charge-verification | ✅ fixed | `controllers/creditCartController.js` `activateCart`/`activateCreditBundle` | Queries Shopify `appPurchaseOneTime{status,test}` via the shop's own token before crediting; `status !== 'ACTIVE'` → no credit; test charges restricted to `TEST_EMAIL_DOMAINS` (`@avada.io` etc.) matching `shop.email`; pending→active transition is a Firestore transaction (`activateCreditBundle`) so concurrent redirects can't double-credit. The "shop.email spoofable?" open design question from 02-seo.md ("Hỏi Tuan") is unchanged — still a question, not a regression. |
| G23 triggercron-unrestricted-dispatch | ✅ fixed | `controllers/seoController.js` `triggerCron` | `TRIGGER_CRON_ALLOWED = {recursive: ['build_sitemap']}` whitelist; only `action` forwarded, body `data` no longer spread; rate limit unchanged from task 13. |
| Task 14 (merchant shop-write gaps, added 2026-09-23) | ✅ fixed | `helpers/aiCredit/clientCreditGuard.js` (`matchesFieldPath`/`stripFieldPaths`), `controllers/shopController.js` `setStatus` | Dotted-key bypass of `blockFields`/`privilegedFields` closed (first-segment matching). `imageOptimizeFreeUsage` re-merge removed. 4 image-quota fields moved to `privilegedFields`. `POST /api/shop/status` now forwards only `{appStatus}` (was: raw body straight into `updateAppStatus` — the worst gap found, merchant could set `plan`/`noLimit`/`AICreditQuota`/`email`). `POST /shop/unlockSpeed` — brief's fix pass had applied `stripCreditFields`; a later commit (`9f5115c88fd`) **removed the route entirely** (no FE caller existed), which is the cleaner resolution and supersedes the interim fix. |

## Blocked / follow-up items — status check

| Item | Brief status | Now (v1.86.48) |
|---|---|---|
| T1 `get-jsonl-data`/`revert-product` (external extension, unknown auth) | 🚧 BLOCKED | ✅ **Resolved** — `verifySessionToken` + ownership check landed (`be17ff7660f`, `9c096d8a177`). See G8 discrepancy note above re: stale status doc. |
| T3 G16 `internalGen2` ingress-internal | 🚧 BLOCKED | 🔴 Still blocked, unchanged — no `ingressSettings` on the export. |
| T5 G6 bind key↔shop (FAL-720) | 🚧 BLOCKED (migration) | 🔴 Still blocked, unchanged — deferred to FAL-720 as planned. |
| T9 drop `?accessToken=` fallback | 🚧 BLOCKED (external client) | 🟡 Still blocked, unchanged — Bearer preferred, query fallback stays. |
| T10 G20 shop-cache plaintext token | 🚧 BLOCKED (worker box env) | 🔴 Still blocked, unchanged — confirmed via current `getShopById`. |
| Ticket: reduce-credit self-reported `amount` | Noted, not fixed | Unchanged — still client-reported after AI already ran (ticketed, not in scope). |
| Ticket: egress firewall for lighthouse rebinding | Noted, not fixed | Unchanged — infra-level, ticketed. |
| Ticket: `altTextModel` not in `privilegedFields` | Noted, not fixed | Not independently re-checked this pass (low severity, cost-only). |
| Rotate: npm token / Google OAuth secret / Trello key+token (G1) | Chờ Tuan | Still literal in repo — **not rotated**. |
| Rotate: `SHOPIFY_ACCESS_TOKEN_KEY` (`fixProBackToFree.js:95`) | Outside TSV, known | Still hardcoded at that line, unrotated. |
| Rotate: `MCP_OAUTH_SECRET` (weak) | Outside TSV, known | Code only references `process.env.MCP_OAUTH_SECRET` (fine); actual secret strength not verifiable from git — per `jobs/2026-09-30-security-phase4-status.md`, still on the "chờ quyết/rotate" list, unrotated. |

## New findings — scan of `v1.86.45..v1.86.48` (26 commits) for the same vuln classes

No regressions and no new unfixed high-severity issues of the audited classes (auth bypass, cross-shop
IDOR, shop-doc writes from request body, credit/quota free paths, secrets in code/logs). Everything
touching those surfaces in this range is itself a fix:

- `0f689850c10` **fix(security): deny client Storage access, actually deploy storage.rules** — the
  Storage catch-all allowed any Firebase Auth session (any shop, via the standalone custom-token
  sign-in) to read/write any other shop's files; `storage.rules` was never wired into `firebase.json`
  so nothing had ever deployed it. Both fixed. Not in the original 23-group brief — same class
  (cross-shop IDOR) as G3/G12, found by the wider phase4 pass.
- `a028fd869a5` **fix(security): drop 'changeme' Elasticsearch password fallback** — same class as G1
  (weak/default credential), not in the original brief.
- `a709ff24831`, `c310de0065a`, `9f5115c88fd`, `71674ca966b`, `0a6ca6efaf1` — see G17/G8/G12/G20 rows
  above, all fixes.
- `76ef45bedac`, `d625b7e1244` — JSON-LD XSS (unescaped merchant fields in structured data) — different
  vuln class (storefront injection, not this audit's IDOR/auth/credit scope) — fixed, not deep-verified
  in this pass.
- `40a039593a1`, `91a411a8a7a`, `3bf5841b5bd`, `1ed8908e177`, `a318a79496d` — ordinary FAL-ticket feature
  work (audit scoring, sitemap variant IDs, 404 report, recursive image chain) touching neither auth nor
  shop-write surfaces; not security-relevant.

### Genuine still-open finding — not a regression, never previously catalogued

`firestore.rules:140-148`:
```
match /featureReq/{document} {
  allow read: if request.auth != null;
  allow update: if isVoteToggle() || isStandaloneSession();
  allow delete: if isStandaloneSession();
}
match /commentFeatureReq/{document} {
  allow read: if request.auth != null;
  allow update: if isVoteToggle();
  allow delete: if isStandaloneSession();
}
```
`isStandaloneSession()` only checks that the Firebase Auth token carries a non-null `shopID` claim —
it never compares that `shopID` to `resource.data.shopId`. Any shop with a standalone (non-embedded)
login can, straight through the Firestore JS SDK with no backend involved, **update any field of any
other shop's `featureReq` doc and delete any other shop's `featureReq` or `commentFeatureReq` doc.**
Same root cause as G17 (block-user-req-no-ownership), but at the rules layer, so it fully bypasses the
G17 backend fix in `featureReq.controller.js`.

Not a `v1.86.45→v1.86.48` regression — it predates the fix branch and was worse before phase 4
(`allow update/delete: if request.auth != null`, satisfied even by the anonymous-ish embedded/affiliate
realtime token). The original audit's task-12 log already flagged the sibling symptom ("Cùng pattern:
featureReq, commentFeatureReq vẫn read, write: if true") but it never became a numbered TSV row, so no
fix task was ever assigned to it. Phase-4 commit `ae25d3ba97a` (2026-09-29) narrowed it — closed
anonymous access and closed realtime-token access — and its own comment documents the residual as a
conscious choice: "There is no staff claim, so that is any standalone shop, not only Avada." Real
design call, not an oversight, but it is a live cross-tenant destructive-write path today. Worth a FAL
ticket: add `resource.data.shopId == shopOf()` (or a real staff claim) to both `update`/`delete` rules —
same shape as the G9/G17 point-fixes already shipped, mechanical.

## Notes for Tuan

1. **`jobs/2026-09-30-security-phase4-status.md` is stale against master.** It lists MR !2320 (C7:
   revert/jsonl session token) and !2337 (C2: rules shop-scoping) as still Draft/pending. Both are
   already merged and tagged in `v1.86.48` under different commit hashes than the MR numbers suggest
   (`be17ff7660f`/`9c096d8a177` for C7, `30f7ad9c495`/`c6c15c06c0b`/`ae25d3ba97a` for C2 rules). Worth a
   5-minute pass to reconcile that doc before using it to plan next steps — it's currently telling you
   less is fixed than actually is.
2. Rotation is the only thing blocking G1 fully closing — nothing else needs code.
3. G6 and G16 are the two remaining code-level opens, both correctly deferred (FAL-720 migration;
   cross-project ingress dependency) rather than skipped by oversight.
