fingerprint: mmdzug
service: apisa
message: [blockLoader] ZeyGA7UaqrZBTQ1cgDW2 blockLoader error: Error: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-04T11:03:58.936Z
status: inconclusive
attempt: 1

# BLOG · apisa · mmdzug

**Outcome.** fix blocked at no_changes

**Root cause.** Duplicate of fingerprint ksxs3b (MR https://gitlab.com/avada/blogs/-/merge_requests/842 open, unmerged): the same uninstalled shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com, accessToken blanked at 2026-08-04T06:10:23.755Z) drove one stale apiSa dashboard load at 09:53:58Z, and on the REST/got path shopifyRetryApi flattens got's HTTPError into `new Error(e)` — dropping response.statusCode — so the 401 cannot be classified as an auth error and getMainThemeId + blockLoader both log it at logger.error, paging the sink.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and blanked the shop's accessToken. apiSa's only gate is verifyRequest(), which never checks install state, so 3h43m later the merchant's still-live standalone session fanned out a full dashboard load — 23 ERROR lines inside 200ms (09:53:58.820Z–09:53:59.020Z), all for ZeyGA7UaqrZBTQ1cgDW2. Every handler calls initShopify (services/shopifyService.js:23-32), which builds the shopify-api-node client with accessToken === '' (line 25 destructures with no empty-string guard), so Shopify answers 401 to every Admin call. Three of those are REST theme.list() via getMainThemeId (services/shopifyService.js:690) → shopifyRetryApi (services/shopifyService.js:141): 401 is not in shopifyRetryError's retryable set, so line 146 does `throw new Error(e)`, stringifying the got HTTPError into a plain Error whose message is 'HTTPError: Response code 401 (Unauthorized)' and which carries neither response.status nor statusCode. getMainThemeId's catch (line 704) therefore logs at logger.error unconditionally — that is the three '[getMainThemeId] HTTPError: Response code 401' lines at .826Z/.932Z/.967Z — and each caller logs the rethrow again: blockLoader (controllers/appBlockController.js:104, the alerted line, .967863Z, stack frames getMainThemeId ← blockLoader match exactly), getEnableBlocks (.933827Z) and settings getOne (.826096Z). Merged commit df79f2e73 added isShopifyAuthError (helpers/api.js:149) but wired it only into shopifyRetryGraphQL (helpers/api.js:156) and getShopLocales — the axios/GraphQL path — leaving the REST path untouched; and even if wired in it would not fire there, because shopifyService.js:146 has already stripped the status. (The 10 '[shopifyRetryGraphQL] AxiosError ... 401' lines still at severity ERROR in this window show the prod bundle also predates that deploy, but that is separate from this alert's path.)

Confidence: `high`

## Code
- `packages/functions/src/controllers/appBlockController.js:104` — blockLoader catch — the exact '[blockLoader] ZeyGA7UaqrZBTQ1cgDW2 blockLoader error: Error: HTTPError: Response code 401' line the alert fired on
- `packages/functions/src/controllers/appBlockController.js:43` — blockLoader's getMainThemeId call — the frame directly above the throw in the alert stack
- `packages/functions/src/services/shopifyService.js:146` — shopifyRetryApi does `throw new Error(e)` on a non-retryable failure, flattening got's HTTPError and losing response.statusCode — why the 401 cannot be classified
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId's catch logs every failure at logger.error, including the expected revoked-token 401 — the '[getMainThemeId] HTTPError: Response code 401' line 126ms before the alert
- `packages/functions/src/services/shopifyService.js:690` — the REST theme.list() call that draws the 401 from Shopify for a shop with a blanked accessToken
- `packages/functions/src/services/shopifyService.js:25` — initShopify destructures accessToken with no empty-string guard, so an uninstalled shop's client sends 'X-Shopify-Access-Token: '
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError, added by merged commit df79f2e73 for the GraphQL path only; reads e?.response?.status ?? e?.statusCode, neither of which survives shopifyService.js:146
- `packages/functions/src/helpers/api.js:159` — shopifyRetryGraphQL's error branch — still emitting 10 ERROR lines for this same 401 burst in the window, showing prod predates the df79f2e73 deploy

## Evidence
- 3 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND jsonPayload.message:"getMainThemeId"`
- 23 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND severity>=ERROR AND jsonPayload.message:"401"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.message:"blockLoader"`

## Job
- analyze rounds: 1
- cost: $1.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
