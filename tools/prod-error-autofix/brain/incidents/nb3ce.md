fingerprint: nb3ce
service: apigen2
message: HTTP 500 POST /api/aiChat/faqs
app: SEO
repo: seo
date: 2026-08-04T13:03:44.794Z
status: inconclusive
attempt: 2

# SEO · apigen2 · nb3ce

**Outcome.** fix blocked at agent_failed

**Root cause.** OpenRouter aborted generation (finishReason=error, zero prompt/completion tokens) for google/gemini-2.5-flash-lite on 3 of 9 FAQ completions in the window; getCompletion only retries the SAME model once, and on a second abort throws TruncatedCompletionError, which escapes getFaqs before its existing cross-model fallback to OPENROUTER_GEMINI_3_1_FLASH_LITE_MODEL can run, so getMetaSuggestion turns it into HTTP 500.

**Mechanism.** POST /api/aiChat/faqs -> aiChatController.getMetaSuggestion -> getFaqs -> getCompletion({model: OPENROUTER_GEMINI_2_5_FLASH_LITE_MODEL}) (services/openAI/index.js:415). First send returns finishReason='error' with usage all zeros ('[openAI:getCompletion] faq Model: google/gemini-2.5-flash-lite, Input: 0, Cached: 0, Output: 0'). isTruncatedFinish (index.js:96) is true, so index.js:186 re-sends the SAME chatRequest to the SAME model. The retry also comes back finishReason=error ('non-stop finish after retry ... len=226' / 'len=1015'), errorRef is null for this call site, so index.js:201 throws TruncatedCompletionError. getFaqs' catch (index.js:443) rethrows, so the `if (!parsed)` fallback to OPENROUTER_GEMINI_3_1_FLASH_LITE_MODEL at index.js:426-431 is never reached — it is only reachable when getCompletion RETURNS unparseable text, not when it throws. aiChatController.js:91 then does ctx.throw(500, error.message). Timing lines up exactly: request start 12:16:23.627 + latency 4.110s = throw at 12:16:27.739; request start 12:16:34.920 + 4.744s = throw at 12:16:39.663.

Confidence: `high`

## Code
- `packages/functions/src/services/openAI/index.js:186` — retry re-sends the identical chatRequest to the same resolvedModel — no model/provider switch, so a provider-side abort repeats
- `packages/functions/src/services/openAI/index.js:191` — second isTruncatedFinish check; both prod failures logged '[openAI:getCompletion] non-stop finish after retry ... finishReason=error'
- `packages/functions/src/services/openAI/index.js:201` — throws TruncatedCompletionError because getFaqs passes no errorRef — this is the exception in both stack traces
- `packages/functions/src/services/openAI/index.js:96` — isTruncatedFinish treats any non-'stop' reason, including provider 'error', as truncation
- `packages/functions/src/services/openAI/index.js:415` — the failing call: FAQ generation pinned to OPENROUTER_GEMINI_2_5_FLASH_LITE_MODEL, the model that aborted
- `packages/functions/src/services/openAI/index.js:426` — the cross-model fallback to OPENROUTER_GEMINI_3_1_FLASH_LITE_MODEL is gated on `!parsed`, i.e. only on a returned-but-unparseable string; a thrown TruncatedCompletionError bypasses it
- `packages/functions/src/services/openAI/index.js:444` — getFaqs catch rethrows, propagating the error to the controller
- `packages/functions/src/controllers/aiChatController.js:91` — ctx.throw(500, error.message) converts the TruncatedCompletionError into the alerted HTTP 500 POST /api/aiChat/faqs

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND httpRequest.requestUrl:"/api/aiChat/faqs" AND httpRequest.status=500 AND timestamp>="2026-08-04T12:02:12.978Z" AND timestamp<="2026-08-04T12:32:12.978Z"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T12:02:12.978Z" AND timestamp<="2026-08-04T12:32:12.978Z" AND textPayload:"non-stop finish after retry"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T12:02:12.978Z" AND timestamp<="2026-08-04T12:32:12.978Z" AND textPayload:"TruncatedCompletionError"`
- 9 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T12:02:12.978Z" AND timestamp<="2026-08-04T12:32:12.978Z" AND textPayload:"openAI:getCompletion] faq Model"`

## Job
- analyze rounds: 1
- cost: $1.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
