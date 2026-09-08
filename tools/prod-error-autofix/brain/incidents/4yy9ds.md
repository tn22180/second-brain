fingerprint: 4yy9ds
service: api
message: [genFaqsElm] ZjObO8LlMZB6OMfdcfqT error genFaqsElm SyntaxError: Unexpected token 'H', "Hier zijn "... is not valid JSON
app: BLOG
repo: blogs
date: 2026-09-08T02:41:59.078Z
status: fix_disabled
attempt: 1

# BLOG · api · 4yy9ds

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** genFaqsElm asks OpenRouter for a plain-text completion (getCompletion default format='text', no zodSchema) and then bare JSON.parse's the reply, so when the model prefixed its FAQ array with a Dutch prose sentence ("Hier zijn …") the controller threw SyntaxError and POST /api/gen-ai-blog/faqs returned 500.

**Mechanism.** POST /api/gen-ai-blog/faqs (routes/api.js:266) → genAIBlogController.genFaqsElm. At genAIBlogController.js:481 it calls genAIBlogService.generate(prompt, GPT_4_1_MINI, false); generate (genAIBlogService.js:36) forwards only {content, aiModel, isStream} to getAIResponse (aiService.js:25), which calls openAiService.getCompletion({content, model, isStream}) with no `format` and no `zodSchema`. In getCompletion, format defaults to 'text' (openAi.service.js:103) so response_format resolves to {type:'text'} (openAi.service.js:124) and needsJsonParse is false (openAi.service.js:164) — the JSON-validity/retry guard (isJsonCompletionIncomplete → stripMarkdownFence + safeParseJsonCompletion, openAi.service.js:84) is skipped and the raw string is returned unchecked. Nothing in the prompt forbids a preamble: getPromptAIGenFAQs (getPromptAIGenFAQs.js:9) only shows an "Example JSON" fence and asks for FAQs in ${language}, so for language=Dutch the model answered "Hier zijn …" (Dutch for "Here are …") before the JSON. genFaqsElm strips only the ```json fence at genAIBlogController.js:500 and calls bare JSON.parse at :501, which throws `SyntaxError: Unexpected token 'H', "Hier zijn "... is not valid JSON`; the catch at :522 logs the exact alert line and sets ctx.status = 500 at :523. Log tie is one-to-one: the single 500 request starts 2026-09-07T12:35:22.855594Z with latency 3.573197792s → ends 12:35:26.428Z, the exact timestamp of the [genFaqsElm] error entry. Same defect family as recorded incident j3krke (genIdeas), different handler — sibling genSuggested does it correctly with format:'json_object' + zodSchema.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:481` — genFaqsElm calls generate() with no format/zodSchema — request goes out as a plain text completion
- `packages/functions/src/controllers/genAIBlogController.js:500` — strips only the ```json fence; a prose preamble survives
- `packages/functions/src/controllers/genAIBlogController.js:501` — bare JSON.parse on the raw completion — the throw site in the alert stack (lib line 522)
- `packages/functions/src/controllers/genAIBlogController.js:522` — catch logs '[genFaqsElm]' <shopId> 'error genFaqsElm' <SyntaxError> — the exact alert line
- `packages/functions/src/controllers/genAIBlogController.js:523` — same catch sets ctx.status = 500 — the 500 on POST /api/gen-ai-blog/faqs
- `packages/functions/src/services/genAIBlogService.js:36` — generate() forwards only content/aiModel/isStream — no way to set format or zodSchema
- `packages/functions/src/services/aiService.js:25` — getAIResponse passes only {content, model, isStream} to getCompletion
- `packages/functions/src/services/openAi.service.js:103` — format defaults to 'text' → response_format {type:'text'}, nothing constrains the model to JSON
- `packages/functions/src/services/openAi.service.js:164` — needsJsonParse=false on the text path, so the isJsonCompletionIncomplete/retry guard never runs
- `packages/functions/src/services/openAi.service.js:84` — the existing stripMarkdownFence + safeParseJsonCompletion guard that this call path bypasses
- `packages/functions/src/services/getPromptAIGenFAQs.js:9` — prompt only shows an 'Example JSON' block and asks for output in ${language} — never forbids a prose preamble
- `packages/functions/src/routes/api.js:266` — route registration mapping POST /gen-ai-blog/faqs → genAiBlogController.genFaqsElm

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-07T12:20:48.837Z" AND timestamp<="2026-09-07T12:50:48.837Z" AND jsonPayload.tag="[genFaqsElm]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-07T12:35:00Z" AND timestamp<="2026-09-07T12:36:00Z" AND httpRequest.requestUrl:"/api/gen-ai-blog/faqs"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-08T00:00:00Z" AND timestamp<="2026-09-08T00:00:00Z" AND jsonPayload.tag="[genFaqsElm]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-08T00:00:00Z" AND timestamp<="2026-09-08T00:00:00Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/gen-ai-blog/faqs"`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
