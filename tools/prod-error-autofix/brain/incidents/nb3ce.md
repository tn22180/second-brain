fingerprint: nb3ce
service: apigen2
message: HTTP 500 POST /api/aiChat/faqs
app: SEO
repo: seo
date: 2026-08-12T19:21:15.585Z
status: inconclusive
attempt: 3

# SEO · apigen2 · nb3ce

**Outcome.** smoke gate new_failures

**Root cause.** POST /api/aiChat/faqs returned 500 because getFaqs' prompt builder issues Shopify Admin REST/GraphQL calls through a client built by initShopify with maxRetries=0, so a single Shopify HTTP 429 during shop mFj0dHJo5mj7F4xebT8j's concurrent bulk-FAQ run propagated straight out as an unretried HTTPError.

**Mechanism.** Request log: POST /api/aiChat/faqs starts 2026-08-12T03:23:09.684437Z, latency 0.300185s. aiChatController.getMetaSuggestion dispatches type 'faqs' -> getFaqs(request, shop) (aiChatController.js:73). getFaqs calls initShopify(shop) (openAI/index.js:436), which defaults to maxRetries=0 (shopifyService.js:63) — autoLimit is only an in-process leaky bucket, it does not retry a 429 the server actually returned. The prompt builder then fires a bare Shopify call (getPromptCollection: shopify.metafield.list at metaData.js:168, shopify.graphql at :178 — same unguarded shape in getPromptPage :222/:229, getPromptProduct :279/:286, getPromptArticle :417). got's own timings in the logged error give start=1786504989868 (03:23:09.868), end=1786504989984 (03:23:09.984), firstByte 113ms, total 116ms, code ERR_NON_2XX_3XX_RESPONSE, 'Response code 429 (Too Many Requests)'. getFaqs' catch logs and rethrows (openAI/index.js:458-459) at 03:23:09.984505Z; getMetaSuggestion's catch logs at 03:23:09.984716Z and does ctx.throw(error.status || 500) (aiChatController.js:91) — got's HTTPError carries no .status (status is on e.response.statusCode), so the 429 is remapped to 500 — and errorHandler logs '[unhandledError] POST /api/aiChat/faqs 500 Response code 429' at 03:23:09.985326Z, matching request start 03:23:09.684 + 0.300185s = 03:23:09.984 to the millisecond. The 429 is not isolated: the same shop generated 65 tagged Shopify-429 error lines in the 30-minute window (31 [getStructuredSetting], 15 [getCount], 11 [getCollection], 4 [getBlogList], 1 [openAI:getFaqs], 1 [getMetaSuggestion], 1 [api], 1 [unhandledError]) while running a bulk collection-FAQ job (repeated '[reduceCredits] mFj0dHJo5mj7F4xebT8j with action: faqs and amount: 5' + '[updateAnalysis] collection'), i.e. the merchant's own bulk traffic saturated the Shopify REST bucket and the single-resource endpoint had no retry to absorb it. This is a different cause from the previously recorded nb3ce triage (OpenRouter finishReason=error / TruncatedCompletionError): that path now has the FAQ_ATTEMPTS ladder at openAI/index.js:376-379 and openAI/index.js:406-431, and the one truncation-retry line in this window ('non-stop finish, retrying once ... len=1115' at 03:32:10.822) recovered and charged credits at 03:32:13.209 — it did not produce a 500.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults maxRetries=0, so the client never retries a Shopify 429 — autoLimit only paces outbound calls in-process
- `packages/functions/src/helpers/openAI/metaData.js:168` — getPromptCollection's shopify.metafield.list — bare REST call, no shopifyRetryApi wrapper; a 429 here rejects the whole request
- `packages/functions/src/helpers/openAI/metaData.js:178` — getPromptCollection's shopify.graphql — same unguarded call, the other 429 candidate on this 116ms got request
- `packages/functions/src/services/openAI/index.js:436` — getFaqs builds the Shopify client with default options, inheriting maxRetries=0
- `packages/functions/src/services/openAI/index.js:458` — the '[openAI:getFaqs] mFj0dHJo5mj7F4xebT8j Response code 429' line logged at 03:23:09.984505Z
- `packages/functions/src/services/openAI/index.js:459` — getFaqs rethrows the 429 to the controller instead of retrying or classifying it
- `packages/functions/src/controllers/aiChatController.js:73` — the faqs handler that invokes getFaqs on this route
- `packages/functions/src/controllers/aiChatController.js:91` — ctx.throw(error.status || 500) — got's HTTPError has no .status (it is e.response.statusCode), so a Shopify 429 is reported to the merchant as HTTP 500
- `packages/functions/src/services/shopifyService.js:485` — shopifyRetryApi already implements 429/430/502/503 backoff (via shopifyRetryError at :465) and is the wrapper this path is missing

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND httpRequest.requestUrl:"/api/aiChat/faqs" AND httpRequest.status=500`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND textPayload:"[openAI:getFaqs]"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND textPayload:"[getMetaSuggestion]"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:22:00Z" AND timestamp<="2026-08-12T03:24:00Z" AND textPayload:"[unhandledError]"`
- 126 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND textPayload:"429 (Too Many Requests)"`
- 10 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND textPayload:"with action: faqs and amount: 5"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-12T03:08:12.280Z" AND timestamp<="2026-08-12T03:38:12.280Z" AND textPayload:"non-stop finish"`

## Job
- analyze rounds: 1
- cost: $3.99
- tests: 921 tests, 7 failing · baseline 6 failing · reproduce check did not pass

```
.../functions/src/controllers/aiChatController.js  |  2 +-
 packages/functions/src/helpers/openAI/metaData.js  | 39 +++++++++++++---------
 2 files changed, 25 insertions(+), 16 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
