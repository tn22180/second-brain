fingerprint: alc3jn
service: api
message: [genImage] QXOLRWBxzBs7ECnepRhh Error generateImageToShopifyCDN Error: OpenRouter returned no image data
app: BLOG
repo: blogs
date: 2026-08-12T14:01:37.902Z
status: mr_open
attempt: 1

# BLOG · api · alc3jn

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/868

**Root cause.** OpenRouter answered HTTP 200 for google/gemini-2.5-flash-image with a completion carrying no `choices[0].message.images[0].image_url`, four times in ~6s for the same prompt; parseImage throws 'OpenRouter returned no image data' and discards the response, so genImage returns a bare 500 and nothing in the logs records finish_reason, message.content or resp.error — the empty-200 is real and confirmed, the upstream reason for it is not recoverable from the current instrumentation.

**Mechanism.** POST /api/ai-image at 2026-08-07T09:54:35.361798Z (shop QXOLRWBxzBs7ECnepRhh, referer /embed/blogEditor?type=edit&id=669175972088) ran 13.245481560s and returned 500. genImage → generateAndUploadImages → generateImagesWithAI → generateOpenRouterImage → singleCall: client.chat.completions.create resolved (no `err.status`, so not a 429/5xx path) but parseImage found no `rawUrl` and threw with `retryableEmptyImage: true` (packages/functions/src/services/openrouter/image.js:26). isRetryable returns true on that flag (image.js:13), so the loop re-issued the identical body 3 more times with sleeps 1000+2000+4000ms (image.js:8, image.js:87) — 7s of the 13.245s latency, leaving ~6s for 4 completions, ~1.5s each, all empty. On attempt===MAX_RETRIES the error rethrows (image.js:86), unwinds to genImage's catch, which logs at 09:54:48.607878Z (= 09:54:35.361 + 13.246) and sets ctx.status = 500 (genImageAIController.js:59-60). The catch logs only the Error object; parseImage never captures resp.choices[0].finish_reason, message.content or resp.error, so the log line cannot distinguish a model refusal from a provider-side empty completion.

Confidence: `medium`

## Code
- `packages/functions/src/services/openrouter/image.js:26` — the exact throw in the alert stack — fires whenever message.images[0].image_url is absent, and carries no diagnostic from the 200 response
- `packages/functions/src/services/openrouter/image.js:22` — only path read for image data: choices[0].message.images[0]; a text-only completion yields undefined here
- `packages/functions/src/services/openrouter/image.js:13` — retryableEmptyImage makes an empty 200 retryable, so the identical prompt is re-sent 3 more times
- `packages/functions/src/services/openrouter/image.js:87` — RETRY_DELAYS_MS sleeps 1s+2s+4s = 7s of the observed 13.245s latency
- `packages/functions/src/services/openrouter/image.js:82` — the completions call whose resolved response is dropped on the floor by parseImage
- `packages/functions/src/controllers/genImageAIController.js:59` — the '[genImage] ... Error generateImageToShopifyCDN' log line in the alert; logs the Error only, not the OpenRouter response
- `packages/functions/src/controllers/genImageAIController.js:60` — turns the parse failure into the HTTP 500 seen in the request log

## Evidence
- 1 matching entries: `timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-09T00:00:00Z" AND "no image data"`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-09T00:00:00Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/ai-image"`
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T09:39:50.204Z" AND timestamp<="2026-08-07T10:09:50.204Z" AND severity>=ERROR`
- 26 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T09:39:50.204Z" AND timestamp<="2026-08-07T10:09:50.204Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $3.18
- branch: `fix/prod-blog-alc3jn`
- fix commit: `26c4abd78c4f2322e61405212bcce0029c801851`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/868
- tests: 361 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/controllers/genImageAIController.js        |  4 ++-
 .../functions/src/services/openrouter/image.js     | 38 ++++++++++++++++++----
 2 files changed, 35 insertions(+), 7 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
