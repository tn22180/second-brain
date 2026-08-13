fingerprint: 1iaehe
service: apiSa
message: HTTPError: Response code 402 (Payment Required)
app: AEO
repo: llm-ai-search-seo
date: 2026-08-13T05:30:34.393Z
status: inconclusive
attempt: 1

# AEO · apiSa · 1iaehe

**Outcome.** smoke gate new_failures

**Root cause.** Shopify Admin REST GET /admin/api/2026-XX/shop.json returned HTTP 402 Payment Required for the frozen shop 3bvf1q-ta.myshopify.com, and getStore's catch dumps the raw got HTTPError object with console.log(e) — the Cloud Functions logging agent promotes that stack trace to severity=ERROR and an Error Reporting group, so the prod-error sink alerted on a request that actually returned 200.

**Mechanism.** The apiSa (gen1) invocation at 2026-08-13T05:10:11.818Z logged 'init Shopify 3bvf1q-ta.myshopify.com shpat_...' at 05:10:12.441 (packages/functions/src/services/shopifyService.js:42), then issued one shopify-api-node call whose got timings show start=1786597812484 (05:10:12.484Z), firstByte=164ms, total=244ms, ending in code ERR_NON_2XX_3XX_RESPONSE / 'Response code 402 (Payment Required)'. Shopify returns 402 only when the shop is frozen for an unpaid Shopify bill; it is an upstream account state, not a request defect. The only src call site whose catch prints the bare error object is getStore (packages/functions/src/services/shopifyService.js:113-120): `catch (e) { console.log(e); return {}; }`. Node's util.inspect of a got HTTPError produces exactly the observed shape — three stack lines ending in ' {' followed by `code: 'ERR_NON_2XX_3XX_RESPONSE',` and the `timings: { ... }` dump, which is precisely how the 28 log lines in trace bdc45dd348c28f6fc2b51909024ac937 are split (first stack entry severity=ERROR with an errorGroups id, every continuation line severity=DEFAULT). getStore then returns {} and the handler completes: 'Function execution took 920 ms, finished with status code: 200'. That 200 is why the requests read (httpRequest.status>=500) was empty by definition — the round-1 evidence query could never match. Both getStore callers are apiSa-reachable: shopController.getUserShops (packages/functions/src/controllers/shopController.js:26, inside a Promise.all so the failure is swallowed) and shopController.getStoreData (packages/functions/src/controllers/shopController.js:61, GET /store/:key). Separately and provably from the same trace, initShopify logs the shop's Shopify offline access token in cleartext into Cloud Logging (packages/functions/src/services/shopifyService.js:42) — the token ***REMOVED-SECRET*** for 3bvf1q-ta.myshopify.com is readable in the log line 292ms before the 402.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:117` — getStore's catch is `console.log(e)` — dumps the raw got HTTPError stack + property object, which the GCF gen1 agent promotes to severity ERROR and an Error Reporting group. This is the line that produced the alert.
- `packages/functions/src/services/shopifyService.js:115` — `return await shopify.shop.get()` — the single unguarded Shopify Admin REST call that got answered with 402; no status classification, no 402/401/403 branch.
- `packages/functions/src/services/shopifyService.js:118` — `return {}` — the failure is swallowed, so the request still completes 200 ('finished with status code: 200'). Confirms the alert is not a user-facing failure.
- `packages/functions/src/controllers/shopController.js:26` — getUserShops calls getStore inside Promise.all and only reads storeData?.password_enabled — an apiSa-reachable caller that tolerates {} and returns 200.
- `packages/functions/src/controllers/shopController.js:61` — getStoreData (GET /store/:key, packages/functions/src/routes/api.js:32) is the other getStore caller reachable on apiSa; both funnel through the same swallow-and-dump path.
- `packages/functions/src/services/shopifyService.js:42` — `console.log('init Shopify', shopifyDomain, accessToken)` — writes the shop's shpat_ offline access token in cleartext to Cloud Logging; the token appears verbatim in this incident's own trace.
- `packages/functions/src/helpers/logger.js:24` — logger.error → console.error → stderr → severity ERROR in gen1; the house logger exists and is level-gated, so the bare console.log(e) in getStore is the deviation, not the norm.

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiSa" OR resource.labels.function_name="apiSa" OR resource.labels.job_name="apiSa") AND timestamp>="2026-08-13T04:55:26.671Z" AND timestamp<="2026-08-13T05:25:26.671Z" AND severity>=ERROR`
- 28 matching entries: `trace="projects/seo-on-aeo/traces/bdc45dd348c28f6fc2b51909024ac937"`
- 28 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-13T05:09:30Z" AND timestamp<="2026-08-13T05:11:30Z"`
- 1 matching entries: `resource.labels.project_id="seo-on-aeo" AND textPayload:"Response code 402" AND timestamp>="2026-08-06T00:00:00Z"`

## Job
- analyze rounds: 2
- cost: $8.45
- tests: 119 tests, 7 failing · baseline 6 failing · reproduce check did not pass

```
packages/functions/src/services/shopifyService.js | 10 ++++++++--
 1 file changed, 8 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
