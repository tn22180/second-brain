fingerprint: ltehtg
service: api
message: [genImage] sHld18fSnVQ08lSv4N7S Error generateImageToShopifyCDN Error: 400 The response was filtered due to the prompt triggering our content management policy.
app: BLOG
repo: blogs
date: 2026-09-13T10:57:14.358Z
status: fix_disabled
attempt: 1

# BLOG · api · ltehtg

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** OpenRouter answered the muse-image generation call with a non-retryable HTTP 400 content-policy rejection ("The response was filtered due to the prompt triggering our content management policy"), and nothing on the /api/ai-image path classifies a provider 4xx as a bad-input outcome — generateOpenRouterImage rethrows it, generateAndUploadImages propagates it, and genImage's blanket catch turns every throw into HTTP 500.

**Mechanism.** POST /api/ai-image (routes/api.js:253 → genImageAIController.genImage) → generateAndUploadImages (imageGeneration.service.js:83) → generateImagesWithAI → generateOpenRouterImage (imageGeneration.service.js:23) → singleCall's client.post('/images') (openrouter/image.js:82) throws an openai APIError with status 400. isRetryable (openrouter/image.js:12-16) only accepts 429/5xx/retryableEmptyImage, so line 86 rethrows on attempt 0 — the 2.515s request latency confirms no retry backoff (1s+2s+4s) ever ran. The error unwinds to genImage's catch (genImageAIController.js:62-68), which logs at logger.error and sets ctx.status = 500 with e.message, so a merchant prompt Shopify/the provider refuses to render is reported to the browser and to the prod-error sink as a server fault.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genImageAIController.js:64` — blanket catch sets ctx.status = 500 for every throw, including a provider 400 caused by merchant prompt content
- `packages/functions/src/controllers/genImageAIController.js:63` — emits the alerted line '[genImage] sHld18fSnVQ08lSv4N7S Error generateImageToShopifyCDN' at severity ERROR
- `packages/functions/src/services/openrouter/image.js:86` — fail-fast rethrow of the raw openai APIError for any non-retryable status, with no content-filter classification
- `packages/functions/src/services/openrouter/image.js:15` — isRetryable returns false for status 400, which is why the 400 surfaced on attempt 0 (matches the 2.5s latency, no backoff)
- `packages/functions/src/services/imageGeneration.service.js:23` — generateImagesWithAI awaits generateOpenRouterImage with no try/catch, so the 400 passes straight through
- `packages/functions/src/services/imageGeneration.service.js:83` — generateAndUploadImages — the frame named in the prod stack between generateImagesWithAI and the controller
- `packages/functions/src/routes/api.js:253` — the alerted endpoint POST /api/ai-image maps to genImageAIController.genImage

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-13T10:39:45Z" AND timestamp<="2026-09-13T11:09:45Z" AND severity>=ERROR AND "generateImageToShopifyCDN"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-13T10:39:45.845Z" AND timestamp<="2026-09-13T11:09:45.845Z" AND httpRequest.status>=500`
- 26 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-13T10:39:45.845Z" AND timestamp<="2026-09-13T11:09:45.845Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
