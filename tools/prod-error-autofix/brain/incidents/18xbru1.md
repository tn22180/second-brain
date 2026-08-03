fingerprint: 18xbru1
service: apisagen2
message: HTTP 500 PUT /apiSa/redirects/resolve
app: SEO
repo: seo
date: 2026-08-02T16:16:15.518Z
status: mr_open
attempt: 1

# SEO · apisagen2 · 18xbru1

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2107

**Root cause.** On a Shopify REST 429, handleResolveRedirectSkipError's update-path catch handler fires an unguarded second REST call — shopify.redirect.delete() — which 429s again; that rejection is not caught, propagates out of the "skip error" helper and out of the Promise.all in redirectController.resolve, and the controller's catch answers HTTP 500.

**Mechanism.** PUT /apiSa/redirects/resolve resolves a batch of 404s with pLimit(2) (redirectController.js:83,447). handleResolveRedirectSkipError builds a NEW Shopify client per item (urlRedirectService.js:56), so shopify-api-node's autoLimit leaky bucket is per-instance and two concurrent items each believe they own the full 2 calls/sec REST budget; maxRetries defaults to 0 (shopifyService.js:58). Shopify answers 'Exceeded 2 calls per second for api client' (37 such lines in 14:00-17:00Z). The update branch catches its own 429 and logs 'UPDATE TARGET URL error' (urlRedirectService.js:63), then its recovery immediately issues shopify.redirect.delete() (urlRedirectService.js:65) with no .catch — that call hits the same exhausted bucket ~124-151ms later and rejects with got's message 'Response code 429 (Too Many Requests)'. Nothing handles it: the catch at urlRedirectService.js:79-81 rethrows, Promise.all in resolve() rejects, and redirectController.js:452-455 logs '[redirectController] Response code 429 (Too Many Requests)' and sets ctx.status = 500. All 3 of the 3 apisagen2 500s in the 3h window map 1:1 to that controller log at exactly request-start + latency (16:05:28.795582+15.035082s -> 16:05:43.831015, delta 0.35ms; 16:05:50.016168+5.800821s -> 16:05:55.818528, delta 1.5ms; 16:06:46.278721+17.458478s -> 16:07:03.741216, delta 4ms), and each is preceded 124ms/124ms/151ms earlier by an 'UPDATE TARGET URL error ... Exceeded 2 calls per second' line — one Shopify REST round-trip, the delete. The CREATE branch's recovery calls only redirectRepository.deleteRedirect (Firestore, urlRedirectService.js:75), so it cannot produce a 429; getShopifyRedirectByPath is excluded because it logs its own '[getShopifyRedirectByPath]' line before throwing (shopifyGraphQlService.js:3097) and no such line exists in the window.

Confidence: `high`

## Code
- `packages/functions/src/services/urlRedirectService.js:65` — shopify.redirect.delete() issued from inside the 429 catch handler with no .catch of its own — the only unguarded Shopify REST call on this path, and the source of the escaping 'Response code 429' rejection
- `packages/functions/src/services/urlRedirectService.js:63` — logs '[urlRedirectService:handleResolveRedirectSkipError] UPDATE TARGET URL error' — the exact line that fires 124-151ms before each 500
- `packages/functions/src/services/urlRedirectService.js:79` — catch {throw e} — the helper named SkipError does not skip a rejection raised inside its own recovery handler
- `packages/functions/src/services/urlRedirectService.js:56` — initShopify(shop) called per item, so shopify-api-node's autoLimit bucket is per-client and gives no cross-item throttling
- `packages/functions/src/controllers/redirectController.js:83` — pLimit(2) — two items in flight, each with its own client and each making 2+ REST calls, exceeding Shopify's 2 calls/sec REST limit
- `packages/functions/src/controllers/redirectController.js:447` — the Promise.all fan-out that a single item's rejection aborts
- `packages/functions/src/controllers/redirectController.js:454` — ctx.status = 500 in the catch that logged '[redirectController] Response code 429 (Too Many Requests)'
- `packages/functions/src/services/shopifyService.js:58` — maxRetries defaults to 0, so no retry-after backoff on a 429

## Evidence
- 3 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-02T14:00:00Z" AND timestamp<="2026-08-02T17:00:00Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-02T14:00:00Z" AND timestamp<="2026-08-02T17:00:00Z" AND logName:"stderr" AND textPayload:"[redirectController] Response code 429"`
- 37 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-02T14:00:00Z" AND timestamp<="2026-08-02T17:00:00Z" AND logName:"stderr" AND textPayload:"Exceeded 2 calls per second"`
- 8 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-02T16:05:49Z" AND timestamp<="2026-08-02T16:05:57Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $4.37
- branch: `fix/prod-seo-18xbru1`
- fix commit: `19447826396159e8ab907413df3ec4bcf360a7a5`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2107
- tests: 785 tests, 9 failing · baseline 9 failing · reproduce test fails without the fix

```
.../src/controllers/redirectController.js          |  8 +-
 .../functions/src/services/urlRedirectService.js   | 99 +++++++++++++++++-----
 2 files changed, 83 insertions(+), 24 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
