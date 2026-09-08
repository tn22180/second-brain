fingerprint: anhcuz
service: api
message: HTTP 500 POST /api/gen-ai-blog/faqs
app: BLOG
repo: blogs
date: 2026-09-08T02:43:46.554Z
status: fix_disabled
attempt: 1

# BLOG · api · anhcuz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** genFaqsElm JSON.parse's the raw OpenRouter completion, but the request never asks for JSON mode — getPromptAIGenFAQs only shows an "Example JSON" block with no "return JSON only" instruction and genAIBlogService.generate(prompt, GPT_4_1_MINI, false) reaches getCompletion with the default format='text' and no zodSchema — so the Dutch-language completion opened with the prose lead-in "Hier zijn ..." and JSON.parse threw SyntaxError, producing the 500.

**Mechanism.** POST /api/gen-ai-blog/faqs (requestSize 42607 → styleTopic/whole-blog-post branch, language Dutch) → genAIBlogController.js:481 genAIBlogService.generate(prompt, GPT_4_1_MINI, false) → genAIBlogService.js:37 getAIResponse({content, aiModel, isStream:false}) → aiService.js:25 openAiService.getCompletion({content, model, isStream}) with no `format`/`zodSchema`, so openAi.service.js:103 defaults format='text' and no response_format is sent. Model answers plain prose starting "Hier zijn " (Dutch for "Here are"). Controller line 500 strips only ```json fences, which the prose has none of, then line 501 JSON.parse(jsonString) throws `SyntaxError: Unexpected token 'H', "Hier zijn "... is not valid JSON` — stack frame `at genFaqsElm (/workspace/lib/controllers/genAIBlogController.js:522:28)` (lib line = src:501). Catch at src:521-528 sets ctx.status = 500, giving the single logged 500 at 12:35:22.855594Z, latency 3.573s, shop ZjObO8LlMZB6OMfdcfqT, revision api-00167-xow.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:501` — bare JSON.parse of the completion — the throw site; babel lib line 522:28 maps here by symbol genFaqsElm
- `packages/functions/src/controllers/genAIBlogController.js:500` — only strips ```json fences, no repair and no prose-prefix handling
- `packages/functions/src/controllers/genAIBlogController.js:481` — generate(prompt, GPT_4_1_MINI, false) — third arg is isStream, nothing requests JSON output
- `packages/functions/src/controllers/genAIBlogController.js:522` — catch logs the SyntaxError, matching the alerted line verbatim; line 523 sets ctx.status = 500
- `packages/functions/src/services/genAIBlogService.js:37` — generate forwards only {content, aiModel, isStream} — no format/zodSchema ever reaches getCompletion
- `packages/functions/src/services/aiService.js:25` — getAIResponse calls getCompletion without format or zodSchema
- `packages/functions/src/services/openAi.service.js:103` — format defaults to 'text', so no response_format json_object is sent to OpenRouter
- `packages/functions/src/services/getPromptAIGenFAQs.js:44` — styleTopic prompt ends at an unclosed ```json example with no instruction to output JSON only — nothing forbids a prose lead-in

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T12:20:48.866Z" AND timestamp<="2026-09-07T12:50:48.866Z" AND jsonPayload.tag="[genFaqsElm]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T12:20:48.866Z" AND timestamp<="2026-09-07T12:50:48.866Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T12:20:48.866Z" AND timestamp<="2026-09-07T12:50:48.866Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.74

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
