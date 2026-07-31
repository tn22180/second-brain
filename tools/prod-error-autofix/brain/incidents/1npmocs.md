fingerprint: 1npmocs
service: api
message: [genIdeas] 6cUY7hUk2E65eCHRZEHG SyntaxError: Unexpected token 'I', "I need a ""... is not valid JSON
app: BLOG
repo: blogs
date: 2026-07-31T12:46:12.920Z
status: deferred
attempt: 1

# BLOG · api · 1npmocs

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** genIdeas requests a plain-text completion (getCompletion default format='text', no zodSchema), so nothing constrains the model to JSON and nothing checks the reply, and the controller then bare JSON.parse's it — whenever the model answers in prose the request dies with SyntaxError and returns an empty idea list.

**Mechanism.** POST /api/gen-ai-blog/ideas → genAIBlogController.genIdeas (src/controllers/genAIBlogController.js:506). It builds the prompt at :510 and calls genAIBlogService.generate(prompt, GPT_4_1_MINI, false) at :511. generate (src/services/genAIBlogService.js:36) forwards only {content, aiModel, isStream} to getAIResponse (src/services/aiService.js:25), which calls openAiService.getCompletion({content, model, isStream}) — no `format`, no `zodSchema`. In getCompletion, format therefore defaults to 'text' (src/services/openAi.service.js:98), so the request goes out with response_format {type:'text'} and needsJsonParse is false at :145. That flag gates the whole truncation/JSON-validity guard at :169 (isJsonCompletionIncomplete + MAX_TRUNCATION_RETRIES retry + CompletionTruncatedError), so on this path the raw string is returned unchecked. genIdeas strips a markdown fence at :513 and calls JSON.parse at :514. The alert's completion began "I need a " — conversational prose, not JSON — so JSON.parse throws and the catch at :521 logs `[genIdeas] 6cUY7hUk2E65eCHRZEHG SyntaxError: Unexpected token 'I', "I need a ""... is not valid JSON` and answers 200 {success:false, data:[]}. Prod confirms the shape: all 6 genIdeas failures in 24h are SyntaxError, 5 of them start with prose ("I need a ", "The provid" ×2, "It looks l", "Since the ") across 6 distinct shops, and the 6th is `Unterminated string in JSON at position 881` — a truncation the guard would have caught had needsJsonParse been true. Sibling handler genSuggested on the same controller does it right (format:'json_object' + zodSchema, :222-223, :235-236, :251-252, :271-272), which is why only genIdeas fails this way.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:511` — genIdeas calls generate() with no format and no zodSchema — request leaves as an unconstrained text completion
- `packages/functions/src/controllers/genAIBlogController.js:514` — bare JSON.parse on the raw completion — the throw site in the alert stack (deployed lib line 532)
- `packages/functions/src/controllers/genAIBlogController.js:521` — catch logs '[genIdeas]' <shopId> <SyntaxError> — the exact alert line
- `packages/functions/src/services/genAIBlogService.js:36` — generate() forwards only content/aiModel/isStream, so a caller cannot set format or zodSchema through it
- `packages/functions/src/services/aiService.js:25` — getAIResponse passes only {content, model, isStream} to getCompletion — format/zodSchema dropped
- `packages/functions/src/services/openAi.service.js:98` — format defaults to 'text' → response_format {type:'text'}; nothing forces the model to emit JSON
- `packages/functions/src/services/openAi.service.js:145` — needsJsonParse is false for text format
- `packages/functions/src/services/openAi.service.js:169` — the isJsonCompletionIncomplete/retry guard is gated on needsJsonParse, so it never runs on the genIdeas path
- `packages/functions/src/controllers/genAIBlogController.js:222` — genSuggested's correct pattern (format json_object + zodSchema) — the contrast that isolates genIdeas
- `packages/functions/src/services/aiPrompts/ideasBlog.js:26` — prompt asks for 'ONLY valid JSON' in words only — the sole JSON constraint on this path, and the model ignores it when it wants to reply in prose

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T10:41:21.124Z" AND timestamp<="2026-07-31T11:11:21.124Z" AND jsonPayload.tag="[genIdeas]"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T11:11:21Z" AND timestamp<="2026-07-31T11:11:21Z" AND jsonPayload.tag="[genIdeas]"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T11:11:21Z" AND timestamp<="2026-07-31T11:11:21Z" AND jsonPayload.tag="[genIdeas]" AND jsonPayload.message:"is not valid JSON"`

## Job
- analyze rounds: 1
- cost: $0.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
